const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['credit', 'debit', 'refund'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: [0, 'Amount cannot be negative']
    },
    finalAmount: {
        type: Number,
        default: 0
    },
    originalAmount: {
        type: Number,
        default: 0
    },
    offerDiscount: {
        type: Number,
        default: 0
    },
    couponDiscount: {
        type: Number,
        default: 0
    },
    couponRatio: {
        type: Number,
        default: 0
    },
    description: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    orderId: {
        type: String,
        required: false
    },
    paymentId: {
        type: String,
        required: false
    },
    orderReference: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: false
    },
    razorpayPaymentId: {
        type: String
    },
    razorpayRefundId: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed'
    },
    // Additional fields for order details if needed
    orderDetails: {
        items: [{
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Menu'
            },
            quantity: Number,
            price: Number,
            offerApplied: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Offer'
            },
            couponApplied: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Coupon'
            },
            offerDiscount: Number,
            couponDiscount: Number
        }],
        subTotal: Number,
        total: Number
    }
});

const walletSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Balance cannot be negative']
    },
    transactions: [transactionSchema]
}, {
    timestamps: true
});

walletSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Wallet', walletSchema);


