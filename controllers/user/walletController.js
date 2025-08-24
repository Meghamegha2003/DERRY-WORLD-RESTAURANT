const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Cart = require('../../models/cartSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
let razorpay;
try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.error('Razorpay credentials are missing in environment variables');
        throw new Error('Razorpay credentials are missing');
    }
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
} catch (error) {
    console.error('Failed to initialize Razorpay:', error);
}

// Initialize add money to wallet via Razorpay
exports.initializeAddMoney = async function(req, res) {
    try {
        const { amount } = req.body;
        
        if (!amount || isNaN(amount) || amount < 1) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid amount (minimum ₹1)'
            });
        }

        const options = {
            amount: amount * 100, // Razorpay expects amount in paise
            currency: 'INR',
            receipt: `wallet_${Date.now()}`,
            payment_capture: 1
        };

        const order = await razorpay.orders.create(options);
        
        res.status(200).json({
            success: true,
            order,
            key_id: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Error initializing wallet top-up:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize wallet top-up. Please try again.'
        });
    }
};

// Verify and add money to wallet after successful payment
exports.verifyAndAddMoney = async function(req, res) {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = req.body;
        
        // Validate required fields
        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !amount) {
            console.error('Missing required parameters:', {
                hasPaymentId: !!razorpay_payment_id,
                hasOrderId: !!razorpay_order_id,
                hasSignature: !!razorpay_signature,
                hasAmount: !!amount
            });
            return res.status(400).json({
                success: false,
                message: 'Missing required payment information'
            });
        }
        
        // Validate and parse amount
        const amountValue = parseFloat(amount);
        if (isNaN(amountValue) || amountValue <= 0) {
            console.error('Invalid amount provided:', amount);
            return res.status(400).json({
                success: false,
                message: 'Invalid amount provided'
            });
        }
        
        const userId = req.user._id;
        if (!userId) {
            console.error('User ID not found in request');
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        // Verify payment signature
        const text = razorpay_order_id + '|' + razorpay_payment_id;
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(text)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            console.error('Signature verification failed', {
                expected: generatedSignature,
                received: razorpay_signature,
                order_id: razorpay_order_id,
                payment_id: razorpay_payment_id,
                text: text,
                key_used: process.env.RAZORPAY_KEY_SECRET ? 'Key exists' : 'Key missing'
            });
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed: Invalid signature',
                debug: process.env.NODE_ENV === 'development' ? {
                    expected: generatedSignature,
                    received: razorpay_signature
                } : undefined
            });
        }

        // Find or create wallet
        let wallet = await Wallet.findOne({ user: userId });
        
        if (!wallet) {
            wallet = new Wallet({
                user: userId,
                balance: 0,
                transactions: []
            });
        }

        // Add money to wallet
        wallet.balance = (wallet.balance || 0) + amountValue;
        
        // Add transaction
        wallet.transactions.push({
            type: 'credit',
            amount: amountValue,
            finalAmount: amountValue,
            description: 'Wallet top-up',
            status: 'completed',
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            offerDiscount: 0,
            couponDiscount: 0
        });

        await wallet.save();

        // Update user's wallet reference if not set
        const user = await User.findById(userId);
        if (!user.wallet) {
            user.wallet = wallet._id;
            await user.save();
        }

        res.status(200).json({
            success: true,
            message: 'Money added to wallet successfully',
            balance: wallet.balance
        });

    } catch (error) {
        console.error('Error adding money to wallet:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add money to wallet. Please contact support.'
        });
    }
};

// Get wallet details
exports.getWallet = async function(req, res) {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Number of transactions per page
        
        // Find or create wallet for the user
        let wallet = await Wallet.findOne({ user: userId });
            
        if (!wallet) {
            wallet = await Wallet.create({
                user: userId,
                balance: 0,
                transactions: []
            });
        }
        
        // Get user's cart count for the header
        const cart = await Cart.findOne({ user: userId });
        const cartCount = cart ? cart.items.length : 0;
        
        // Add referral information
        const referral = {
            referrerBonus: 100,  // ₹100 for referrer
            referredBonus: 50,   // ₹50 for referred friend
            count: wallet.referralCount || 0,
            code: req.user.referralCode || '',
            earnings: wallet ? wallet.referralEarnings || 0 : 0
        };

        // Get total number of transactions
        const totalTransactions = wallet.transactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = Math.min(page * limit, totalTransactions);
        
        // Get paginated transactions (sorted by date descending - newest first)
        const transactions = wallet.transactions
            .slice()
            .sort((a, b) => {
                const dateA = a.date || a.createdAt || 0;
                const dateB = b.date || b.createdAt || 0;
                return new Date(dateB) - new Date(dateA);
            })
            .slice(startIndex, endIndex);
        
        // Format transactions for the view
        const txList = transactions.map(tx => {
            // Ensure we have a proper date
            const txDate = tx.date || tx.createdAt || new Date();
            
            // Format the transaction description based on type
            let description = tx.description || '';
            if (tx.orderId) {
                const orderId = tx.orderId.toString().slice(-8).toUpperCase();
                if (description.toLowerCase().includes('cancelled') || description.toLowerCase().includes('cancel')) {
                    description = `Order #${orderId} Cancelled`;
                } else if (description.toLowerCase().includes('refund')) {
                    description = `Refund for order #${orderId}`;
                } else if (description.toLowerCase().includes('order')) {
                    description = `Payment for order #${orderId}`;
                }
            }
            
            return {
                _id: tx._id || new mongoose.Types.ObjectId(),
                date: txDate,
                type: tx.type || 'credit',
                amount: tx.amount || 0,
                description: description,
                status: tx.status || 'completed',
                orderId: tx.orderId,
                orderReference: tx.orderId, // Add orderReference for backward compatibility
                referenceId: tx.referenceId || `TXN-${Date.now()}`,
                previousBalance: tx.previousBalance || 0,
                newBalance: tx.newBalance || (tx.amount || 0)
            };
        });

        res.render('user/wallet', {
            title: 'My Wallet',
            user: req.user,
            wallet: {
                ...wallet.toObject(),
                transactions: {
                    items: transactions,
                    total: totalTransactions,
                    limit: limit,
                    currentPage: page,
                    totalPages: totalPages,
                    hasNextPage: endIndex < totalTransactions,
                    hasPrevPage: startIndex > 0,
                    nextPage: page < totalPages ? page + 1 : null,
                    prevPage: page > 1 ? page - 1 : null
                }
            },
            txList: txList, // Add transactions in the format expected by the view
            cartCount: cartCount,
            referral: referral,
            razorpayKey: process.env.RAZORPAY_KEY_ID || ''
        });
        
    } catch (error) {
        console.error('Error fetching wallet:', error);
        req.flash('error', 'Failed to load wallet. Please try again.');
        res.redirect('/user/dashboard');
    }
};

// Generate unique referral code
exports.generateReferralCode = function(userId) {
    const prefix = userId.toString().substring(0, 6);
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${randomChars}`;
};

// Process referral reward
exports.processReferralReward = async function(referrerId, referredId) {
    try {
        const referrerBonus = 100; // ₹100 for referrer
        const referredBonus = 50;  // ₹50 for new user

        // Add bonus to referrer's wallet
        const referrerWallet = await Wallet.findOne({ user: referrerId });
        if (!referrerWallet) {
            await new Wallet({
                user: referrerId,
                balance: referrerBonus,
                transactions: [{
                    type: 'credit',
                    amount: referrerBonus,
                    description: 'Referral bonus - Thank you for referring a friend!',
                    status: 'completed',
                    offerDiscount: 0,
                    couponDiscount: 0
                }]
            }).save();
        } else {
            referrerWallet.balance += referrerBonus;
            // Add transaction to wallet with order details
            referrerWallet.transactions.push({
                type: 'debit',
                amount: referrerBonus, // Original order total before discounts
                finalAmount: referrerBonus, // Final amount after all discounts
                originalAmount: referrerBonus, // Keep original amount for reference
                offerDiscount: 0,
                couponDiscount: 0,
                description: `Referral bonus - Thank you for referring a friend!`,
                status: 'completed',
                orderDetails: {
                    items: [],
                    subTotal: referrerBonus,
                    total: referrerBonus,
                    offerDiscount: 0,
                    couponDiscount: 0
                }
            });
            await referrerWallet.save();
        }

        // Add bonus to referred user's wallet
        const referredWallet = await Wallet.findOne({ user: referredId });
        if (!referredWallet) {
            await new Wallet({
                user: referredId,
                balance: referredBonus,
                transactions: [{
                    type: 'credit',
                    amount: referredBonus,
                    description: 'Welcome bonus for joining via referral!',
                    status: 'completed',
                    offerDiscount: 0,
                    couponDiscount: 0
                }]
            }).save();
        } else {
            referredWallet.balance += referredBonus;
            // Add transaction to wallet with order details
            referredWallet.transactions.push({
                type: 'debit',
                amount: referredBonus, // Original order total before discounts
                finalAmount: referredBonus, // Final amount after all discounts
                originalAmount: referredBonus, // Keep original amount for reference
                offerDiscount: 0,
                couponDiscount: 0,
                description: `Welcome bonus for joining via referral!`,
                status: 'completed',
                orderDetails: {
                    items: [],
                    subTotal: referredBonus,
                    total: referredBonus,
                    offerDiscount: 0,
                    couponDiscount: 0
                }
            });
            await referredWallet.save();
        }

        return true;
        // Update user's wallet reference
        if (!user.wallet) {
            user.wallet = wallet._id;
            await user.save();
        }

        res.status(200).json({
            success: true,
            message: 'Payment verified and money added to wallet successfully'
        });

    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify payment. Please contact support if money was deducted.'
        });
    }
};

// Get wallet transactions
exports.getTransactions = async function(req, res) {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        const transactions = await Wallet.find({ user: userId })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('orderId', 'orderNumber totalAmount');

        const totalTransactions = await Wallet.countDocuments({ user: userId });

        res.json({
            success: true,
            transactions,
            currentPage: page,
            totalPages: Math.ceil(totalTransactions / limit)
        });

    } catch (error) {
        console.error('Error fetching wallet transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wallet transactions'
        });
    }
};
