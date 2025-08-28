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
    maxDiscount: {
        type: Number,
        min: [0, 'Maximum discount cannot be negative'],
        default: null // Only for percentage coupons
    },
    minPurchase: {
        type: Number,
        required: true,
        min: [0, 'Minimum purchase amount cannot be negative'],
        default: 0
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

// Validation method
couponSchema.methods.isValid = function() {
    const now = new Date();
    return (
        this.isActive &&
        now >= this.validFrom &&
        now <= this.validUntil &&
        this.usedCount < this.usageLimit
    );
};

// Method to calculate total discount for an order
couponSchema.methods.calculateTotalDiscount = function(orderSubtotal) {
    if (!this.isValid()) {
        throw new Error('Coupon is not valid');
    }

    if (orderSubtotal < this.minPurchase) {
        throw new Error(`Minimum purchase amount of ₹${this.minPurchase} required`);
    }

    let totalDiscount = 0;
    
    if (this.discountType === 'percentage') {
        totalDiscount = (orderSubtotal * this.discountValue) / 100;
        // Apply max discount cap for percentage coupons
        if (this.maxDiscount && this.maxDiscount > 0) {
            totalDiscount = Math.min(totalDiscount, this.maxDiscount);
        }
    } else if (this.discountType === 'fixed') {
        totalDiscount = this.discountValue;
    }

    // Ensure discount doesn't exceed order subtotal
    return Math.min(totalDiscount, orderSubtotal);
};

// Alias method for backward compatibility
couponSchema.methods.calculateDiscount = function(orderSubtotal) {
    return this.calculateTotalDiscount(orderSubtotal);
};

module.exports = mongoose.model('Coupon', couponSchema);