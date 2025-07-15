const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    description: {
        type: String,
        trim: true
    },
    discountType: {
        type: String,
        required: true,
        enum: ['percentage', 'fixed'],
        default: 'fixed'
    },
    discountValue: {
        type: Number,
        required: true,
        min: [0, 'Discount value cannot be negative']
    },
    minPurchase: {
        type: Number,
        required: true,
        min: [0, 'Minimum purchase amount cannot be negative'],
        default: 0
    },
    maxDiscount: {
        type: Number,
        min: [0, 'Maximum discount cannot be negative']
    },
    validFrom: {
        type: Date,
        required: true,
        default: Date.now
    },
    validUntil: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    usageLimit: {
        type: Number,
        required: true,
        min: [1, 'Usage limit must be at least 1']
    },
    usedCount: {
        type: Number,
        default: 0,
        min: [0, 'Used count cannot be negative']
    }
}, {
    timestamps: true
});

couponSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

couponSchema.methods.isValid = function() {
    const now = new Date();
    return (
        this.isActive &&
        now >= this.validFrom &&
        now <= this.validUntil &&
        this.usedCount < this.usageLimit
    );
};

couponSchema.methods.calculateDiscount = function(subtotal) {
    if (!this.isValid()) {
        throw new Error('Coupon is not valid');
    }

    if (subtotal < this.minPurchase) {
        throw new Error(`Minimum purchase amount of ${this.minPurchase} required`);
    }

    let discount = 0;
    if (this.discountType === 'percentage') {
        discount = (subtotal * this.discountValue) / 100;
        if (this.maxDiscount) {
            discount = Math.min(discount, this.maxDiscount);
        }
    } else {
        discount = this.discountValue;
    }

    return Math.min(discount, subtotal);
};

module.exports = mongoose.model('Coupon', couponSchema);