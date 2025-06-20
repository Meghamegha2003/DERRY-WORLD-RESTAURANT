const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure one rating per user per product
ratingSchema.index({ user: 1, product: 1 }, { unique: true });

// Update the updatedAt timestamp before saving
ratingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Rating = mongoose.model('Rating', ratingSchema);

module.exports = Rating;