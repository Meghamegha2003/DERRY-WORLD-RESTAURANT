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
const HttpStatus = require('../../utils/httpStatus');

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

    const processedItems = await Promise.all(
      cart.items.map(async (item) => {
        const itemObj = item.toObject ? item.toObject() : { ...item };
        const productObj = itemObj.product?.toObject ? itemObj.product.toObject() : { ...(itemObj.product || {}) };
        
        const bestOffer = await getBestOffer(productObj);
        
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

    const subtotal = processedItems.reduce(
      (sum, item) => sum + item.finalPrice * item.quantity,
      0
    );

    let couponDiscount = 0;
    let updatedCart = cart;
    
    if (cart && typeof cart.save !== 'function') {
      updatedCart = await Cart.findById(cart._id);
      if (!updatedCart) {
        throw new Error('Cart not found');
      }
    }

    if (updatedCart.appliedCoupon && updatedCart.appliedCoupon.code) {
      try {
        const coupon = await Coupon.findOne({
          code: updatedCart.appliedCoupon.code,
          isActive: true
        });

        if (coupon && coupon.isValid()) {
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
          
          updatedCart.appliedCoupon = {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            minPurchase: coupon.minPurchase,
            maxDiscount: coupon.maxDiscount,
            couponId: coupon._id
          };
        } else {
          updatedCart.appliedCoupon = undefined;
          updatedCart.couponDiscount = 0;
        }
        await updatedCart.save();
      } catch (error) {
        updatedCart.appliedCoupon = undefined;
        updatedCart.couponDiscount = 0;
        await updatedCart.save();
      }
    }

    const deliveryCharge = 0;

    const total = Math.max(0, subtotal - couponDiscount + deliveryCharge);

    return {
      subtotal,
      couponDiscount,
      deliveryCharge,
      total,
      items: processedItems,
    };
  } catch (error) {
    throw error;
  }
};

exports.createOrder = async (user, cart, address, paymentMethod, total) => {
  try {
    const orderItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = item.product;
        if (!product) {
          throw new Error("Product not found in cart item");
        }

        const quantity = Number(item.quantity || 0);
        
        if (quantity <= 0) {
          throw new Error(`Invalid quantity for product ${product.productName || product.name}: ${quantity}. Quantity must be greater than 0.`);
        }
        
        if (product.quantity < quantity) {
          throw new Error(`Insufficient stock for product ${product.productName || product.name}. Available: ${product.quantity}, Requested: ${quantity}`);
        }

        const offerDetails = await OfferService.getBestOffer(product);

        const itemTotal = Number(
          (offerDetails?.finalPrice || product.regularPrice) * quantity
        );

        const offerObject =
          offerDetails?.bestOffer
            ? {
                type: offerDetails.bestOffer.type || "regular",
                discountType: offerDetails.bestOffer.discountType || "percentage",
                discountValue: offerDetails.bestOffer.discountValue || 0,
                maxDiscount: offerDetails.bestOffer.maxDiscount || 0,
              }
            : null;

        return {
          product: product._id,
          quantity: quantity,
          price: offerDetails?.finalPrice || product.regularPrice,
          regularPrice: product.regularPrice, 
          offerPrice: offerDetails?.bestOffer ? offerDetails.finalPrice : null,
          total: itemTotal, 
          status: "Active",
          originalPrice: offerDetails?.regularPrice || product.regularPrice,
          offer: offerObject,
        };
      })
    );

    const subtotal = Number(
      orderItems.reduce((sum, item) => sum + item.total, 0)
    );
    const couponDiscount = Number(cart.couponDiscount || 0);
    const deliveryCharge = subtotal >= 500 ? 0 : 40;
    const orderTotal = Math.max(0, subtotal - couponDiscount + deliveryCharge);

   

    const order = new Order({
      user: user._id,
      items: orderItems,
      shippingAddress: {
        addressType: address.addressType || "Home",
        fullName: address.fullName || "Default Name",
        phone: address.phone || "0000000000",
        addressLine1: address.addressLine1 || "Default Address",
        addressLine2: address.addressLine2 || "",
        city: address.city || "Default City",
        state: address.state || "Kerala",
        pincode: address.pincode || "000000",
      },
      paymentMethod: paymentMethod || "cod", 
      subtotal,
      couponDiscount: cart.couponDiscount || 0, 
      totalCoupon: cart.couponDiscount || 0,
      deliveryCharge,
      total: orderTotal,
      totalAmount: orderTotal, 
      orderStatus: ORDER_STATUS.PENDING,
      status: 'Active', 
      paymentStatus:
        paymentMethod === "wallet" ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PENDING,
    });

    if (cart.appliedCoupon) {
      order.appliedCoupon = {
        code: cart.appliedCoupon.code,
        discountType: cart.appliedCoupon.discountType,
        discountValue: cart.appliedCoupon.discountValue,
        minPurchase: cart.appliedCoupon.minPurchase,
        maxDiscount: cart.appliedCoupon.maxDiscount,
        couponId: cart.appliedCoupon.couponId,
      };
      
      const { updateOrderCouponCalculations } = require('../../helpers/couponHelper');
      const coupon = await Coupon.findById(cart.appliedCoupon.couponId);
      await updateOrderCouponCalculations(order, coupon);
    }

    await order.save();
    
    if (paymentMethod === "cod" || paymentMethod === "wallet") {
      for (const item of orderItems) {
        try {
          if (item.quantity > 0) {
            const product = await Product.findById(item.product);
            if (product) {
              product.quantity = Math.max(0, product.quantity - item.quantity);
              await product.save();
            } else {
            }
          }
        } catch (err) {
        }
      }
    }

    try {
      const couponInfo = cart.appliedCoupon ? { ...cart.appliedCoupon } : null;
      
      await Cart.findByIdAndUpdate(cart._id, {
        $set: {
          items: [],
          couponDiscount: 0,
          couponValue: 0,
          total: 0,
          subTotal: 0,
          subtotal: 0,
          updatedAt: new Date()
        },
        $unset: {
          appliedCoupon: "",
          couponCode: "",
          couponType: ""
        }
      });
      
      if (couponInfo && couponInfo.couponId) {
        const coupon = await Coupon.findById(couponInfo.couponId);
        if (coupon) {
          coupon.usedCount = (coupon.usedCount || 0) + 1;
          
          if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            coupon.isActive = false;
          }
          
          await coupon.save();
        }
      }
      
      
    } catch (error) {
    }

    return order;
  } catch (error) {
    throw error;
  }
};

exports.processCheckout = async (req, res) => {
  const sessionId = Math.random().toString(36).substring(2, 15);
  
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
    const itemsToRemove = [];
    
    for (const [index, item] of cart.items.entries()) {
      
      if (!item.quantity || item.quantity <= 0) {
        invalidItems.push({
          name: item.product?.name || "Unknown product",
          reason: 'Invalid quantity (must be greater than 0)'
        });
        itemsToRemove.push(item.product._id);
        continue;
      }

      const product = await Product.findById(item.product._id).populate(
        "category"
      );

      let shouldRemove = false;
      let reason = '';

      if (!product || product.isListed === false || product.isBlocked === true) {
        shouldRemove = true;
        reason = 'Product is no longer available';
      }
      else if (product.category && product.category.isBlocked === true) {
        shouldRemove = true;
        reason = 'Product category is blocked';
      }
      else if (product.isAvailable === false) {
        shouldRemove = true;
        reason = 'Product is not available';
      }
      else if (product.quantity < item.quantity) {
        shouldRemove = true;
        reason = `Insufficient stock (only ${product.quantity} available, requested ${item.quantity})`;
      }

      if (shouldRemove) {
        invalidItems.push({
          name: item.product.name || "Unknown product",
          reason: reason
        });
        itemsToRemove.push(item.product._id);
      }
    }

    if (invalidItems.length > 0) {
      
      try {
        cart.items = cart.items.filter(item => 
          !itemsToRemove.some(removeId => removeId.toString() === item.product._id.toString())
        );

        if (cart.items.length === 0) {
          cart.appliedCoupon = undefined;
          cart.couponDiscount = 0;
          cart.couponCode = null;
          cart.couponType = null;
          cart.couponValue = 0;
        } else if (cart.appliedCoupon) {
          const { validateAndUpdateCartCoupon } = require('../../helpers/couponHelper');
          try {
            const couponValidation = await validateAndUpdateCartCoupon(cart);
            if (!couponValidation.valid) {
              cart.appliedCoupon = undefined;
              cart.couponDiscount = 0;
              cart.couponCode = null;
              cart.couponType = null;
              cart.couponValue = 0;
            }
          } catch (couponError) {
            cart.appliedCoupon = undefined;
            cart.couponDiscount = 0;
            cart.couponCode = null;
            cart.couponType = null;
            cart.couponValue = 0;
          }
        }

        const totals = cart.calculateTotals();
        cart.subtotal = totals.subtotal;
        cart.total = totals.total;

        await cart.save();
        

        if (cart.items.length === 0) {
          return res.status(400).json({
            success: false,
            message: "All items in your cart are no longer available and have been removed. Please add new items to continue.",
            cartEmpty: true,
            redirectTo: "/cart"
          });
        }

        return res.status(400).json({
          success: false,
          message: `Some items were no longer available and have been automatically removed from your cart: ${invalidItems.map(item => item.name).join(", ")}. Please review your updated cart and try again.`,
          itemsRemoved: invalidItems,
          updatedCart: {
            itemCount: cart.items.length,
            total: cart.total
          },
          shouldRefresh: true
        });
      } catch (error) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: `The following items are no longer available: ${invalidItems.map(item => item.name).join(", ")}`,
        });
      }
    }

    const { total } = await exports.calculateOrderTotals(cart);

    switch (paymentMethod.toLowerCase()) {
      case "cod":
        const codOrder = await exports.createOrder(user, cart, address, "cod", total);

        return res.json({
          success: true,
          message: "Order placed successfully",
          orderId: codOrder._id,
          cartCleared: true
        });
        

      case "wallet": {
        let wallet = await Wallet.findOne({ user: user._id });
        if (!wallet) {
          wallet = new Wallet({
            user: user._id,
            balance: 0,
            transactions: []
          });
          await wallet.save();
        }
        if (wallet.balance < total) {
          return res.status(400).json({
            success: false,
            message:
              "Insufficient wallet balance. Please add money to your wallet to complete the purchase.",
          });
        }
        wallet.balance -= total;
        wallet.transactions.push({
          type: "debit",
          amount: total,
          description: `Order payment #${wallet._id}`,
          date: new Date(),
          status: "completed",
        });
        await wallet.save();
        const walletOrder = await exports.createOrder(
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
          cartCleared: true
        });
      }

      case "online":
        try {
          if (
            !process.env.RAZORPAY_KEY_ID ||
            !process.env.RAZORPAY_KEY_SECRET
          ) {
            throw new Error("Razorpay credentials not configured");
          }

          const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
          });

          const options = {
            amount: Math.round(total * 100),
            currency: "INR",
            payment_capture: 1, 
            notes: {
              userId: user._id.toString(),
            },
          };

          const razorpayOrder = await razorpay.orders.create(options);

          if (!razorpayOrder || !razorpayOrder.id) {
            throw new Error("Failed to create Razorpay order");
          }

          const onlineOrder = await exports.createOrder(
            user,
            cart,
            address,
            "online",
            total
          );

          onlineOrder.razorpay = {
            orderId: razorpayOrder.id,
            status: 'created'
          };
          onlineOrder.paymentStatus = 'Pending'; 
          await onlineOrder.save();

          return res.json({
            success: true,
            message: "Payment initialized",
            order: {
              id: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency,
              orderId: onlineOrder._id,
            },
            key: process.env.RAZORPAY_KEY_ID,
          });
        } catch (error) {
          return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
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
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }
    
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process checkout',
      errorId: sessionId
    });
  }
};

exports.getCheckout = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    
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

    const validItems = processedItems.filter(item => item !== null);
    if (validItems.length === 0) {
      return res.redirect("/cart");
    }

    const cartForCalculation = {
      ...cart.toObject(),
      items: validItems
    };

    const wallet = await Wallet.findOne({ user: userId });
    const walletBalance = wallet ? wallet.balance : 0;

    const { subtotal, couponDiscount, deliveryCharge, total, items } =
      await exports.calculateOrderTotals(cartForCalculation);

    const updatedCart = await Cart.findById(cart._id);
    

    const cartCount = validItems.reduce((total, item) => total + (item.quantity || 1), 0);

    const finalCouponDiscount = couponDiscount || updatedCart?.couponDiscount || 0;

    res.render('user/checkout', {
      user,
      cart: {
        items: validItems,
        subtotal,
        couponDiscount: finalCouponDiscount,
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

    if (!cart.appliedCoupon) {
      return res.status(400).json({
        success: false,
        message: "No coupon applied to remove",
      });
    }

    cart.appliedCoupon = undefined;
    cart.couponDiscount = 0;
    await cart.save();

    const { subtotal, couponDiscount, deliveryCharge, total } = await this.calculateOrderTotals(cart);
    
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
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to remove coupon",
    });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const addressIndex = user.addresses.findIndex(
      (addr) => addr._id.toString() === addressId
    );
    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    const isDefault = user.addresses[addressIndex].isDefault;

    user.addresses.splice(addressIndex, 1);

    
    if (isDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    res.json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to delete address",
    });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification data'
      });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const crypto = require('crypto');
    const text = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      const failedOrder = await Order.findOne({ 'razorpay.orderId': razorpay_order_id });
      if (failedOrder) {
        failedOrder.paymentStatus = 'Failed';
        failedOrder.razorpay.status = 'failed';
        failedOrder.razorpay.paymentId = razorpay_payment_id;
        failedOrder.razorpay.signature = razorpay_signature;
        failedOrder.razorpay.failureReason = 'Signature verification failed';
        failedOrder.razorpay.attemptCount += 1;
        failedOrder.razorpay.lastAttemptedAt = new Date();
        await failedOrder.save();
      }
      
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    const order = await Order.findOne({ 'razorpay.orderId': razorpay_order_id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.paymentStatus = 'Paid';
    order.razorpay.status = 'captured';
    order.razorpay.paymentId = razorpay_payment_id;
    order.razorpay.signature = razorpay_signature;
    order.razorpay.attemptCount += 1;
    order.razorpay.lastAttemptedAt = new Date();
    await order.save();

    for (const item of order.items) {
      try {
        if (item.quantity > 0) {
          const product = await Product.findById(item.product);
          if (product) {
            product.quantity = Math.max(0, product.quantity - item.quantity);
            await product.save();
          }
        }
      } catch (err) {
      }
    }

    const userId = req.user._id;
    await Cart.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          items: [],
          couponDiscount: 0,
          couponValue: 0,
          total: 0,
          subTotal: 0,
          subtotal: 0,
          updatedAt: new Date()
        },
        $unset: {
          appliedCoupon: "",
          couponCode: "",
          couponType: ""
        }
      }
    );

    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order._id
    });

  } catch (error) {
    
    try {
      const { razorpay_order_id } = req.body;
      if (razorpay_order_id) {
        const failedOrder = await Order.findOne({ 'razorpay.orderId': razorpay_order_id });
        if (failedOrder) {
          failedOrder.paymentStatus = 'Failed';
          failedOrder.razorpay.status = 'failed';
          failedOrder.razorpay.failureReason = error.message || 'Payment verification error';
          failedOrder.razorpay.attemptCount += 1;
          failedOrder.razorpay.lastAttemptedAt = new Date();
          await failedOrder.save();
        }
      }
    } catch (updateError) {
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Payment verification failed due to server error'
    });
  }
};


