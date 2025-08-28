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
          // Clear invalid coupon
          updatedCart.appliedCoupon = undefined;
          updatedCart.couponDiscount = 0;
        }
        await updatedCart.save();
      } catch (error) {
        console.error('Error validating coupon in checkout:', error);
        updatedCart.appliedCoupon = undefined;
        updatedCart.couponDiscount = 0;
        await updatedCart.save();
      }
    }

    // Free delivery
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
    console.error("Error in calculateOrderTotals:", error);
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

        const offerDetails = await OfferService.getBestOffer(product);

        const quantity = Number(item.quantity || 0);

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
          regularPrice: product.regularPrice, // Required field
          offerPrice: offerDetails?.bestOffer ? offerDetails.finalPrice : null,
          total: itemTotal, // Required field
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

    // Debug address data
    console.log('Address data:', address);
    console.log('Payment method:', paymentMethod);
    console.log('Order items sample:', orderItems[0]);

    // Create new order
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
      paymentMethod: paymentMethod || "cod", // Required field
      subtotal,
      couponDiscount: cart.couponDiscount || 0, 
      totalCoupon: cart.couponDiscount || 0,
      deliveryCharge,
      total: orderTotal,
      totalAmount: orderTotal, // Required field
      orderStatus: ORDER_STATUS.PENDING,
      status: 'Active', // Required field with correct enum value
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
      
      // Update coupon calculations using new system
      const { updateOrderCouponCalculations } = require('../../helpers/couponHelper');
      const coupon = await Coupon.findById(cart.appliedCoupon.couponId);
      await updateOrderCouponCalculations(order, coupon);
    }

    await order.save();
    for (const item of orderItems) {
      try {
        if (item.quantity > 0) {
          const product = await Product.findById(item.product);
          if (product) {
            product.quantity = Math.max(0, product.quantity - item.quantity);
            await product.save();
          } else {
            console.error(
              `Product not found for stock decrement: ${item.product}`
            );
          }
        }
      } catch (err) {
        console.error(
          ` Failed to reduce stock for product ${item.product}:`,
          err
        );
      }
    }

    // Clear cart after successful order creation
    try {
      const couponInfo = cart.appliedCoupon ? { ...cart.appliedCoupon } : null;
      
      // Clear cart using direct update
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
      
      // Update coupon usage if applicable
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
      
      console.log('Cart cleared successfully after order creation');
      
    } catch (error) {
      console.error('Error clearing cart after order creation:', error);
      // Don't throw error here as order is already created successfully
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
          // Create wallet if it doesn't exist
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

          console.log('Creating Razorpay order with options:', JSON.stringify(options, null, 2));
          const razorpayOrder = await razorpay.orders.create(options);
          console.log('Razorpay order created:', JSON.stringify(razorpayOrder, null, 2));

          if (!razorpayOrder || !razorpayOrder.id) {
            throw new Error("Failed to create Razorpay order");
          }

          // Use the unified createOrder function for online payments too
          const onlineOrder = await exports.createOrder(
            user,
            cart,
            address,
            "online",
            total
          );

          // Add Razorpay details to the order and set payment status as pending
          onlineOrder.razorpay = {
            orderId: razorpayOrder.id,
            status: 'created'
          };
          onlineOrder.paymentStatus = 'Pending'; // Set as pending initially
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

// Get checkout page
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

    console.log(`[User: ${userId}] Calculating order totals`);
    const { subtotal, couponDiscount, deliveryCharge, total, items } =
      await exports.calculateOrderTotals(cartForCalculation);
    console.log(`[User: ${userId}] Order totals:`, { subtotal, couponDiscount, deliveryCharge, total });

    const updatedCart = await Cart.findById(cart._id);
    
    console.log(`[User: ${userId}] Cart coupon data:`, {
      cartCouponDiscount: updatedCart?.couponDiscount,
      calculatedCouponDiscount: couponDiscount,
      appliedCoupon: updatedCart?.appliedCoupon,
      hasAppliedCoupon: !!updatedCart?.appliedCoupon
    });

    const cartCount = validItems.reduce((total, item) => total + (item.quantity || 1), 0);

    // Use the calculated coupon discount from calculateOrderTotals, not the cart's stored value
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

    console.log(`[${sessionId}] Calculating order totals`);
    const { subtotal, couponDiscount, deliveryCharge, total } = await this.calculateOrderTotals(cart);
    console.log(`[${sessionId}] Order totals:`, { subtotal, couponDiscount, deliveryCharge, total });
    
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
    console.error("Error in deleteAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete address",
    });
  }
};

// Verify Razorpay payment and update order status
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification data'
      });
    }

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Verify signature
    const crypto = require('crypto');
    const text = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      // Payment verification failed - update order status to failed
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

    // Payment verification successful - update order status to paid
    const order = await Order.findOne({ 'razorpay.orderId': razorpay_order_id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update order with successful payment details
    order.paymentStatus = 'Paid';
    order.razorpay.status = 'captured';
    order.razorpay.paymentId = razorpay_payment_id;
    order.razorpay.signature = razorpay_signature;
    order.razorpay.attemptCount += 1;
    order.razorpay.lastAttemptedAt = new Date();
    await order.save();

    // Clear user's cart after successful payment
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
    console.error('Payment verification error:', error);
    
    // Try to mark order as failed if we can find it
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
      console.error('Error updating failed order:', updateError);
    }

    res.status(500).json({
      success: false,
      message: 'Payment verification failed due to server error'
    });
  }
};


