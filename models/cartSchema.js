const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1'],
        max: [5, 'Maximum 5 units allowed per item'],
        default: 1,
        validate: {
            validator: Number.isInteger,
            message: 'Quantity must be a whole number'
        }
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'Price cannot be negative']
    },
    originalPrice: {
        type: Number,
        required: true,
        min: [0, 'Original price cannot be negative']
    },
    discountPercentage: {
        type: Number,
        default: 0,
        min: [0, 'Discount percentage cannot be negative'],
        max: [100, 'Discount percentage cannot exceed 100']
    }
});

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,  
        ref: 'User',  
        required: true
    },
    items: [cartItemSchema],
    appliedCoupon: {
        code: String,
        discountType: {
            type: String,
            enum: ['percentage', 'fixed']
        },
        discountAmount: Number,
        maxDiscount: Number,
        couponId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Coupon'
        }
    },
    couponDiscount: {
        type: Number,
        default: 0,
        min: [0, 'Coupon discount cannot be negative']
    },
    couponCode: {
        type: String,
        default: null
    },
    couponType: {
        type: String,
        default: null
    },
    couponValue: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Method to calculate totals
cartSchema.methods.calculateTotals = function() {
    // Calculate subtotal from items (using price which now includes any active offers)
    const subtotal = this.items.reduce((total, item) => {
        return total + (item.price * item.quantity);
    }, 0);

    // Calculate delivery charge (free for orders ≥ ₹500)
    const deliveryCharge = subtotal >= 500 ? 0 : 40;

    // Get coupon discount (already calculated and stored)
    const couponDiscount = this.couponDiscount || 0;

    // Calculate total savings
    const totalSavings = this.items.reduce((savings, item) => {
        const originalTotal = item.originalPrice * item.quantity;
        const discountedTotal = item.price * item.quantity;
        return savings + (originalTotal - discountedTotal);
    }, 0) + couponDiscount;

    // Calculate final total
    const total = Math.max(0, subtotal - couponDiscount + deliveryCharge);

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        deliveryCharge,
        couponDiscount: Math.round(couponDiscount * 100) / 100,
        totalSavings: Math.round(totalSavings * 100) / 100,
        total: Math.round(total * 100) / 100
    };
};

// Pre-save middleware to validate coupon discount
cartSchema.pre('save', function(next) {
    // Ensure couponDiscount is not negative
    if (this.couponDiscount < 0) {
        this.couponDiscount = 0;
    }

    // Ensure couponDiscount doesn't exceed subtotal
    const subtotal = this.items.reduce((total, item) => {
        return total + (item.price * item.quantity);
    }, 0);
    
    if (this.couponDiscount > subtotal) {
        this.couponDiscount = subtotal;
    }

    // Round couponDiscount to 2 decimal places
    this.couponDiscount = Math.round(this.couponDiscount * 100) / 100;

    next();
});

// Pre-save middleware to ensure quantities are valid
cartSchema.pre('save', function(next) {
    this.items.forEach(item => {
        if (typeof item.quantity !== 'number') {
            item.quantity = 1;
        }
        item.quantity = Math.min(Math.max(1, item.quantity), 5);
    });
    next();
});

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;