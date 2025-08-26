const Razorpay = require('razorpay');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Order, ORDER_STATUS } = require('../../models/orderSchema');
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
    console.error('Failed to initialize Razorpay:', error);
    razorpay = null;
}

// 🔁 Shared function to get order items with offers
exports.getOrderItems = async (cartItems) => {
    return Promise.all(
        cartItems.map(async item => {
            // Ensure we have the full product with populated category for accurate offer calculation
            const product = await Product.findById(item.product._id).populate('category');
            if (!product) {
                throw new Error(`Product ${item.product._id} not found`);
            }
            
            // Get the best offer for this product
            const bestOffer = await getBestOffer(product);
            
            // Calculate prices
            const regularPrice = product.regularPrice || 0;
            const finalPrice = bestOffer.finalPrice;
            const offerDiscount = bestOffer.hasOffer ? (regularPrice - finalPrice) * item.quantity : 0;
            
            // Store offer details with the item
            return {
                product: product._id,
                quantity: item.quantity,
                price: finalPrice, // Final price after all offers
                regularPrice: regularPrice, // Original price
                total: finalPrice * item.quantity, // Total after all discounts
                offerDiscount: parseFloat(offerDiscount.toFixed(2)), // Total discount from offers
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

// Using extractAddress from addressHelper.js

// 🧹 Clear cart after order
exports.clearCart = async (cart, options = {}) => {
    try {
        console.log('=== STARTING CART CLEAR ===');
        console.log('Cart before clear:', {
            _id: cart?._id,
            user: cart?.user,
            itemsCount: cart?.items?.length,
            couponCode: cart?.couponCode,
            total: cart?.total,
            subTotal: cart?.subTotal
        });

        if (!cart) {
            console.log('No cart provided to clear');
            return;
        }
        
        // Clear all cart items and reset values
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

        console.log('Attempting to clear cart with update:', JSON.stringify(updateData, null, 2));
        
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

        console.log('Cart clear result:', {
            matchedCount: result?.matchedCount,
            modifiedCount: result?.modifiedCount,
            result: result
        });

        // Verify the cart was actually cleared
        const updatedCart = await Cart.findById(cart._id);
        console.log('Cart after clear verification:', {
            _id: updatedCart?._id,
            itemsCount: updatedCart?.items?.length,
            couponCode: updatedCart?.couponCode,
            total: updatedCart?.total,
            subTotal: updatedCart?.subTotal
        });

        console.log('=== CART CLEAR COMPLETE ===');
        return result;
    } catch (error) {
        console.error('Error clearing cart:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        throw error;
    }
};

// ----------------------------
// ✅ Razorpay Order Creation
// ----------------------------
exports.createRazorpayOrder = async (req, res) => {
    // In development, we'll skip transactions if not in a replica set
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
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        // Get order items with offers applied
        const orderItems = await exports.getOrderItems(cart.items);
        
        // Calculate order totals properly including coupon discount
        const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const offerDiscount = orderItems.reduce((sum, item) => sum + (item.offerDiscount || 0), 0);
        const couponDiscount = cart.couponDiscount || 0;
        const deliveryCharge = 0; // Free delivery
        const total = Math.max(0, subtotal - couponDiscount + deliveryCharge);
        
        console.log('\n--- Razorpay Order Calculation ---');
        console.log('Subtotal:', subtotal);
        console.log('Coupon Discount:', couponDiscount);
        console.log('Offer Discount:', offerDiscount);
        console.log('Delivery Charge:', deliveryCharge);
        console.log('Total:', total);
        console.log('--------------------------------\n');
        
        const user = await User.findById(userId).session(useTransaction ? session : null);
        const address = user.addresses.id(addressId);

        if (!address) {
            if (useTransaction) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(400).json({ success: false, message: 'Invalid delivery address' });
        }

        // Prepare order items with proper structure
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
        
        // Validate address fields
        if (!address || !address.fullName || !address.addressLine1 || !address.city || !address.state || !address.pincode) {
            console.error('Incomplete address information:', {
                fullName: address?.fullName,
                addressLine1: address?.addressLine1,
                city: address?.city,
                state: address?.state,
                pincode: address?.pincode
            });
            throw new Error('Incomplete address information');
        }
        
        // Generate a unique order number with timestamp and random component
        function generateOrderNumber() {
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 10000);
            return `ORD-${timestamp}-${random}`;
        }
        
        // Create order in database first
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
                    // Duplicate order number, retry with a new one
                    attempts++;
                    if (attempts >= maxAttempts) {
                        throw new Error('Failed to generate a unique order number after multiple attempts');
                    }
                } else {
                    throw error;
                }
            }
        }

        // Create Razorpay order
        let razorpayOrder;
        try {
            razorpayOrder = await razorpay.orders.create({
                amount: Math.round(total * 100), // Convert to paise
                currency: 'INR',
                receipt: order._id.toString(),
                payment_capture: 1 // Auto capture payment
            });

            if (!razorpayOrder || !razorpayOrder.id) {
                throw new Error('Failed to create Razorpay order: Invalid response from Razorpay');
            }

            // Update order with Razorpay order ID in both places for backward compatibility
            order.razorpay = order.razorpay || {};
            order.razorpay.status = 'created';
            order.razorpay.orderId = razorpayOrder.id;
            
            // Also store in payment object for backward compatibility
            order.payment = order.payment || {};
            order.payment.razorpayOrderId = razorpayOrder.id;
            order.payment.status = 'pending';
            
            // Save the order with Razorpay details
            await order.save(saveOptions);
            
            console.log('Updated order with Razorpay ID:', {
                orderId: order._id,
                razorpayOrderId: razorpayOrder.id
            });
            
            // Clear the cart
            await exports.clearCart(cart, saveOptions);
            
            // Commit the transaction if using one
            if (useTransaction) {
                await session.commitTransaction();
                session.endSession();
            }
            
            // Send success response to client
            return res.status(200).json({
                success: true,
                order: {
                    id: razorpayOrder.id,
                    amount: razorpayOrder.amount, // Use the amount from razorpayOrder
                    currency: razorpayOrder.currency || 'INR',
                    orderId: order._id,
                    key: process.env.RAZORPAY_KEY_ID
                }
            });
            
        } catch (razorpayError) {
            console.error('Razorpay order creation failed:', razorpayError);
            
            // Update order status to reflect the failure
            order.razorpay.status = 'failed';
            order.razorpay.failureReason = razorpayError.message || 'Razorpay order creation failed';
            order.paymentStatus = 'Failed';
            
            // Save the failed state
            await order.save(saveOptions);
            
            // Abort transaction if using one
            if (useTransaction && session) {
                await session.abortTransaction();
                session.endSession();
            }
            
            // Send error response to client
            return res.status(500).json({
                success: false,
                message: `Payment processing failed: ${razorpayError.message || 'Unable to create payment order'}`
            });
        }
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        
        // Clean up any created order if it exists
        if (typeof order !== 'undefined' && order && order._id) {
            try {
                await Order.findByIdAndDelete(order._id);
                console.log('Cleaned up order after error:', order._id);
            } catch (cleanupError) {
                console.error('Error cleaning up order after error:', cleanupError);
            }
        }
        
        // Abort transaction if it exists
        if (useTransaction && session) {
            try {
                await session.abortTransaction();
                session.endSession();
            } catch (txError) {
                console.error('Error aborting transaction:', txError);
            }
        }
        
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to create payment order',
            code: error.code,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// ----------------------------
// ✅ Razorpay Payment Verify
// ----------------------------
exports.verifyPayment = async (req, res) => {
    try {
        console.log('=== PAYMENT VERIFICATION STARTED ===');
        console.log('Payment verification request received:', {
            body: req.body,
            headers: req.headers,
            user: req.user ? req.user._id : 'No user',
            timestamp: new Date().toISOString()
        });

        // Support both nested and legacy payload shapes
        const razorpayOrderId = req.body.order || req.body.razorpay_order_id;
        const razorpayPaymentId = req.body.payment?.razorpay_payment_id || req.body.razorpay_payment_id;
        const razorpaySignature = req.body.payment?.razorpay_signature || req.body.razorpay_signature;
        
        console.log('Extracted payment data:', {
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature: razorpaySignature ? '***SIGNATURE_PRESENT***' : 'MISSING'
        });
        
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            console.error('Missing payment verification data:', {
                razorpayOrderId,
                razorpayPaymentId,
                razorpaySignature
            });
            return res.status(400).json({
                success: false,
                message: 'Payment verification data missing',
                details: { razorpayOrderId, razorpayPaymentId, razorpaySignature }
            });
        }

        // Calculate expected signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (expectedSignature !== razorpaySignature) {
            console.error('Invalid signature:', {
                expected: expectedSignature,
                received: razorpaySignature,
                orderId: razorpayOrderId,
                paymentId: razorpayPaymentId
            });
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed: Invalid signature',
                code: 'INVALID_SIGNATURE'
            });
        }

        console.log('Looking up order with Razorpay ID:', razorpayOrderId);
        
        // Try to find the order by razorpayOrderId first (check both payment.razorpayOrderId and razorpay.orderId)
        const query = {
            $or: [
                { 'payment.razorpayOrderId': razorpayOrderId },
                { 'razorpay.orderId': razorpayOrderId }
            ]
        };

        // Only add ObjectId query if razorpayOrderId is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(razorpayOrderId)) {
            query.$or.push({ _id: new mongoose.Types.ObjectId(razorpayOrderId) });
        }

        let existingOrder = await Order.findOne(query);
        
        // If not found, try to get from Razorpay API using the receipt ID
        if (!existingOrder) {
            console.log('Order not found by razorpayOrderId, trying Razorpay API...');
            const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
            
            // Try to find by receipt ID (which should be our order ID)
            if (razorpayOrder.receipt) {
                console.log('Trying to find order by receipt ID:', razorpayOrder.receipt);
                existingOrder = await Order.findById(razorpayOrder.receipt);
                
                if (existingOrder) {
                    console.log('Found order by receipt ID, updating Razorpay order ID');
                    // Update the order with the Razorpay order ID for future reference
                    existingOrder.razorpay = existingOrder.razorpay || {};
                    existingOrder.razorpay.orderId = razorpayOrderId;
                    existingOrder.payment = existingOrder.payment || {};
                    existingOrder.payment.razorpayOrderId = razorpayOrderId;
                    await existingOrder.save();
                }
            }
            
            // If still not found, try notes as fallback
            if (!existingOrder && razorpayOrder.notes?.orderId) {
                existingOrder = await Order.findById(razorpayOrder.notes.orderId);
            }
            
            if (!existingOrder) {
                existingOrder = await Order.findOne({ receipt: razorpayOrder.receipt });
            }
        }
        
        if (existingOrder) {
            console.log('Found order:', existingOrder._id);
            console.log('Updating order with payment details...');
            
            if (!existingOrder.payment) {
                existingOrder.payment = {};
            }
            
            // Update payment details and order status
            existingOrder.payment = existingOrder.payment || {};
            existingOrder.payment.status = 'Paid';
            existingOrder.payment.razorpayPaymentId = razorpayPaymentId;
            existingOrder.payment.paidAt = new Date();
            existingOrder.orderStatus = 'Pending'; // Keep order status as Pending initially
            existingOrder.paymentStatus = 'Paid';  // Explicitly set payment status to Paid
            existingOrder.razorpay = existingOrder.razorpay || {};
            existingOrder.razorpay.status = 'captured'; // Set Razorpay status to captured
            
            const cart = await Cart.findOne({ user: existingOrder.user });
            if (cart) {
                await exports.clearCart(cart);
            }
            
            // Save the updated order
            await existingOrder.save();
            
            console.log('Order updated successfully:', {
                _id: existingOrder._id,
                payment: existingOrder.payment,
                receipt: existingOrder.receipt,
                status: existingOrder.status
            });
            
            // Redirect to order details page
            return res.status(200).json({
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
        
        console.log('Order not found in database, trying fallback methods...');
        // 2. Try receipt field (might contain Razorpay order ID)
        if (!existingOrder) {
            existingOrder = await Order.findOne({ 'receipt': razorpayOrderId });
            if (existingOrder) {
                console.log('Found order by receipt field:', existingOrder._id);
            }
        }
        
        // 3. Try partial match on payment.razorpayOrderId
        if (!existingOrder) {
            existingOrder = await Order.findOne({
                'payment.razorpayOrderId': { $regex: razorpayOrderId, $options: 'i' }
            });
            if (existingOrder) {
                console.log('Found order by partial payment.razorpayOrderId match:', existingOrder._id);
            }
        }
        
        // 4. Try to fetch from Razorpay and match by notes
        if (!existingOrder) {
            try {
                console.log('Fetching order from Razorpay...');
                const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
                console.log('Fetched Razorpay order:', {
                    id: razorpayOrder.id,
                    amount: razorpayOrder.amount,
                    receipt: razorpayOrder.receipt,
                    status: razorpayOrder.status,
                    notes: razorpayOrder.notes
                });
                
                // Try to find by order ID in Razorpay notes
                if (razorpayOrder.notes && razorpayOrder.notes.orderId) {
                    existingOrder = await Order.findById(razorpayOrder.notes.orderId);
                    if (existingOrder) {
                        console.log('Found order by Razorpay notes.orderId:', existingOrder._id);
                    }
                }
                
                // Try to find by receipt number from Razorpay
                if (!existingOrder && razorpayOrder.receipt) {
                    console.log('Trying to find order by receipt:', razorpayOrder.receipt);
                    
                    // Try exact match on receipt field
                    existingOrder = await Order.findOne({ 'receipt': razorpayOrder.receipt });
                    
                    // If not found, try with 'order_' prefix
                    if (!existingOrder && !razorpayOrder.receipt.startsWith('order_')) {
                        existingOrder = await Order.findOne({ 'receipt': `order_${razorpayOrder.receipt}` });
                    }
                    
                    // If still not found, try to extract order ID from receipt
                    if (!existingOrder && razorpayOrder.notes) {
                        console.log('Checking Razorpay notes for order matching:', razorpayOrder.notes);
                        
                        // Try to find by cartId from Razorpay notes
                        if (razorpayOrder.notes.cartId) {
                            console.log('Trying to find order by cartId:', razorpayOrder.notes.cartId);
                            existingOrder = await Order.findOne({ 'cart': razorpayOrder.notes.cartId });
                            if (existingOrder) {
                                console.log('Found order by cartId:', existingOrder._id);
                            }
                        }
                        
                        // Try to find by addressId from Razorpay notes
                        if (!existingOrder && razorpayOrder.notes.addressId) {
                            console.log('Trying to find order by addressId:', razorpayOrder.notes.addressId);
                            try {
                                existingOrder = await Order.findOne({ 
                                    'shippingAddress': new mongoose.Types.ObjectId(razorpayOrder.notes.addressId),
                                    'payment.razorpayOrderId': razorpayOrder.id
                                });
                                if (existingOrder) {
                                    console.log('Found order by addressId and Razorpay ID:', existingOrder._id);
                                }
                            } catch (error) {
                                console.error('Error finding order by addressId:', error.message);
                            }
                        }
                        
                        // If still not found, try to find by user ID and amount
                        if (!existingOrder && razorpayOrder.notes.userId && razorpayOrder.amount) {
                            console.log('Trying to find order by userId and amount:', {
                                userId: razorpayOrder.notes.userId,
                                amount: razorpayOrder.amount / 100 // Convert back to currency units
                            });
                            existingOrder = await Order.findOne({
                                'user': new mongoose.Types.ObjectId(razorpayOrder.notes.userId),
                                'total': razorpayOrder.amount / 100,
                                'payment.status': 'pending',
                                'status': 'pending'
                            }).sort({ createdAt: -1 }); // Get the most recent matching order
                            
                            if (existingOrder) {
                                console.log('Found pending order by user ID and amount:', existingOrder._id);
                            }
                        }
                    }
                    
                    if (existingOrder) {
                        console.log('Found order by receipt/notes:', existingOrder._id);
                        // Update the order with Razorpay order ID for future reference
                        existingOrder.payment = existingOrder.payment || {};
                        existingOrder.payment.razorpayOrderId = razorpayOrder.id;
                        await existingOrder.save();
                        console.log('Updated order with Razorpay ID for future reference');
                    }
                }
                
                // If we found an order, update it with the Razorpay order ID for future reference
                if (existingOrder) {
                    existingOrder.payment = existingOrder.payment || {};
                    existingOrder.payment.razorpayOrderId = razorpayOrderId;
                    await existingOrder.save();
                    console.log('Updated order with Razorpay ID for future reference');
                }
                
            } catch (error) {
                console.error('Error fetching Razorpay order:', error.message);
                if (error.response) {
                    console.error('Razorpay API error:', error.response.data);
                }
            }
        }

        // If order still not found, log detailed error
        if (!existingOrder) {
            const errorMessage = `Order not found for Razorpay order ID: ${razorpayOrderId}. User: ${req.user?._id || 'Not authenticated'}`;
            console.error(errorMessage, {
                razorpayOrderId,
                razorpayPaymentId,
                user: req.user?._id,
                time: new Date().toISOString()
            });
            
            return res.status(404).json({
                success: false,
                message: 'Order not found. Please contact support with this reference: ' + razorpayOrderId,
                code: 'ORDER_NOT_FOUND',
                details: {
                    razorpayOrderId,
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        console.log('Found order:', {
            orderId: existingOrder._id,
            status: existingOrder.status,
            amount: existingOrder.amount,
            user: existingOrder.user
        });

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

        // Set order token in cookie to prevent going back to checkout
        const orderToken = jwt.sign(
            { orderId: order._id.toString(), userId: req.user._id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

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
    const useTransactions = process.env.NODE_ENV === 'production';
    const session = useTransactions ? await mongoose.startSession() : null;
    
    try {
        const userId = req.user._id;
        const { addressId } = req.body;

        // Start transaction if enabled
        if (useTransactions) {
            session.startTransaction();
        }

        // Find user (with or without session)
        const query = User.findById(userId);
        if (useTransactions) query.session(session);
        const user = await query;
        
        if (!user) {
            if (useTransactions) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Find user's cart
        const cartQuery = Cart.findOne({ user: userId })
            .populate({ path: 'items.product', populate: { path: 'category' } });
            
        if (useTransactions) cartQuery.session(session);
        const cart = await cartQuery;

        if (!cart || !cart.items || cart.items.length === 0) {
            if (useTransactions) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            if (useTransactions) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(404).json({ success: false, message: 'Shipping address not found' });
        }

        // First get order items with best offers applied
        const orderItems = await exports.getOrderItems(cart.items);
        
        // Calculate order totals based on the items with offers
        const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const offerDiscount = orderItems.reduce((sum, item) => sum + (item.offerDiscount || 0), 0);
        const couponDiscount = cart.couponDiscount || 0;
        const deliveryCharge = 0; // Free delivery
        const total = Math.max(0, subtotal - couponDiscount + deliveryCharge);

        // Log detailed order information
        console.log('\n--- Order Calculation Details ---');
        console.log('Cart Items:', cart.items.map(item => ({
            name: item.product?.name,
            quantity: item.quantity,
            regularPrice: item.product?.regularPrice,
            salePrice: item.product?.salesPrice,
            finalPrice: item.product?.offerDetails?.finalPrice,
            hasOffer: item.product?.offerDetails?.hasOffer,
            offerDiscount: item.product?.offerDetails?.offerDiscount
        })));

        // Calculate final amount after all discounts and offers
        const finalAmount = Math.max(0, total); // Ensure amount is not negative
        
        console.log('\n--- Order Totals ---');
        console.log('Subtotal:', subtotal);
        console.log('Coupon Discount:', couponDiscount);
        console.log('Offer Discount:', offerDiscount);
        console.log('Delivery Charge:', deliveryCharge);
        console.log('Total:', total);
        console.log('Final Amount:', finalAmount);
        console.log('------------------------\n');
        
        // Ensure user has a wallet and get the latest balance
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            wallet = new Wallet({
                user: userId,
                balance: 0,
                transactions: []
            });
            await wallet.save(useTransactions ? { session } : {});
        } else if (useTransactions) {
            // If using transactions, get the latest wallet state
            wallet = await Wallet.findOne({ user: userId }).session(session);
        }

        // Log wallet balance before deduction
        console.log('Wallet Balance Before:', wallet.balance);
        console.log('Amount to Deduct:', finalAmount);
        console.log('Will have sufficient balance?', wallet.balance >= finalAmount);

        // Check if user has sufficient balance
        if (wallet.balance < finalAmount) {
            if (useTransactions) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(400).json({
                success: false, 
                message: `Insufficient wallet balance. Your balance is ₹${wallet.balance.toFixed(2)} but the order total is ₹${finalAmount.toFixed(2)}`,
                currentBalance: wallet.balance,
                orderTotal: finalAmount
            });
        }

        try {
            // Prepare order items with required fields
            const processedOrderItems = orderItems.map(item => ({
                ...item,
                status: 'Active', // Default status for new order items
                // Ensure all required fields are present
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
                paymentStatus: 'Paid', // Must match the enum in orderSchema
                orderStatus: 'Pending', // Changed from 'Processing' to 'Pending' to match online payment flow
                subtotal,
                couponDiscount: couponDiscount || 0,
                totalCoupon: couponDiscount || 0, // Store original coupon amount
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

            // Save options with or without session
            const saveOptions = useTransactions ? { session } : {};
            
            // Save the order
            const savedOrder = await newOrder.save(saveOptions);

           

            // Check if user has a wallet, if not create one
            if (!user.wallet) {
                const newWallet = new Wallet({
                    user: userId,
                    balance: 0,
                    transactions: []
                });
                await newWallet.save(saveOptions);
                user.wallet = newWallet._id;
            }

            // Get current wallet balance and calculate new balance with final amount
            const currentWallet = await Wallet.findOne({ user: userId });
            const currentBalance = currentWallet?.balance || 0;
            const newBalance = currentBalance - finalAmount;

            // Create transaction data
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
                    upsert: true // Create wallet if it doesn't exist
                }
            );
            
            if (!wallet) {
                throw new Error('Failed to process wallet payment: Wallet not found');
            }
            
            // Update user reference if this is a new wallet
            if (!user.wallet.equals(wallet._id)) {
                user.wallet = wallet._id;
                await user.save(saveOptions);
            }

            // Commit the transaction if using transactions
            if (useTransactions) {
                await session.commitTransaction();
                session.endSession();
            }

            // Clear the user's cart after successful order creation
            // This is done outside the transaction to avoid issues with the cart being cleared before the order is created
            await exports.clearCart(cart);

            // Send success response
            return res.status(200).json({
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
            console.error('Wallet payment error:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to process wallet payment',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    } catch (error) {
        console.error('Unexpected error in wallet payment:', error);
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred while processing your payment',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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

