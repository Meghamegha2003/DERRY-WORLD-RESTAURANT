const Razorpay = require('razorpay');
const crypto = require('crypto');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Wallet = require('../../models/walletSchema');
const OfferService = require('../../services/offerService');
const { getBestOffer } = require('../../helpers/offerHelper');
const { calculateOrderTotals } = require('./checkoutController');
const mongoose = require('mongoose');

let razorpay;
try {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    
    if (!key_id || !key_secret) {
        throw new Error('Razorpay credentials are missing');
    }
    
    razorpay = new Razorpay({
        key_id: key_id,
        key_secret: key_secret
    });
    
} catch (error) {
    console.error('Failed to initialize Razorpay:', error);
    razorpay = null;
}

const createRazorpayOrder = async (req, res) => {
    try {
        if (!razorpay) {
            throw new Error('Razorpay is not properly initialized');
        }

        const userId = req.user._id;
        const { addressId } = req.body;

        // Get user's cart and calculate totals
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                populate: {
                    path: 'category'
                }
            });

        if (!cart || !cart.items.length) {
            return res.status(400).json({ 
                success: false,
                message: 'Your cart is empty' 
            });
        }

        // Calculate totals with offers
        const { subtotal, couponDiscount, deliveryCharge, total } = await calculateOrderTotals(cart);

        // Generate a shorter receipt ID (max 40 chars)
        const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
        const userIdShort = userId.toString().slice(-4); // Last 4 chars of user ID
        const receiptId = `ord_${timestamp}_${userIdShort}`;

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(total * 100), // Convert to paise
            currency: 'INR',
            receipt: receiptId,
            notes: {
                userId: userId.toString(),
                addressId: addressId,
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
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create payment order'
        });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { payment, order } = req.body;
        
        // Verify signature
        const body = order + "|" + payment.razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        const isAuthentic = expectedSignature === payment.razorpay_signature;

        if (!isAuthentic) {
            throw new Error('Payment verification failed');
        }

        // Get the original order details from Razorpay
        const razorpayOrder = await razorpay.orders.fetch(order);
        const { userId, addressId, cartId } = razorpayOrder.notes;

        // Get cart and address details
        const [cart, address] = await Promise.all([
            Cart.findById(cartId).populate({
                path: 'items.product',
                populate: {
                    path: 'category'
                }
            }),
            User.findById(userId).then(user => 
                user.addresses.id(addressId)
            )
        ]);

        if (!cart) {
            throw new Error('Cart not found');
        }

        if (!address) {
            throw new Error('Shipping address not found');
        }

        // Calculate final prices with offers
        const orderItems = await Promise.all(cart.items.map(async item => {
            // Get the best offer price
            const bestOffer = await getBestOffer(item.product);
            const finalPrice = bestOffer.finalPrice || item.product.salesPrice || item.product.regularPrice;

            return {
                product: item.product._id,
                quantity: item.quantity,
                price: finalPrice, // Ensure we always have a price
                total: finalPrice * item.quantity,
                status: ORDER_STATUS.PROCESSING
            };
        }));

        const { subtotal, couponDiscount, deliveryCharge, total } = await calculateOrderTotals(cart);

        // Create order with proper shipping address object
        const newOrder = await Order.create({
            user: userId,
            items: orderItems,
            shippingAddress: {
                addressType: address.addressType || 'Home',
                fullName: address.fullName,
                phone: address.phone,
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2 || '',
                city: address.city,
                state: address.state || 'Kerala',
                pincode: address.pincode
            },
            paymentMethod: 'online',
            paymentStatus: PAYMENT_STATUS.PAID,
            orderStatus: ORDER_STATUS.PROCESSING,
            subtotal,
            couponDiscount,
            deliveryCharge,
            total,
            paymentDetails: {
                razorpayOrderId: order,
                razorpayPaymentId: payment.razorpay_payment_id,
                razorpaySignature: payment.razorpay_signature
            }
        });

        // Clear cart
        cart.items = [];
        cart.couponDiscount = 0;
        cart.appliedCoupon = null;
        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            orderId: newOrder._id
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Payment verification failed'
        });
    }
};

const processWalletPayment = async (req, res) => {
    try {
        const userId = req.user._id;
        const { addressId, cartId } = req.body;

        // Get user with wallet details
        const user = await User.findById(userId);
        if (!user || !user.wallet) {
            return res.status(400).json({
                success: false,
                message: 'Wallet not found'
            });
        }

        // Get cart and calculate totals
        const cart = await Cart.findById(cartId).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        const { subtotal, couponDiscount, deliveryCharge, total } = await calculateOrderTotals(cart);

        // Check if wallet has sufficient balance
        if (user.wallet.balance < total) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient wallet balance'
            });
        }

        // Get shipping address
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Shipping address not found'
            });
        }

        // Create order items with best offer prices
        const orderItems = await Promise.all(cart.items.map(async item => {
            const bestOffer = await getBestOffer(item.product);
            const finalPrice = bestOffer.finalPrice || item.product.salesPrice || item.product.regularPrice;
            return {
                product: item.product._id,
                quantity: item.quantity,
                price: finalPrice,
                total: finalPrice * item.quantity,
                status: ORDER_STATUS.PROCESSING
            };
        }));

        // Create new order
        const newOrder = await Order.create({
            user: userId,
            items: orderItems,
            shippingAddress: {
                addressType: address.addressType || 'Home',
                fullName: address.fullName,
                phone: address.phone,
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2 || '',
                city: address.city,
                state: address.state || 'Kerala',
                pincode: address.pincode
            },
            paymentMethod: 'wallet',
            paymentStatus: PAYMENT_STATUS.PAID,
            orderStatus: ORDER_STATUS.PROCESSING,
            subtotal,
            couponDiscount,
            deliveryCharge,
            total
        });

        // Create wallet transaction
        const walletTransaction = new Wallet({
            user: userId,
            type: 'debit',
            amount: total,
            description: `Payment for order #${newOrder._id}`,
            orderReference: newOrder._id,
            status: 'completed'
        });
        await walletTransaction.save();

        // Update user's wallet balance
        user.wallet.balance -= total;
        await user.save();

        // Clear cart
        cart.items = [];
        cart.couponDiscount = 0;
        cart.appliedCoupon = null;
        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Order placed successfully using wallet payment',
            orderId: newOrder._id
        });
    } catch (error) {
        console.error('Wallet payment error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process wallet payment'
        });
    }
};

module.exports = {
    createRazorpayOrder,
    verifyPayment,
    processWalletPayment
};