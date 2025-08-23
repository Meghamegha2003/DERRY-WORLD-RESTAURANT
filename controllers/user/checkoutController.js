const mongoose = require('mongoose');
const Cart = require("../../models/cartSchema");
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");
const Offer = require("../../models/offerSchema");
const OfferService = require("../../services/offerService");
const { getBestOffer } = require("../../helpers/offerHelper");
const Razorpay = require("razorpay");

// Calculate order totals
exports.calculateOrderTotals = async (cart) => {
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
        // Handle both Mongoose documents and plain objects
        const itemObj = item.toObject ? item.toObject() : { ...item };
        const productObj = itemObj.product?.toObject ? itemObj.product.toObject() : { ...(itemObj.product || {}) };
        
        const bestOffer = await getBestOffer(productObj);
        
        // Attach offer details to product
        productObj.offerDetails = bestOffer;
        
        return {
          ...itemObj,
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

    // Validate and get coupon discount
    let couponDiscount = 0;
    let updatedCart = cart;
    
    // If cart is a plain object, try to get the Mongoose document
    if (cart && typeof cart.save !== 'function') {
      updatedCart = await Cart.findById(cart._id);
      if (!updatedCart) {
        console.error('Cart not found for ID:', cart._id);
        throw new Error('Cart not found');
      }
    }

    if (updatedCart.appliedCoupon && updatedCart.appliedCoupon.code) {
      try {
        const coupon = await Coupon.findOne({
          code: updatedCart.appliedCoupon.code,
          isActive: true
        });

        // Only apply discount if coupon is valid and not expired
        if (coupon && coupon.isValid()) {
          // Recalculate discount to ensure it's still valid
          if (coupon.discountType === 'percentage') {
            couponDiscount = Math.min(
              (subtotal * coupon.discountValue) / 100,
              coupon.maxDiscount || Number.MAX_SAFE_INTEGER
            );
          } else {
            couponDiscount = Math.min(
              coupon.discountValue,
              subtotal
            );
          }
          
          // Update cart with validated coupon info
          updatedCart.appliedCoupon = {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            minPurchase: coupon.minPurchase,
            maxDiscount: coupon.maxDiscount,
            couponId: coupon._id
          };
        } else {
          // Clear invalid coupon
          updatedCart.appliedCoupon = undefined;
          updatedCart.couponDiscount = 0;
        }
        await updatedCart.save();
      } catch (error) {
        console.error('Error validating coupon in checkout:', error);
        // In case of error, remove the coupon
        updatedCart.appliedCoupon = undefined;
        updatedCart.couponDiscount = 0;
        await updatedCart.save();
      }
    }

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

// Helper function to create order
exports.createOrder = async (user, cart, address, paymentMethod, total) => {
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
        paymentMethod === "wallet" ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PENDING,
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

    // Start a database session for atomic operations
    const session = await mongoose.startSession();
    await session.startTransaction();
    
    try {
      // Store coupon info before clearing the cart
      const couponInfo = cart.appliedCoupon ? { ...cart.appliedCoupon } : null;
      
      // Get the cart document with session
      const cartDoc = await Cart.findById(cart._id).session(session);
      
      if (!cartDoc) {
        throw new Error('Cart not found');
      }
      
      // Clear all items and reset values
      cartDoc.items = [];
      cartDoc.appliedCoupon = undefined;
      cartDoc.couponCode = undefined;
      cartDoc.couponType = undefined;
      cartDoc.couponDiscount = 0;
      cartDoc.couponValue = 0;
      cartDoc.total = 0;
      cartDoc.subTotal = 0;
      
      // Save the cart with the session
      await cartDoc.save({ session });
      
      // If there was an applied coupon, update its usage count and check if it's expired
      if (couponInfo && couponInfo.couponId) {
        const coupon = await Coupon.findById(couponInfo.couponId).session(session);
        if (coupon) {
          // Increment the used count
          coupon.usedCount = (coupon.usedCount || 0) + 1;
          
          // If the coupon has reached its usage limit, deactivate it
          if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            coupon.isActive = false;
          }
          
          await coupon.save({ session });
          
          // Debug log
          console.log(`Updated coupon ${coupon.code}: usedCount=${coupon.usedCount}, isActive=${coupon.isActive}`);
        }
      }
      
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();
      
      // Debug log the updated cart
      const updatedCartAfterCommit = await Cart.findById(cart._id);
      console.log('Cart after commit:', JSON.stringify({
        _id: updatedCartAfterCommit._id,
        items: updatedCartAfterCommit.items,
        appliedCoupon: updatedCartAfterCommit.appliedCoupon,
        couponDiscount: updatedCartAfterCommit.couponDiscount,
        couponCode: updatedCartAfterCommit.couponCode,
        couponType: updatedCartAfterCommit.couponType,
        couponValue: updatedCartAfterCommit.couponValue,
        total: updatedCartAfterCommit.total,
        subTotal: updatedCartAfterCommit.subTotal
      }, null, 2));
      
      // Clear the local cart object for any subsequent operations
      cart.items = [];
      cart.appliedCoupon = undefined;
      cart.couponDiscount = 0;
      cart.couponCode = undefined;
      cart.couponType = undefined;
      cart.couponValue = 0;
      cart.total = 0;
      cart.subTotal = 0;
      
    } catch (error) {
      // If anything fails, abort the transaction
      await session.abortTransaction();
      session.endSession();
      console.error('Error in cart cleanup transaction:', error);
      // Don't throw here as the order was already created successfully
    }

    return order;
  } catch (error) {
    throw error;
  }
};

// Process checkout
exports.processCheckout = async (req, res) => {
  const sessionId = Math.random().toString(36).substring(2, 15);
  console.log(`[${new Date().toISOString()}] [${sessionId}] Starting checkout process`);
  
  try {
    const userId = req.user._id;
    const { addressId, paymentMethod } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery address",
      });
    }

    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    const invalidItems = [];
    console.log(`[${sessionId}] Processing ${cart.items.length} items in cart`);
    
    for (const [index, item] of cart.items.entries()) {
      console.log(`[${sessionId}] Processing item ${index + 1}:`, {
        productId: item.product?._id || 'No ID',
        name: item.product?.name || 'No name',
        quantity: item.quantity
      });
      const product = await Product.findById(item.product._id).populate(
        "category"
      );

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
      console.log(`[${sessionId}] Found ${invalidItems.length} invalid items`);
      return res.status(400).json({
        success: false,
        message: `The following items are no longer available: ${invalidItems.join(
          ", "
        )}`,
      });
    }

    // Calculate final order total
    const { total } = await exports.calculateOrderTotals(cart);

    // Process based on payment method
    switch (paymentMethod.toLowerCase()) {
      case "cod":
        const codOrder = await exports.createOrder(user, cart, address, "cod", total);
        
        // Clear the cart after successful order
        const cartCleared = await Cart.findOneAndUpdate(
          { user: user._id },
          {
            $set: {
              items: [],
              couponDiscount: 0,
              couponValue: 0,
              total: 0,
              subTotal: 0,
              updatedAt: new Date()
            },
            $unset: {
              appliedCoupon: "",
              couponCode: "",
              couponType: ""
            }
          },
          { new: true }
        );

        return res.json({
          success: true,
          message: "Order placed successfully",
          orderId: codOrder._id,
          cartCleared: !!cartCleared
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
        const walletOrder = await exports.createOrder(
          user,
          cart,
          address,
          "wallet",
          total
        );
        
        // Clear the cart after successful wallet payment
        const cartCleared = await Cart.findOneAndUpdate(
          { user: user._id },
          {
            $set: {
              items: [],
              couponDiscount: 0,
              couponValue: 0,
              total: 0,
              subTotal: 0,
              updatedAt: new Date()
            },
            $unset: {
              appliedCoupon: "",
              couponCode: "",
              couponType: ""
            }
          },
          { new: true }
        );

        return res.json({
          success: true,
          message: "Order placed successfully using wallet balance",
          orderId: walletOrder._id,
          cartCleared: !!cartCleared
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

          // Create Razorpay order first
          const options = {
            amount: Math.round(total * 100), // Convert to paise
            currency: "INR",
            payment_capture: 1, // Auto capture payment
            notes: {
              userId: user._id.toString(),
            },
          };

          console.log('Creating Razorpay order with options:', JSON.stringify(options, null, 2));
          const razorpayOrder = await razorpay.orders.create(options);
          console.log('Razorpay order created:', JSON.stringify(razorpayOrder, null, 2));

          if (!razorpayOrder || !razorpayOrder.id) {
            throw new Error("Failed to create Razorpay order");
          }

          // Create the order with Razorpay details
          const orderData = {
            user: user._id,
            cart: cart._id, // Store cart ID for reference
            items: cart.items.map(item => ({
              product: item.product._id,
              name: item.product.name,
              quantity: item.quantity,
              price: item.product.salesPrice || item.product.regularPrice,
            })),
            total,
            payment: {
              method: 'online',
              status: 'pending',
              razorpayOrderId: razorpayOrder.id,
              razorpayPaymentId: null, // Will be updated on successful payment
              razorpaySignature: null  // Will be updated on successful payment
            },
            status: 'pending',
            shippingAddress: address._id || address,
            receipt: razorpayOrder.receipt, // Store the exact receipt from Razorpay
            notes: {
              razorpayOrderId: razorpayOrder.id,
              cartId: cart._id.toString(),
              addressId: (address._id || address).toString(),
              userId: user._id.toString()
            },
            createdAt: new Date(),
            updatedAt: new Date()
          };

          console.log('Creating order with data:', JSON.stringify({
            ...orderData,
            items: orderData.items.map(i => ({...i, product: i.product.toString()})),
            user: orderData.user.toString(),
            shippingAddress: '...'
          }, null, 2));

          // Create the order
          const order = new Order(orderData);
          const savedOrder = await order.save();

          try {
            // Update Razorpay order with our order ID
            await razorpay.orders.edit(razorpayOrder.id, {
              ...options,
              receipt: `order_${savedOrder._id}`,
              notes: {
                ...options.notes,
                orderId: savedOrder._id.toString(),
              },
            });
          } catch (error) {
            console.error('Error updating Razorpay order:', error);
            // Continue with the response even if Razorpay update fails
            console.log('Proceeding with order creation despite Razorpay update error');
          }

          return res.json({
            success: true,
            message: "Payment initialized",
            order: {
              id: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency,
              orderId: savedOrder._id,
            },
            key: process.env.RAZORPAY_KEY_ID,
          });
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
    console.error(`[${sessionId}] Error in processCheckout:`, {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      errors: error.errors ? JSON.stringify(error.errors) : 'No validation errors'
    });
    
    // Check for specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }
    
    // Default error response
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process checkout',
      errorId: sessionId
    });
  }
};

// Get checkout page
exports.getCheckout = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    
    // Get cart with populated products and their categories
    let cart = await Cart.findOne({ user: userId })
      .populate({
        path: "items.product",
        populate: {
          path: "category",
          select: "name offer",
        },
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    // Process each item to attach offer details
    const processedItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = item.product;
        if (!product) return null;
        
        const bestOffer = await getBestOffer(product);
        return {
          ...item.toObject(),
          product: {
            ...product.toObject(),
            offerDetails: bestOffer,
            finalPrice: bestOffer.finalPrice
          }
        };
      })
    );

    // Filter out any null items (in case of missing products)
    const validItems = processedItems.filter(item => item !== null);
    if (validItems.length === 0) {
      return res.redirect("/cart");
    }

    // Create a cart-like object for calculateOrderTotals
    const cartForCalculation = {
      ...cart.toObject(),
      items: validItems
    };

    // Get wallet balance
    const wallet = await Wallet.findOne({ user: userId });
    const walletBalance = wallet ? wallet.balance : 0;

    // Calculate order totals including offers
    console.log(`[User: ${userId}] Calculating order totals`);
    const { subtotal, couponDiscount, deliveryCharge, total, items } =
      await exports.calculateOrderTotals(cartForCalculation);
    console.log(`[User: ${userId}] Order totals:`, { subtotal, couponDiscount, deliveryCharge, total });

    // Get the updated cart with the latest coupon info
    const updatedCart = await Cart.findById(cart._id);

    // Calculate cart count (total number of items in cart)
    const cartCount = validItems.reduce((total, item) => total + (item.quantity || 1), 0);

    // Render the checkout page with the necessary data
    res.render('user/checkout', {
      user,
      cart: {
        items: validItems,
        subtotal,
        couponDiscount: updatedCart?.couponDiscount || 0,
        deliveryCharge,
        total,
        appliedCoupon: updatedCart?.appliedCoupon || null
      },
      walletBalance,
      addresses: user.addresses || [],
      cartCount,
      error: null,
      razorpayKey: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    throw error;
  }
};

// ... (rest of the code remains the same)

// Remove coupon
exports.removeCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // Check if there's an applied coupon
    if (!cart.appliedCoupon) {
      return res.status(400).json({
        success: false,
        message: "No coupon applied to remove",
      });
    }

    // Remove coupon from cart
    cart.appliedCoupon = undefined;
    cart.couponDiscount = 0;
    await cart.save();

    // Calculate order totals
    console.log(`[${sessionId}] Calculating order totals`);
    const { subtotal, couponDiscount, deliveryCharge, total } = await this.calculateOrderTotals(cart);
    console.log(`[${sessionId}] Order totals:`, { subtotal, couponDiscount, deliveryCharge, total });
    
    // Return updated cart totals
    res.json({
      success: true,
      message: "Coupon removed successfully",
      cart: {
        subtotal,
        couponDiscount: 0,
        deliveryCharge,
        total,
      },
    });
  } catch (error) {
    console.error("Error in removeCoupon:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove coupon",
    });
  }
};

// Delete address
exports.deleteAddress = async (req, res) => {
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


