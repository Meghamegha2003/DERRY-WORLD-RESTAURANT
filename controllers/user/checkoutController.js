const Cart = require("../../models/cartSchema");
const {
  Order,
  ORDER_STATUS,
  PAYMENT_STATUS,
} = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");
const OfferService = require("../../services/offerService");
const { getBestOffer } = require("../../helpers/offerHelper");
const Offer = require("../../models/offerSchema");
const Razorpay = require("razorpay");

// Calculate order totals
const calculateOrderTotals = async (cart) => {
  try {
    if (!cart || !cart.items || cart.items.length === 0) {
      return {
        subtotal: 0,
        couponDiscount: 0,
        deliveryCharge: 0,
        total: 0,
        items: [],
      };
    }

    // Process each item to get its final price with offers
    const processedItems = await Promise.all(
      cart.items.map(async (item) => {
        const bestOffer = await getBestOffer(item.product);
        // Guarantee product is a full object and offerDetails is attached
        let productObj =
          typeof item.product.toObject === "function"
            ? item.product.toObject()
            : item.product;
        productObj.offerDetails = bestOffer;
        return {
          ...item.toObject(),
          product: productObj,
          finalPrice: bestOffer.finalPrice,
          regularPrice: bestOffer.regularPrice,
          hasOffer: bestOffer.hasOffer,
          offerDiscount: bestOffer.regularPrice - bestOffer.finalPrice,
        };
      })
    );

    // Calculate subtotal based on final prices
    const subtotal = processedItems.reduce(
      (sum, item) => sum + item.finalPrice * item.quantity,
      0
    );

    // Get coupon discount
    const couponDiscount = cart.couponDiscount || 0;

    // Free delivery
    const deliveryCharge = 0;

    // Calculate total
    const total = Math.max(0, subtotal - couponDiscount + deliveryCharge);

    return {
      subtotal,
      couponDiscount,
      deliveryCharge,
      total,
      items: processedItems,
    };
  } catch (error) {
    console.error("Error in calculateOrderTotals:", error);
    throw error;
  }
};

// Get checkout page
const getCheckout = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        select: "offer",
      },
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    // Get wallet balance
    const wallet = await Wallet.findOne({ user: userId });
    const walletBalance = wallet ? wallet.balance : 0;

    // Calculate order totals including offers
    const { subtotal, couponDiscount, deliveryCharge, total, items } =
      await calculateOrderTotals(cart);

    // Calculate total savings
    const totalSavings =
      items.reduce((sum, item) => sum + item.offerDiscount * item.quantity, 0) +
      couponDiscount;

    // Fetch active offers before rendering
    const offers = await Offer.find({ isActive: true });

    res.render("user/checkout", {
      offers,
      user,
      addresses: user.addresses,
      cartCount: cart.items.length,
      cart: {
        subtotal,
        items,
        couponDiscount,
        deliveryCharge,
        total,
        totalSavings,
        appliedCoupon: cart.appliedCoupon?.code || cart.appliedCoupon,
      },
      error: req.query.error || null,
      walletBalance,
      selectedPaymentMethod: req.query.paymentMethod || "",
    });
  } catch (error) {
    console.error("Error loading checkout page:", error);
    res.redirect("/cart?error=" + encodeURIComponent("Something went wrong"));
  }
};

// Get available coupons
const getAvailableCoupons = async (req, res) => {
  try {
    // Find active coupons
    const coupons = await Coupon.find({
      isActive: true,
      startDate: { $lte: new Date() },
      expiryDate: { $gte: new Date() },
      usedCount: { $lt: "$usageLimit" },
    });

    res.json({
      success: true,
      coupons: coupons.map((coupon) => ({
        code: coupon.code,
        discountType: coupon.discountType,
        discountAmount: coupon.discountAmount,
        minimumPurchase: coupon.minimumPurchase,
        maxDiscount: coupon.maxDiscount,
        expiryDate: coupon.expiryDate,
      })),
    });
  } catch (error) {
    console.error("Error in getAvailableCoupons:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch available coupons",
    });
  }
};

// Apply coupon
const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.user._id;

    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: "Please provide a coupon code",
      });
    }

    // Get cart with products
    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    // Find and validate coupon
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired coupon code",
      });
    }

    // Check usage limit
    if (coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: "This coupon has reached its usage limit",
      });
    }

    // Calculate cart subtotal
    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    if (subtotal < coupon.minPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required for this coupon`,
      });
    }

    // Calculate discount using coupon schema method
    let discount = 0;
    try {
      discount = coupon.calculateDiscount(subtotal);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Invalid discount calculation",
      });
    }

    // Save all coupon info to cart.appliedCoupon
    cart.appliedCoupon = {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minPurchase: coupon.minPurchase,
      maxDiscount: coupon.maxDiscount,
      couponId: coupon._id,
    };
    cart.couponDiscount = discount;
    await cart.save();

    // Increment coupon usage
    coupon.usedCount += 1;
    await coupon.save();

    // Return response with complete cart data
    res.json({
      success: true,
      message: "Coupon applied successfully",
      cart: {
        subtotal,
        appliedCoupon: cart.appliedCoupon,
        couponDiscount: cart.couponDiscount,
      },
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({
      success: false,
      message: "Failed to apply coupon",
    });
  }
};

// Remove coupon
const removeCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // Get current coupon to decrement usage
    if (cart.appliedCoupon) {
      const coupon = await Coupon.findOne({ code: cart.appliedCoupon.code });
      if (coupon) {
        coupon.usedCount = Math.max(0, coupon.usedCount - 1);
        await coupon.save();
      }
    }

    // Remove coupon from cart
    cart.appliedCoupon = null;
    cart.couponDiscount = 0;
    await cart.save();

    // Calculate final amounts without coupon
    const totals = await calculateOrderTotals(cart);

    res.json({
      success: true,
      message: "Coupon removed successfully",
      ...totals,
    });
  } catch (error) {
    console.error("Error in removeCoupon:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove coupon",
    });
  }
};

// Process checkout
const processCheckout = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId, paymentMethod } = req.body;

    // Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate address
    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery address",
      });
    }

    // Get cart with populated products
    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    // Validate all products in cart
    const invalidItems = [];
    for (const item of cart.items) {
      const product = await Product.findById(item.product._id).populate(
        "category"
      );

      // Product checks
      if (
        !product ||
        product.isListed === false ||
        product.isBlocked === true
      ) {
        invalidItems.push(item.product.name || "Unknown product");
        continue;
      }
      // Category check: only check isBlocked, not isAvailable
      if (product.category && product.category.isBlocked === true) {
        invalidItems.push(item.product.name || "Unknown product");
        continue;
      }
      // Product availability
      if (product.isAvailable === false) {
        invalidItems.push(item.product.name || "Unknown product");
        continue;
      }
    }

    if (invalidItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following items are no longer available: ${invalidItems.join(
          ", "
        )}`,
      });
    }

    // Calculate final order total
    const { total } = await calculateOrderTotals(cart);

    // Process based on payment method
    switch (paymentMethod.toLowerCase()) {
      case "cod":
        const codOrder = await createOrder(user, cart, address, "cod", total);
        return res.json({
          success: true,
          message: "Order placed successfully",
          orderId: codOrder._id,
        });

      case "wallet": {
        // Use the user's single Wallet document
        let wallet = await Wallet.findOne({ user: user._id });
        if (!wallet) {
          return res.status(400).json({
            success: false,
            message: "Wallet not found. Please add money to your wallet first.",
          });
        }
        if (wallet.balance < total) {
          return res.status(400).json({
            success: false,
            message:
              "Insufficient wallet balance. Please add money to your wallet to complete the purchase.",
          });
        }
        // Deduct from wallet
        wallet.balance -= total;
        wallet.transactions.push({
          type: "debit",
          amount: total,
          description: `Order payment #${wallet._id}`,
          date: new Date(),
          status: "completed",
        });
        await wallet.save();
        // Place order
        const walletOrder = await createOrder(
          user,
          cart,
          address,
          "wallet",
          total
        );
        return res.json({
          success: true,
          message: "Order placed successfully using wallet balance",
          orderId: walletOrder._id,
        });
      }

      case "online":
        try {
          // Validate Razorpay credentials
          if (
            !process.env.RAZORPAY_KEY_ID ||
            !process.env.RAZORPAY_KEY_SECRET
          ) {
            throw new Error("Razorpay credentials not configured");
          }

          // Initialize Razorpay
          const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
          });

          // Create temporary order
          const tempOrder = await createOrder(
            user,
            cart,
            address,
            "online",
            total
          );

          // Create Razorpay order
          const options = {
            amount: Math.round(total * 100), // Convert to paise
            currency: "INR",
            receipt: `order_${tempOrder._id}`,
            payment_capture: 1, // Auto capture payment
            notes: {
              orderId: tempOrder._id.toString(),
              userId: user._id.toString(),
            },
          };

          try {
            const razorpayOrder = await razorpay.orders.create(options);

            if (!razorpayOrder || !razorpayOrder.id) {
              throw new Error("Failed to create Razorpay order");
            }

            return res.json({
              success: true,
              message: "Payment initialized",
              order: {
                id: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                orderId: tempOrder._id,
              },
              key: process.env.RAZORPAY_KEY_ID,
            });
          } catch (razorpayError) {
            console.error("Razorpay order creation error:", razorpayError);
            // Delete the temporary order since Razorpay order creation failed
            await Order.findByIdAndDelete(tempOrder._id);
            throw new Error("Failed to initialize payment. Please try again.");
          }
        } catch (error) {
          console.error("Online payment processing error:", error);
          return res.status(500).json({
            success: false,
            message: error.message || "Failed to process online payment",
          });
        }

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid payment method",
        });
    }
  } catch (error) {
    console.error("Error in processCheckout:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process checkout",
    });
  }
};

// Helper function to create order
const createOrder = async (user, cart, address, paymentMethod, total) => {
  try {
    // Process each item to get its final price with offers
    const orderItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = item.product;
        if (!product) {
          throw new Error("Product not found in cart item");
        }

        // Get the best offer using OfferService
        const offerDetails = await OfferService.getBestOffer(product);

        // Get the quantity and ensure it's a number
        const quantity = Number(item.quantity || 0);

        // Calculate item total using the final price from offer calculation
        const itemTotal = Number(
          (offerDetails?.finalPrice || product.regularPrice) * quantity
        );

        // Safely construct the offer object only if valid offer exists
        const offerObject =
          offerDetails?.hasOffer && offerDetails?.offer
            ? {
                type: offerDetails.offer.type || "regular",
                discountType: offerDetails.offer.discountType || "percentage",
                discountValue: offerDetails.offer.discountValue || 0,
                maxDiscount: offerDetails.offer.maxDiscount || 0,
              }
            : null;

        return {
          product: product._id,
          quantity: quantity,
          price: offerDetails?.finalPrice || product.regularPrice,
          regularPrice: product.regularPrice,
          offerPrice: offerDetails?.hasOffer ? offerDetails.finalPrice : null,
          total: itemTotal,
          status: "Active",
          originalPrice: offerDetails?.regularPrice || product.regularPrice,
          offer: offerObject,
        };
      })
    );

    // Calculate totals
    const subtotal = Number(
      orderItems.reduce((sum, item) => sum + item.total, 0)
    );
    const couponDiscount = Number(cart.couponDiscount || 0);
    const deliveryCharge = subtotal >= 500 ? 0 : 40;
    const orderTotal = Math.max(0, subtotal - couponDiscount + deliveryCharge);

    // Create new order
    const order = new Order({
      user: user._id,
      items: orderItems,
      shippingAddress: {
        addressType: address.addressType || "Home",
        fullName: address.fullName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || "",
        city: address.city,
        state: address.state || "Kerala",
        pincode: address.pincode,
      },
      paymentMethod,
      subtotal,
      couponDiscount: cart.couponDiscount || 0, // Always save couponDiscount from cart
      deliveryCharge,
      total: orderTotal,
      orderStatus: ORDER_STATUS.PENDING,
      paymentStatus:
        paymentMethod === "cod" ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.PAID,
    });

    // Add coupon details if applied
    if (cart.appliedCoupon) {
      order.appliedCoupon = {
        code: cart.appliedCoupon.code,
        discountType: cart.appliedCoupon.discountType,
        discountValue: cart.appliedCoupon.discountValue,
        minPurchase: cart.appliedCoupon.minPurchase,
        maxDiscount: cart.appliedCoupon.maxDiscount,
        couponId: cart.appliedCoupon.couponId,
      };
    }
    // Always save couponDiscount, even if 0
    order.couponDiscount = cart.couponDiscount || 0;

    // Save the order
    await order.save();
    // Reduce product quantity after successful order placement
    for (const item of orderItems) {
      try {
        // Only decrement if quantity is positive
        if (item.quantity > 0) {
          const product = await Product.findById(item.product);
          if (product) {
            // Prevent negative stock
            product.quantity = Math.max(0, product.quantity - item.quantity);
            await product.save();
          } else {
            console.error(
              `[ORDER] Product not found for stock decrement: ${item.product}`
            );
          }
        }
      } catch (err) {
        console.error(
          `[ORDER] Failed to reduce stock for product ${item.product}:`,
          err
        );
      }
    }

    // Clear the cart after successful order creation
    cart.items = [];
    cart.appliedCoupon = null;
    cart.couponDiscount = 0;
    await cart.save();

    return order;
  } catch (error) {
    throw error;
  }
};

// Add new address
const addAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressData = req.body;

    // Validate required fields
    const requiredFields = [
      "fullName",
      "phone",
      "addressLine1",
      "city",
      "state",
      "pincode",
    ];
    const missingFields = requiredFields.filter((field) => !addressData[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Validate phone number
    if (!/^\d{10}$/.test(addressData.phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be 10 digits",
      });
    }

    // Validate pincode
    if (!/^\d{6}$/.test(addressData.pincode)) {
      return res.status(400).json({
        success: false,
        message: "PIN code must be 6 digits",
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check for duplicate address
    const isDuplicate = user.addresses.some(
      (addr) =>
        addr.addressLine1.toLowerCase() ===
          addressData.addressLine1.toLowerCase() &&
        addr.city.toLowerCase() === addressData.city.toLowerCase() &&
        addr.pincode === addressData.pincode
    );

    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: "This address already exists",
      });
    }

    // Set as default if it's the first address
    if (user.addresses.length === 0) {
      addressData.isDefault = true;
    }

    // Add the new address
    user.addresses.push(addressData);
    await user.save();

    res.json({
      success: true,
      message: "Address added successfully",
      address: user.addresses[user.addresses.length - 1],
    });
  } catch (error) {
    console.error("Error in addAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add address",
    });
  }
};

// Edit address
const editAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId } = req.params;
    const updates = req.body;

    // Validate required fields
    const requiredFields = [
      "fullName",
      "phone",
      "addressLine1",
      "city",
      "state",
      "pincode",
    ];
    const missingFields = requiredFields.filter((field) => !updates[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Validate phone number
    if (!/^\d{10}$/.test(updates.phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be 10 digits",
      });
    }

    // Validate pincode
    if (!/^\d{6}$/.test(updates.pincode)) {
      return res.status(400).json({
        success: false,
        message: "PIN code must be 6 digits",
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find the address index
    const addressIndex = user.addresses.findIndex(
      (addr) => addr._id.toString() === addressId
    );
    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    // Check for duplicate address (excluding the current address)
    const isDuplicate = user.addresses.some(
      (addr, index) =>
        index !== addressIndex &&
        addr.addressLine1.toLowerCase() ===
          updates.addressLine1.toLowerCase() &&
        addr.city.toLowerCase() === updates.city.toLowerCase() &&
        addr.pincode === updates.pincode
    );

    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: "This address already exists",
      });
    }

    // Update the address
    Object.assign(user.addresses[addressIndex], updates);
    await user.save();

    res.json({
      success: true,
      message: "Address updated successfully",
      address: user.addresses[addressIndex],
    });
  } catch (error) {
    console.error("Error in editAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update address",
    });
  }
};

// Delete address
const deleteAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId } = req.params;

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find the address
    const addressIndex = user.addresses.findIndex(
      (addr) => addr._id.toString() === addressId
    );
    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    // Check if it's the default address
    const isDefault = user.addresses[addressIndex].isDefault;

    // Remove the address
    user.addresses.splice(addressIndex, 1);

    // If we deleted the default address and there are other addresses,
    // make the first one default
    if (isDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    res.json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete address",
    });
  }
};

module.exports = {
  getCheckout,
  processCheckout,
  calculateOrderTotals,
  applyCoupon,
  removeCoupon,
  getAvailableCoupons,
  addAddress,
  editAddress,
  deleteAddress,
};
