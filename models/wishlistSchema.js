const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    products: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure each product appears only once in a user's wishlist
wishlistSchema.index({ userId: 1, 'products': 1 }, { unique: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);