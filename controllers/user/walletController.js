const HttpStatus = require('../../utils/httpStatus');
const generateReferralCode = require('../../utils/generateReferralCode');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Cart = require('../../models/cartSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');

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

exports.initializeAddMoney = async function (req, res) {
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

exports.verifyAndAddMoney = async function (req, res) {
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

        const wallet = await Wallet.findOneAndUpdate(
            { user: userId },
            {
                $inc: { balance: amountValue },
                $push: {
                    transactions: {
                        type: 'credit',
                        amount: amountValue,
                        finalAmount: amountValue,
                        description: 'Wallet top-up',
                        status: 'completed',
                        razorpayPaymentId: razorpay_payment_id,
                        razorpayOrderId: razorpay_order_id
                    }
                }
            },
            { new: true, upsert: true }
        );

        await User.findByIdAndUpdate(userId, {
            $set: { wallet: wallet._id }
        });

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

exports.getWallet = async function (req, res) {
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

    const cartCount = cart?.items
      ? new Set(cart.items.map(i => i.product.toString())).size
      : 0;

    const transactionsSorted = wallet.transactions
      .slice()
      .sort((a, b) =>
        new Date(b.createdAt || b.date || 0) -
        new Date(a.createdAt || a.date || 0)
      );

    const start = (page - 1) * limit;
    const paginated = transactionsSorted.slice(start, start + limit);

    const txList = paginated.map(tx => ({
      _id: tx._id || new mongoose.Types.ObjectId(),
      date: tx.createdAt || tx.date,
      type: tx.type,
      amount: tx.amount,
      finalAmount: tx.finalAmount,
      description: tx.description,
      status: tx.status
    }));

    res.render('user/wallet', {
      title: 'My Wallet',
      user: req.user,
      wallet,
      txList,
      cartCount
    });

  } catch (error) {
    console.error(error);
    req.flash('error', 'Failed to load wallet');
    res.redirect('/user/dashboard');
  }
};


exports.processReferralReward = async function (referrerId, referredId) {
    try {
        const referrerBonus = 100;
        const referredBonus = 50;

        let referrerWallet = await Wallet.findOne({ user: referrerId });

        if (!referrerWallet) {
            referrerWallet = await Wallet.create({
                user: referrerId,
                balance: referrerBonus,
                transactions: []
            });
        } else {
            referrerWallet.balance += referrerBonus;
        }

        referrerWallet.transactions.push({
            type: 'credit',
            amount: referrerBonus,
            description: 'Referral bonus earned',
            status: 'completed'
        });

        await referrerWallet.save();

        let referredWallet = await Wallet.findOne({ user: referredId });

        if (!referredWallet) {
            referredWallet = await Wallet.create({
                user: referredId,
                balance: referredBonus,
                transactions: []
            });
        } else {
            referredWallet.balance += referredBonus;
        }

        referredWallet.transactions.push({
            type: 'credit',
            amount: referredBonus,
            description: 'Welcome bonus via referral',
            status: 'completed'
        });

        await referredWallet.save();

        return true;

    } catch (error) {
        console.error('Referral reward error:', error);
        return false;
    }
};

exports.getTransactions = async function (req, res) {
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
