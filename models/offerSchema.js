const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true,
        default: 'percentage'
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    maxDiscount: {
        type: Number,
        min: 0
    },
    minPurchase: {
        type: Number,
        default: 0,
        min: 0
    },
    validFrom: {
        type: Date,
        required: true
    },
    validUntil: {
        type: Date,
        required: true
    },
    targetProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    targetCategories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Middleware to ensure proper references
offerSchema.pre('save', function(next) {
    if (this.targetProducts.length > 0 && this.targetCategories.length > 0) {
        throw new Error('Cannot target both products and categories');
    }
    next();
});

// Virtual for checking if offer is currently valid
offerSchema.virtual('isValid').get(function() {
    const now = new Date();
    return this.isActive && 
           now >= this.validFrom && 
           now <= this.validUntil;
});

// Method to check if an offer can be applied
offerSchema.methods.canApply = function(purchaseAmount) {
    return this.isValid && purchaseAmount >= this.minPurchase;
};

// Method to calculate discount amount
offerSchema.methods.calculateDiscount = function(amount) {
    if (!this.isValid || amount <= 0) return 0;

    let discount = 0;
    if (this.discountType === 'percentage') {
        discount = (amount * this.discountValue) / 100;
    } else {
        discount = Math.min(this.discountValue, amount);
    }
    
    if (this.maxDiscount) {
        discount = Math.min(discount, this.maxDiscount);
    }
    
    return Math.round(discount * 100) / 100; // Round to 2 decimal places
};

// Add indexes for better query performance
offerSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });
offerSchema.index({ targetProducts: 1 }, { sparse: true });
offerSchema.index({ targetCategories: 1 }, { sparse: true });

const Offer = mongoose.model('Offer', offerSchema);
module.exports = Offer;