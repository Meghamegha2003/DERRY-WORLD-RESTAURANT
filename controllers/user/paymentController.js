const Razorpay = require('razorpay');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Order, ORDER_STATUS } = require('../../models/orderSchema');
const HttpStatus = require('../../utils/httpStatus');
const { PAYMENT_STATUS } = require('../../utils/httpStatus');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Wallet = require('../../models/walletSchema');
const Product = require('../../models/productSchema');
const { calculateOrderTotals } = require('../../helpers/orderHelper');
const { extractAddress } = require('../../helpers/addressHelper');
const { getBestOffer } = require('../../helpers/offerHelper');

let razorpay;
try {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
        throw new Error('Razorpay credentials are missing');
    }

    razorpay = new Razorpay({ key_id, key_secret });
} catch (error) {
    razorpay = null;
}

exports.getOrderItems = async (cartItems) => {
    return Promise.all(
        cartItems.map(async item => {
            const product = await Product.findById(item.product._id).populate('category');
            if (!product) {
                throw new Error(`Product ${item.product._id} not found`);
            }
            
            const bestOffer = await getBestOffer(product);
            
            const regularPrice = product.regularPrice || 0;
            const finalPrice = bestOffer.finalPrice;
            const offerDiscount = bestOffer.hasOffer ? (regularPrice - finalPrice) * item.quantity : 0;
            
            return {
                product: product._id,
                quantity: item.quantity,
                price: finalPrice,
                regularPrice: regularPrice,
                total: finalPrice * item.quantity,
                offerDiscount: parseFloat(offerDiscount.toFixed(2)),
                status: ORDER_STATUS.PROCESSING,
                offerDetails: bestOffer.hasOffer ? {
                    type: bestOffer.offer?.type,
                    name: bestOffer.offer?.name,
                    discountPercentage: bestOffer.discountPercentage,
                    originalDiscount: bestOffer.offer?.discountValue
                } : null
            };
        })
    );
}

exports.clearCart = async (cart, options = {}) => {
    try {

        if (!cart) {
            return;
        }
        
        const updateData = {
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
        };

        
        const result = await Cart.findOneAndUpdate(
            { _id: cart._id },
            updateData,
            { 
                ...options,
                new: true,
                runValidators: false,
                strict: false
            }
        );

        return result;
    } catch (error) {
        throw error;
    }
};

exports.createRazorpayOrder = async (req, res) => {
    const useTransaction = process.env.NODE_ENV !== 'development';
    const session = useTransaction ? await mongoose.startSession() : null;
    
    if (useTransaction) {
        session.startTransaction();
    }
    
    try {
        if (!razorpay) throw new Error('Razorpay is not properly initialized');

        const userId = req.user._id;
        const { addressId } = req.body;

        const queryOptions = useTransaction ? { session } : {};
        
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                populate: { path: 'category' }
            })
            .session(useTransaction ? session : null);

        if (!cart || !cart.items.length) {
            if (useTransaction) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Your cart is empty' });
        }

        const orderItems = await exports.getOrderItems(cart.items);
        
        const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const offerDiscount = orderItems.reduce((sum, item) => sum + (item.offerDiscount || 0), 0);
        const couponDiscount = cart.couponDiscount || 0;
        const deliveryCharge = 0; 
        const total = Math.max(0, subtotal - couponDiscount + deliveryCharge);
        
      
        
        const user = await User.findById(userId).session(useTransaction ? session : null);
        const address = user.addresses.id(addressId);

        if (!address) {
            if (useTransaction) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Invalid delivery address' });
        }

        const processedOrderItems = orderItems.map(item => ({
            product: item.product,
            quantity: item.quantity,
            price: item.price,
            regularPrice: item.regularPrice,
            total: item.total,
            offerDiscount: item.offerDiscount || 0,
            status: 'Active',
            offerDetails: item.offerDetails
        }));
        
        if (!address || !address.fullName || !address.addressLine1 || !address.city || !address.state || !address.pincode) {
            throw new Error('Incomplete address information');
        }
        
        function generateOrderNumber() {
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 10000);
            return `ORD-${timestamp}-${random}`;
        }
        
        let order;
        let attempts = 0;
        const maxAttempts = 3;
        const saveOptions = useTransaction ? { session } : {};
        
        while (attempts < maxAttempts) {
            try {
                const orderData = {
                    orderNumber: generateOrderNumber(),
                    user: userId,
                    items: processedOrderItems,
                    shippingAddress: {
                        addressType: address.addressType || 'Home',
                        fullName: address.fullName,
                        phone: address.phone || '',
                        addressLine1: address.addressLine1,
                        addressLine2: address.addressLine2 || '',
                        city: address.city,
                        state: address.state,
                        pincode: address.pincode.toString()
                    },
                    paymentMethod: 'online',
                    paymentStatus: 'Pending',
                    razorpay: {
                        status: 'created',
                        attemptCount: 1
                    },
                    status: 'Active',
                    orderStatus: 'Pending',
                    subtotal: subtotal,
                    couponDiscount: couponDiscount,
                    totalCoupon: couponDiscount, // Store original coupon amount
                    couponCode: cart.couponCode || cart.appliedCoupon?.code,
                    offerDiscount: offerDiscount,
                    deliveryCharge: deliveryCharge,
                    total: total,
                    totalAmount: total,
                    orderDate: new Date()
                };
                
                order = new Order(orderData);
                await order.save(saveOptions);
                break;
                
            } catch (error) {
                if (error.code === 11000 && error.keyPattern && error.keyPattern.orderNumber) {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        throw new Error('Failed to generate a unique order number after multiple attempts');
                    }
                } else {
                    throw error;
                }
            }
        }

        let razorpayOrder;
        try {
            razorpayOrder = await razorpay.orders.create({
                amount: Math.round(total * 100), 
                currency: 'INR',
                receipt: order._id.toString(),
                payment_capture: 1 
            });

            if (!razorpayOrder || !razorpayOrder.id) {
                throw new Error('Failed to create Razorpay order: Invalid response from Razorpay');
            }

            order.razorpay = order.razorpay || {};
            order.razorpay.status = 'created';
            order.razorpay.orderId = razorpayOrder.id;
            
            order.payment = order.payment || {};
            order.payment.razorpayOrderId = razorpayOrder.id;
            order.payment.status = 'pending';
            
            await order.save(saveOptions);
            
            
            await exports.clearCart(cart, saveOptions);
            
            if (useTransaction) {
                await session.commitTransaction();
                session.endSession();
            }
            
            return res.status(HttpStatus.OK).json({
                success: true,
                order: {
                    id: razorpayOrder.id,
                    amount: razorpayOrder.amount, 
                    currency: razorpayOrder.currency || 'INR',
                    orderId: order._id,
                    key: process.env.RAZORPAY_KEY_ID
                }
            });
            
        } catch (razorpayError) {
            
            
            order.razorpay.status = 'failed';
            order.razorpay.failureReason = razorpayError.message || 'Razorpay order creation failed';
            order.paymentStatus = 'Failed';
            
           
            await order.save(saveOptions);
            
           
            if (useTransaction && session) {
                await session.abortTransaction();
                session.endSession();
            }
            
            
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: `Payment processing failed: ${razorpayError.message || 'Unable to create payment order'}`,
                code: razorpayError.code,
                details: process.env.NODE_ENV === 'development' ? razorpayError.stack : undefined
            });
        }
    } catch (error) {
        
       
        if (typeof order !== 'undefined' && order && order._id) {
            try {
                await Order.findByIdAndDelete(order._id);
            } catch (cleanupError) {
            }
        }
        
        
        if (useTransaction && session) {
            try {
                await session.abortTransaction();
                session.endSession();
            } catch (txError) {
            }
        }
        
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: error.message || 'Failed to create payment order',
            code: error.code,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};


exports.verifyPayment = async (req, res) => {
    try {

        const razorpayOrderId = req.body.order || req.body.razorpay_order_id;
        const razorpayPaymentId = req.body.payment?.razorpay_payment_id || req.body.razorpay_payment_id;
        const razorpaySignature = req.body.payment?.razorpay_signature || req.body.razorpay_signature;
        
        
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Payment verification data missing',
                details: { razorpayOrderId, razorpayPaymentId, razorpaySignature }
            });
        }

        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (expectedSignature !== razorpaySignature) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Payment verification failed: Invalid signature',
                code: 'INVALID_SIGNATURE'
            });
        }

        
        
        const query = {
            $or: [
                { 'payment.razorpayOrderId': razorpayOrderId },
                { 'razorpay.orderId': razorpayOrderId }
            ]
        };

        
        if (mongoose.Types.ObjectId.isValid(razorpayOrderId)) {
            query.$or.push({ _id: new mongoose.Types.ObjectId(razorpayOrderId) });
        }

        let existingOrder = await Order.findOne(query);
        
       
        if (!existingOrder) {
            const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
            
            
            if (razorpayOrder.receipt) {
                existingOrder = await Order.findById(razorpayOrder.receipt);
                
                if (existingOrder) {
                    
                    existingOrder.razorpay = existingOrder.razorpay || {};
                    existingOrder.razorpay.orderId = razorpayOrderId;
                    existingOrder.payment = existingOrder.payment || {};
                    existingOrder.payment.razorpayOrderId = razorpayOrderId;
                    await existingOrder.save();
                }
            }
            
            if (!existingOrder && razorpayOrder.notes?.orderId) {
                existingOrder = await Order.findById(razorpayOrder.notes.orderId);
            }
            
            if (!existingOrder) {
                existingOrder = await Order.findOne({ receipt: razorpayOrder.receipt });
            }
        }
        
        if (existingOrder) {
            
            if (!existingOrder.payment) {
                existingOrder.payment = {};
            }
            
            existingOrder.payment = existingOrder.payment || {};
            existingOrder.payment.status = 'Paid';
            existingOrder.payment.razorpayPaymentId = razorpayPaymentId;
            existingOrder.payment.paidAt = new Date();
            existingOrder.orderStatus = 'Pending'; 
            existingOrder.paymentStatus = 'Paid';  
            existingOrder.razorpay = existingOrder.razorpay || {};
            existingOrder.razorpay.status = 'captured'; 
            
            const cart = await Cart.findOne({ user: existingOrder.user });
            if (cart) {
                await exports.clearCart(cart);
            }
            
            await existingOrder.save();
            
            
            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Order placed successfully',
                redirectUrl: `/orders/${existingOrder._id}`,
                order: {
                    id: existingOrder._id,
                    status: existingOrder.orderStatus,
                    payment: existingOrder.payment
                }
            });
        }
        
        if (!existingOrder) {
            existingOrder = await Order.findOne({ 'receipt': razorpayOrderId });
        }
        
        if (!existingOrder) {
            existingOrder = await Order.findOne({
                'payment.razorpayOrderId': { $regex: razorpayOrderId, $options: 'i' }
            });
        }
        
        if (!existingOrder) {
            try {
                const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
                
                if (razorpayOrder.notes && razorpayOrder.notes.orderId) {
                    existingOrder = await Order.findById(razorpayOrder.notes.orderId);
                }
                
                if (!existingOrder && razorpayOrder.receipt) {
                    
                    existingOrder = await Order.findOne({ 'receipt': razorpayOrder.receipt });
                    
                    if (!existingOrder && !razorpayOrder.receipt.startsWith('order_')) {
                        existingOrder = await Order.findOne({ 'receipt': `order_${razorpayOrder.receipt}` });
                    }
                }
                    
                if (!existingOrder && razorpayOrder.notes) {
                    
                    if (razorpayOrder.notes.cartId) {
                        existingOrder = await Order.findOne({ 'cart': razorpayOrder.notes.cartId });
                    }
                    
                    if (!existingOrder && razorpayOrder.notes.addressId) {
                        try {
                            existingOrder = await Order.findOne({ 
                                'shippingAddress': new mongoose.Types.ObjectId(razorpayOrder.notes.addressId),
                                'payment.razorpayOrderId': razorpayOrder.id
                            });
                        } catch (error) {
                        }
                    }
                    
                    if (!existingOrder && razorpayOrder.notes.userId && razorpayOrder.amount) {
                        existingOrder = await Order.findOne({
                            'user': new mongoose.Types.ObjectId(razorpayOrder.notes.userId),
                            'total': razorpayOrder.amount / 100,
                            'payment.status': 'pending',
                            'status': 'pending'
                        }).sort({ createdAt: -1 }); 
                        
                    }
                }
                
                if (existingOrder) {
                    existingOrder.payment = existingOrder.payment || {};
                    existingOrder.payment.razorpayOrderId = razorpayOrderId;
                    await existingOrder.save();
                }
                
            } catch (error) {
            }
        }

        if (!existingOrder) {
            return res.status(HttpStatus.NOT_FOUND).json({
                success: false,
                message: 'Order not found. Please contact support with this reference: ' + razorpayOrderId,
                code: 'ORDER_NOT_FOUND',
                details: {
                    razorpayOrderId,
                    timestamp: new Date().toISOString()
                }
            });
        }
        

        existingOrder.paymentStatus = PAYMENT_STATUS.PAID;
        existingOrder.razorpay = existingOrder.razorpay || {};
        existingOrder.razorpay.orderId = razorpayOrderId;
        existingOrder.razorpay.paymentId = razorpayPaymentId;
        existingOrder.razorpay.signature = razorpaySignature;
        existingOrder.razorpay.status = 'captured';
        existingOrder.razorpay.attemptCount = (existingOrder.razorpay.attemptCount || 0) + 1;
        existingOrder.razorpay.lastAttemptedAt = new Date();

        await existingOrder.save();

        const orderToken = jwt.sign(
            { orderId: order._id.toString(), userId: req.user._id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(HttpStatus.OK).json({
            success: true,
            message: 'Payment verified and order updated',
            orderId: existingOrder._id
        });
    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: error.message || 'Payment verification failed' });
    }
};


exports.processWalletPayment = async (req, res) => {
    const useTransactions = process.env.NODE_ENV === 'production';
    const session = useTransactions ? await mongoose.startSession() : null;
    
    try {
        const userId = req.user._id;
        const { addressId } = req.body;

        if (useTransactions) {
            session.startTransaction();
        }

        const query = User.findById(userId);
        if (useTransactions) query.session(session);
        const user = await query;
        
        if (!user) {
            if (useTransactions) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'User not found' });
        }

        const cartQuery = Cart.findOne({ user: userId })
            .populate({ path: 'items.product', populate: { path: 'category' } });
            
        if (useTransactions) cartQuery.session(session);
        const cart = await cartQuery;

        if (!cart || !cart.items || cart.items.length === 0) {
            if (useTransactions) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Your cart is empty' });
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            if (useTransactions) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'Shipping address not found' });
        }

        const orderItems = await exports.getOrderItems(cart.items);
        
        const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const offerDiscount = orderItems.reduce((sum, item) => sum + (item.offerDiscount || 0), 0);
        const couponDiscount = cart.couponDiscount || 0;
        const deliveryCharge = 0; 
        const total = Math.max(0, subtotal - couponDiscount + deliveryCharge);

       

        const finalAmount = Math.max(0, total); 
        
      
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            wallet = new Wallet({
                user: userId,
                balance: 0,
                transactions: []
            });
            await wallet.save(useTransactions ? { session } : {});
        } else if (useTransactions) {
            wallet = await Wallet.findOne({ user: userId }).session(session);
        }

       
        if (wallet.balance < finalAmount) {
            if (useTransactions) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false, 
                message: `Insufficient wallet balance. Your balance is ₹${wallet.balance.toFixed(2)} but the order total is ₹${finalAmount.toFixed(2)}`,
                currentBalance: wallet.balance,
                orderTotal: finalAmount
            });
        }

        try {
            const processedOrderItems = orderItems.map(item => ({
                ...item,
                status: 'Active', 
                regularPrice: item.regularPrice || item.price,
                price: item.price,
                total: item.price * item.quantity
            }));

            // Extract and format address according to schema
            const shippingAddress = {
                fullName: address.fullName || address.name,
                phone: address.phone,
                addressLine1: address.addressLine1 || address.address,
                addressLine2: address.addressLine2 || address.address2 || '',
                city: address.city,
                state: address.state,
                pincode: address.pincode,
                addressType: address.addressType || 'Home',
                isDefault: address.isDefault || false
            };

            // Create the order with proper schema validation
            const newOrder = new Order({
                user: userId,
                items: processedOrderItems,
                shippingAddress: shippingAddress,
                paymentMethod: 'wallet',
                paymentStatus: 'Paid', 
                orderStatus: 'Pending', 
                subtotal,
                couponDiscount: couponDiscount || 0,
                totalCoupon: couponDiscount || 0, 
                offerDiscount: offerDiscount || 0,
                deliveryCharge: deliveryCharge || 0,
                total,
                payment: {
                    status: 'Paid',
                    amount: finalAmount,
                    method: 'wallet',
                    paidAt: new Date()
                }
            });

            const saveOptions = useTransactions ? { session } : {};
            
           
            const savedOrder = await newOrder.save(saveOptions);

           
            if (!user.wallet) {
                const newWallet = new Wallet({
                    user: userId,
                    balance: 0,
                    transactions: []
                });
                await newWallet.save(saveOptions);
                user.wallet = newWallet._id;
            }

            const currentWallet = await Wallet.findOne({ user: userId });
            const currentBalance = currentWallet?.balance || 0;
            const newBalance = currentBalance - finalAmount;

            const transactionData = {
                type: 'debit',
                amount: finalAmount,
                description: `Payment for order #${savedOrder.orderNumber}`,
                date: new Date(),
                status: 'completed',
                orderReference: savedOrder._id,
                orderId: savedOrder.orderNumber,
                paymentId: `wallet_${Date.now()}`,
                previousBalance: currentBalance,
                newBalance: newBalance
            };
            
            // Update the wallet with the new balance and transaction
            const wallet = await Wallet.findOneAndUpdate(
                { user: userId },
                {
                    $set: { balance: newBalance },
                    $push: { transactions: transactionData }
                },
                { 
                    new: true, 
                    session: session || null,
                    upsert: true 
                }
            );
            
            if (!wallet) {
                throw new Error('Failed to process wallet payment: Wallet not found');
            }
            
            if (!user.wallet.equals(wallet._id)) {
                user.wallet = wallet._id;
                await user.save(saveOptions);
            }

            if (useTransactions) {
                await session.commitTransaction();
                session.endSession();
            }

             await exports.clearCart(cart);

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Payment processed successfully',
                order: {
                    _id: savedOrder._id,
                    orderNumber: savedOrder.orderNumber,
                    total: savedOrder.total,
                    status: savedOrder.orderStatus
                },
                redirectUrl: `/orders/${savedOrder._id}`
            });
        } catch (error) {
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: error.message || 'Failed to process wallet payment',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    } catch (error) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'An unexpected error occurred while processing your payment',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

exports.handlePaymentFailure = async (req, res) => {
    try {
        const { orderId, reason } = req.body;
        const order = await Order.findById(orderId);

        if (!order) return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'Order not found' });

        order.paymentStatus = PAYMENT_STATUS.FAILED;
        order.razorpay.status = 'failed';
        order.razorpay.failureReason = reason || 'Payment failed';
        order.razorpay.attemptCount = (order.razorpay.attemptCount || 0) + 1;
        order.razorpay.lastAttemptedAt = new Date();

        await order.save();
        res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to update payment failure' });
    }
};

exports.logPaymentFailure = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: "Order not found" });

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
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error" });
  }
};

exports.retryRazorpayPayment = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId);
    if (!order) return res.status(HttpStatus.NOT_FOUND).send("Order not found");

    const razorpayOrder = await razorpay.orders.create({
      amount: order.totalAmount * 100,
      currency: "INR",
      receipt: `retry_${order._id}_${Date.now()}`,
    });

    order.razorpay = {
      orderId: razorpayOrder.id,
      status: 'pending',
      attemptCount: (order.razorpay?.attemptCount || 0) + 1,
    };
    order.paymentStatus = 'Pending';
    await order.save();

    res.redirect(`/retry-payment/${order._id}`);
  } catch (err) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};
