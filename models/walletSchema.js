const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: [0, 'Amount cannot be negative']
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

// Add compound index for better query performance
walletSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Wallet', walletSchema);


