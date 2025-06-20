const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    review: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    dietaryType: {
        type: String,
        enum: ['veg', 'nonveg', 'vegan'],
        required: [true, 'Dietary type is required']
    },
    regularPrice: {
        type: Number,
        required: [true, 'Regular price is required'],
        min: 0
    },
    salesPrice: {
        type: Number,
        required: [true, 'Sales price is required'],
        min: 0
    },
    bestOffer: {
        type: Number,
        default: null
    },
    finalPrice: {
        type: Number
    },
    quantity: {
        type: Number,
        required: [true, 'Quantity is required'],
        min: 0
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true
    },
    productImage: {
        type: [String],
        required: [true, 'Product image is required']
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isListed: {
        type: Boolean,
        default: true
    },
    ratings: [ratingSchema],
    averageRating: {
        type: Number,
        default: 0
    },
    totalRatings: {
        type: Number,
        default: 0
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Calculate average rating before saving
productSchema.pre('save', function(next) {
    // Compute final price based on bestOffer or salesPrice
    this.finalPrice = (this.bestOffer != null) ? this.bestOffer : this.salesPrice;
    if (this.ratings && this.ratings.length > 0) {
        const totalRating = this.ratings.reduce((sum, rating) => sum + rating.rating, 0);
        this.averageRating = totalRating / this.ratings.length;
        this.totalRatings = this.ratings.length;
    } else {
        this.averageRating = 0;
        this.totalRatings = 0;
    }
    this.updatedAt = new Date();
    next();
});

// Middleware to update the updatedAt field before updating
productSchema.pre('findOneAndUpdate', function(next) {
    this._update.updatedAt = new Date();
    next();
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;