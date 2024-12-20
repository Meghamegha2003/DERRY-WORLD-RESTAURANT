const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
    name: {
        type: String,
        required: true, 
    },
    description: {
        type: String,
        required: true,
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
    },
    regularPrice: {
        type: Number,
        required: true, 
    },
    salesPrice: {
        type: Number,
        required: true, 
    },
    quantity: {
        type: Number,
        required: true, 
    },
    
    offerPrice: {
        type: Number,
        default: 0,
    },
    
    productImage: { type: [String], required: true },
    status: {
        type: String,
        enum: ['Available', 'Out of stock', 'Discontinued'],
        default: 'Available',
        
    },
    isAvailable: {
        type: Boolean,
        default: true
    },
    isSpecialOffer: {
        type: Boolean,
        default: false
    },
    averageRating: { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },
  ratings: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      score: { type: Number, required: true },
      review: String,
    },
  ],
  
      type: { type: String, enum: ['Veg', 'Non-Veg', 'Vegan'], required: false },

}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
