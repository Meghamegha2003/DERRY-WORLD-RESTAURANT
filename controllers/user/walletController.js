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

// Generate unique referral code
const generateReferralCode = (userId) => {
    // Take first 6 characters of userId and add random 4 characters
    const prefix = userId.toString().substring(0, 6);
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${randomChars}`;
};

// Process referral reward
const processReferralReward = async (referrerId, referredId) => {
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
                    status: 'completed'
                }]
            }).save();
        } else {
            referrerWallet.balance += referrerBonus;
            referrerWallet.transactions.push({
                type: 'credit',
                amount: referrerBonus,
                description: 'Referral bonus - Thank you for referring a friend!',
                status: 'completed'
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
                    status: 'completed'
                }]
            }).save();
        } else {
            referredWallet.balance += referredBonus;
            referredWallet.transactions.push({
                type: 'credit',
                amount: referredBonus,
                description: 'Welcome bonus for joining via referral!',
                status: 'completed'
            });
            await referredWallet.save();
        }

        return true;
    } catch (error) {
        console.error('Error processing referral reward:', error);
        return false;
    }
};

// Get wallet details and transactions
const getWallet = async (req, res) => {
    try {
        // Prevent caching so the wallet page always shows latest balance
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        // Always fetch the latest wallet and all transactions
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            wallet = await new Wallet({
                user: userId,
                balance: 0,
                transactions: []
            }).save();
            await User.findByIdAndUpdate(userId, { wallet: wallet._id });
        }

        // Sort all transactions (latest first)
        const allTransactions = [...wallet.transactions].sort((a, b) => b.date - a.date);
        const paginatedTransactions = allTransactions.slice(skip, skip + limit);
        const totalTransactions = allTransactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);

        // Fetch the latest user from the database
        const user = await User.findById(userId);
        // If the user does not have a referralCode, generate and save it
        if (user && (!user.referralCode || user.referralCode === '')) {
            const generateReferralCode = (userId) => {
                const prefix = userId.toString().substring(0, 6);
                const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
                return `${prefix}${randomChars}`;
            };
            user.referralCode = generateReferralCode(user._id);
            await user.save();
        }
        // Dynamically compute referral stats
        const referralCount = await User.countDocuments({ referredBy: userId });
        const referralEarnings = wallet.transactions
            .filter(tx => tx.description && tx.description.includes('Referral bonus'))
            .reduce((sum, tx) => sum + tx.amount, 0);
        res.render('user/wallet', {
            user: user,
            wallet: {
                ...wallet.toObject(),
                transactions: {
                    items: paginatedTransactions,
                    currentPage: page,
                    totalPages,
                    hasPrevPage: page > 1,
                    hasNextPage: page < totalPages,
                    totalTransactions
                }
            },
            referral: {
                code: user && user.referralCode ? user.referralCode : '',
                count: referralCount,
                earnings: referralEarnings,
                referrerBonus: 100,
                referredBonus: 50
            },
            cartCount: req.cartCount || 0,
            title: 'Wallet',
            razorpayKey: process.env.RAZORPAY_KEY_ID || ''
        });

    } catch (error) {
        console.error('Error fetching wallet details:', error);
        // Fetch user for referral info
        const user = await User.findById(userId);
        // If the user does not have a referralCode, generate and save it
        if (user && (!user.referralCode || user.referralCode === '')) {
            const generateReferralCode = (userId) => {
                const prefix = userId.toString().substring(0, 6);
                const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
                return `${prefix}${randomChars}`;
            };
            user.referralCode = generateReferralCode(user._id);
            await user.save();
        }
        res.render('user/wallet', {
            title: 'My Wallet',
            error: 'Failed to fetch wallet details. Please try again.',
            wallet: { balance: 0, transactions: [] },
            referral: {
                code: user && user.referralCode ? user.referralCode : '',
                count: user && user.referralCount ? user.referralCount : 0,
                earnings: user && user.referralEarnings ? user.referralEarnings : 0,
                referrerBonus: 100,
                referredBonus: 50
            },
            currentPage: 1,
            totalPages: 1,
            user: req.user,
            cartCount: 0,
            razorpayKey: process.env.RAZORPAY_KEY_ID // Add to error case as well
        });
    }
};

// Initialize add money transaction
const initializeAddMoney = async (req, res) => {
    try {
        // Check if Razorpay is initialized
        if (!razorpay) {
            return res.status(500).json({
                success: false,
                message: 'Payment system is temporarily unavailable'
            });
        }

        // Check if Razorpay key is available
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            return res.status(500).json({
                success: false,
                message: 'Payment system is not configured properly'
            });
        }

        const { amount } = req.body;
        const userId = req.user._id;

        // Validate amount
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid amount greater than 0'
            });
        }

        // Create Razorpay order
        const options = {
            amount: Math.round(parsedAmount * 100), // Convert to paise
            currency: 'INR',
            receipt: `w_${Date.now().toString().slice(-8)}`,
            notes: {
                userId: userId.toString(),
                type: 'wallet_recharge'
            }
        };

        const order = await razorpay.orders.create(options);

        // Send response
        res.status(200).json({
            success: true,
            message: 'Payment initialized successfully',
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency
            }
        });

    } catch (error) {
        console.error('Error initializing payment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize payment. Please try again.'
        });
    }
};

// Verify payment and add money to wallet
const verifyAndAddMoney = async (req, res) => {
    try {
        // Check if Razorpay is initialized
        if (!razorpay) {
            return res.status(500).json({
                success: false,
                message: 'Payment system is temporarily unavailable'
            });
        }

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        // Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment information'
            });
        }

        // Verify signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (!isAuthentic) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        // Get order details
        const order = await razorpay.orders.fetch(razorpay_order_id);
        const amountInRupees = order.amount / 100;

        // Get user from the order notes
        const userId = order.notes.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Create or update wallet transaction
        let wallet = await Wallet.findOne({ user: userId });
        
        if (!wallet) {
            wallet = new Wallet({
                user: userId,
                balance: amountInRupees,
                transactions: [{
                    type: 'credit',
                    amount: amountInRupees,
                    description: 'Added money to wallet via Razorpay',
                    paymentId: razorpay_payment_id,
                    orderId: razorpay_order_id,
                    status: 'completed'
                }]
            });
        } else {
            wallet.balance += amountInRupees;
            wallet.transactions.push({
                type: 'credit',
                amount: amountInRupees,
                description: 'Added money to wallet via Razorpay',
                paymentId: razorpay_payment_id,
                orderId: razorpay_order_id,
                status: 'completed'
            });
        }

        await wallet.save();

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
const getTransactions = async (req, res) => {
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

module.exports = {
    processReferralReward,
    getWallet,
    initializeAddMoney,
    verifyAndAddMoney,
    getTransactions
};