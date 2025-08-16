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
        // Calculate percentage discount with 2 decimal places precision
        discount = parseFloat(((subtotal * this.discountValue) / 100).toFixed(2));
        
        // Apply max discount if specified
        if (this.maxDiscount) {
            discount = Math.min(discount, parseFloat(this.maxDiscount.toFixed(2)));
        }
    } else {
        // For fixed discount, ensure it doesn't exceed the subtotal
        discount = Math.min(parseFloat(this.discountValue.toFixed(2)), subtotal);
    }

    // Ensure discount is not negative and doesn't exceed subtotal
    return Math.max(0, Math.min(discount, subtotal));
};

module.exports = mongoose.model('Coupon', couponSchema);