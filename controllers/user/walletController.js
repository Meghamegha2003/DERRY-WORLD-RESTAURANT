const HttpStatus = require('../../utils/httpStatus');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Cart = require('../../models/cartSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');

let razorpay;
try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new Error('Razorpay credentials are missing');
    }
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
} catch (error) {
}

exports.initializeAddMoney = async function(req, res) {
    try {
        const { amount } = req.body;
        
        if (!amount || isNaN(amount) || amount < 1) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Please enter a valid amount (minimum ₹1)'
            });
        }

        const options = {
            amount: amount * 100, 
            currency: 'INR',
            receipt: `wallet_${Date.now()}`,
            payment_capture: 1
        };

        const order = await razorpay.orders.create(options);
        
        res.status(HttpStatus.OK).json({
            success: true,
            order,
            key_id: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to initialize wallet top-up. Please try again.'
        });
    }
};

exports.verifyAndAddMoney = async function(req, res) {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = req.body;
        
        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !amount) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Missing required payment information'
            });
        }
        
        const amountValue = parseFloat(amount);
        if (isNaN(amountValue) || amountValue <= 0) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Invalid amount provided'
            });
        }
        
        const userId = req.user._id;
        if (!userId) {
            return res.status(HttpStatus.UNAUTHORIZED).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const text = razorpay_order_id + '|' + razorpay_payment_id;
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(text)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Payment verification failed: Invalid signature',
                debug: process.env.NODE_ENV === 'development' ? {
                    expected: generatedSignature,
                    received: razorpay_signature
                } : undefined
            });
        }

        let wallet = await Wallet.findOne({ user: userId });
        
        if (!wallet) {
            wallet = new Wallet({
                user: userId,
                balance: 0,
                transactions: []
            });
        }

        wallet.balance = (wallet.balance || 0) + amountValue;
        
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

        const user = await User.findById(userId);
        if (!user.wallet) {
            user.wallet = wallet._id;
            await user.save();
        }

        res.status(HttpStatus.OK).json({
            success: true,
            message: 'Money added to wallet successfully',
            balance: wallet.balance
        });

    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to add money to wallet. Please contact support.'
        });
    }
};

exports.getWallet = async function(req, res) {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 5; 
        
        let wallet = await Wallet.findOne({ user: userId });
            
        if (!wallet) {
            wallet = await Wallet.create({
                user: userId,
                balance: 0,
                transactions: []
            });
        }
        
        const cart = await Cart.findOne({ user: userId });
        const cartCount = cart?.items ? new Set(
            cart.items
                .filter(item => item && item.product)
                .map(item => item.product.toString())
        ).size : 0;
        
        const referral = {
            referrerBonus: 100, 
            referredBonus: 50,  
            count: wallet.referralCount || 0,
            code: req.user.referralCode || '',
            earnings: wallet ? wallet.referralEarnings || 0 : 0
        };

        const totalTransactions = wallet.transactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = Math.min(page * limit, totalTransactions);
        
        const transactions = wallet.transactions
            .slice()
            .sort((a, b) => {
                const dateA = a.date || a.createdAt || 0;
                const dateB = b.date || b.createdAt || 0;
                return new Date(dateB) - new Date(dateA);
            })
            .slice(startIndex, endIndex);
        
        const txList = transactions.map(tx => {
            const txDate = tx.date || tx.createdAt || new Date();
            
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
                originalAmount: tx.originalAmount || tx.amount || 0, 
                couponDiscount: tx.couponDiscount || 0,
                couponRatio: tx.couponRatio || 0,
                offerDiscount: tx.offerDiscount || 0,
                finalAmount: tx.finalAmount || tx.amount || 0, 
                description: description,
                status: tx.status || 'completed',
                orderId: tx.orderId,
                orderReference: tx.orderId,
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
            txList: txList,
            cartCount: cartCount,
            referral: referral,
            razorpayKey: process.env.RAZORPAY_KEY_ID || ''
        });
        
    } catch (error) {
        req.flash('error', 'Failed to load wallet. Please try again.');
        res.redirect('/user/dashboard');
    }
};

exports.generateReferralCode = function(userId) {
    const prefix = userId.toString().substring(0, 6);
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${randomChars}`;
};

exports.processReferralReward = async function(referrerId, referredId) {
    try {
        const referrerBonus = 100; 
        const referredBonus = 50;  

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
            referrerWallet.transactions.push({
                type: 'debit',
                amount: referrerBonus, 
                finalAmount: referrerBonus, 
                originalAmount: referrerBonus, 
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
            referredWallet.transactions.push({
                type: 'debit',
                amount: referredBonus,
                finalAmount: referredBonus, 
                originalAmount: referredBonus, 
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
        if (!user.wallet) {
            user.wallet = wallet._id;
            await user.save();
        }

        res.status(HttpStatus.OK).json({
            success: true,
            message: 'Payment verified and money added to wallet successfully'
        });

    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to verify payment. Please contact support if money was deducted.'
        });
    }
};

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
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to fetch wallet transactions'
        });
    }
};
