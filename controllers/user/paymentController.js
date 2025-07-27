const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Wallet = require('../../models/walletSchema');
const OfferService = require('../../services/offerService');
const { getBestOffer } = require('../../helpers/offerHelper');
const { calculateOrderTotals } = require('./checkoutController');

let razorpay;
try {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
        throw new Error('Razorpay credentials are missing');
    }

    razorpay = new Razorpay({ key_id, key_secret });
} catch (error) {
    console.error('Failed to initialize Razorpay:', error);
    razorpay = null;
}

// 🔁 Shared function to get order items with offers
exports.getOrderItems = async (cartItems) => {
    return Promise.all(
        cartItems.map(async item => {
            const bestOffer = await getBestOffer(item.product);
            const finalPrice = bestOffer.finalPrice || item.product.salesPrice || item.product.regularPrice;
            return {
                product: item.product._id,
                quantity: item.quantity,
                price: finalPrice,
                total: finalPrice * item.quantity,
                status: ORDER_STATUS.PROCESSING
            };
        })
    );
}

// 📦 Shared function to extract shipping address
exports.extractAddress = (address) => {
    return {
        addressType: address.addressType || 'Home',
        fullName: address.fullName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || '',
        city: address.city,
        state: address.state || 'Kerala',
        pincode: address.pincode
    };
}

// 🧹 Clear cart after order
exports.clearCart = async (cart) => {
    cart.items = [];
    cart.couponDiscount = 0;
    cart.appliedCoupon = null;
    await cart.save();
}

// ----------------------------
// ✅ Razorpay Order Creation
// ----------------------------
exports.createRazorpayOrder = async (req, res) => {
    try {
        if (!razorpay) throw new Error('Razorpay is not properly initialized');

        const userId = req.user._id;
        const { addressId } = req.body;

        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            populate: { path: 'category' }
        });

        if (!cart || !cart.items.length) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        const { total } = await calculateOrderTotals(cart);

        const receiptId = `ord_${Date.now().toString().slice(-8)}_${userId.toString().slice(-4)}`;

        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(total * 100),
            currency: 'INR',
            receipt: receiptId,
            notes: {
                userId: userId.toString(),
                addressId,
                cartId: cart._id.toString()
            }
        });

        res.status(200).json({
            success: true,
            order: {
                id: razorpayOrder.id,
                amount: total,
                currency: razorpayOrder.currency
            }
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to create payment order' });
    }
};

// ----------------------------
// ✅ Razorpay Payment Verify
// ----------------------------
exports.verifyPayment = async (req, res) => {
    try {
        // Support both nested and legacy payload shapes
const razorpayOrderId = req.body.order || req.body.razorpay_order_id;
const razorpayPaymentId = req.body.payment?.razorpay_payment_id || req.body.razorpay_payment_id;
const razorpaySignature = req.body.payment?.razorpay_signature || req.body.razorpay_signature;
if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new Error('Payment verification data missing');
}

        // Calculate expected signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (expectedSignature !== razorpaySignature) {
            throw new Error('Payment verification failed');
        }

        // Fetch Razorpay order to retrieve internal orderId
        const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
        const { orderId } = razorpayOrder.notes;

        // Find and update existing order
        const existingOrder = await Order.findById(orderId);
        if (!existingOrder) {
            throw new Error('Order not found');
        }

        existingOrder.paymentStatus = PAYMENT_STATUS.PAID;
        // existingOrder.orderStatus is kept at Pending; admin must update to Processing
        existingOrder.razorpay = existingOrder.razorpay || {};
        existingOrder.razorpay.orderId = razorpayOrderId;
        existingOrder.razorpay.paymentId = razorpayPaymentId;
        existingOrder.razorpay.signature = razorpaySignature;
        existingOrder.razorpay.status = 'captured';
        existingOrder.razorpay.attemptCount = (existingOrder.razorpay.attemptCount || 0) + 1;
        existingOrder.razorpay.lastAttemptedAt = new Date();

        await existingOrder.save();

        // Optional: clear cart if using
        // const cart = await Cart.findById(razorpayOrder.notes.cartId);
        // if (cart) await clearCart(cart);

        res.status(200).json({
            success: true,
            message: 'Payment verified and order updated',
            orderId: existingOrder._id
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ success: false, message: error.message || 'Payment verification failed' });
    }
};

// ----------------------------
// ✅ Wallet Payment Process
// ----------------------------
exports.processWalletPayment = async (req, res) => {
    try {
        const userId = req.user._id;
        const { addressId, cartId } = req.body;

        const user = await User.findById(userId);
        const cart = await Cart.findById(cartId).populate({ path: 'items.product', populate: { path: 'category' } });

        if (!user?.wallet || !cart) {
            return res.status(400).json({ success: false, message: 'User or cart not found' });
        }

        const address = user.addresses.id(addressId);
        if (!address) return res.status(404).json({ success: false, message: 'Shipping address not found' });

        const [orderItems, { subtotal, couponDiscount, deliveryCharge, total }] = await Promise.all([
            getOrderItems(cart.items),
            calculateOrderTotals(cart)
        ]);

        if (user.wallet.balance < total) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
        }

        const newOrder = await Order.create({
            user: userId,
            items: orderItems,
            shippingAddress: extractAddress(address),
            paymentMethod: 'wallet',
            paymentStatus: PAYMENT_STATUS.PAID,
            orderStatus: ORDER_STATUS.PROCESSING,
            subtotal,
            couponDiscount,
            deliveryCharge,
            total
        });

        await Wallet.create({
            user: userId,
            type: 'debit',
            amount: total,
            description: `Payment for order #${newOrder._id}`,
            orderReference: newOrder._id,
            status: 'completed'
        });

        user.wallet.balance -= total;
        await user.save();
        await clearCart(cart);

        res.status(200).json({
            success: true,
            message: 'Order placed successfully using wallet payment',
            orderId: newOrder._id
        });
    } catch (error) {
        console.error('Wallet payment error:', error);
        res.status(500).json({ success: false, message: error.message || 'Wallet payment failed' });
    }
};

// ----------------------------
// ✅ Razorpay Payment Failure Handler
// ----------------------------
exports.handlePaymentFailure = async (req, res) => {
    try {
        const { orderId, reason } = req.body;
        const order = await Order.findById(orderId);

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        order.paymentStatus = PAYMENT_STATUS.FAILED;
        order.razorpay.status = 'failed';
        order.razorpay.failureReason = reason || 'Payment failed';
        order.razorpay.attemptCount = (order.razorpay.attemptCount || 0) + 1;
        order.razorpay.lastAttemptedAt = new Date();

        await order.save();
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('handlePaymentFailure error:', error);
        res.status(500).json({ success: false, message: 'Failed to update payment failure' });
    }
};

exports.logPaymentFailure = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.paymentStatus !== 'Paid') {
      order.paymentStatus = 'Failed';
      order.razorpay.status = 'failed';
      order.razorpay.failureReason = 'User exited payment modal';
      order.razorpay.lastAttemptedAt = new Date();
      order.razorpay.attemptCount = (order.razorpay.attemptCount || 0) + 1;
      await order.save();
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Failed to log Razorpay dismiss:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.retryRazorpayPayment = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send("Order not found");

    // Create a new Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: order.totalAmount * 100,
      currency: "INR",
      receipt: `retry_${order._id}_${Date.now()}`,
    });

    // Update Razorpay info on the order
    order.razorpay = {
      orderId: razorpayOrder.id,
      status: 'pending',
      attemptCount: (order.razorpay?.attemptCount || 0) + 1,
    };
    order.paymentStatus = 'Pending';
    await order.save();

    // Redirect back to checkout or payment page
    res.redirect(`/retry-payment/${order._id}`);
  } catch (err) {
    console.error("Retry Razorpay error:", err);
    res.status(500).send("Internal Server Error");
  }
};

