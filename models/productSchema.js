const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
    productName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
    },
    regularPrice: {
        type: Number,
        required: true
    },
    salesPrice: {
        type: Number,
        required: true
    },
    offerPrice: {
        type: Number,
        default: 0,
    },
    quantity: {
        type: Number,
        required: true
    },
    productImage: [{ 
        type: [{ type: String }], 
    }],
    status: {
        type: String,
        enum: ['Available', 'Out of stock', 'Discontinued'],
        default: 'Available',
        // required: true
    },
    isAvailable: {
        type: Boolean,
        default: true
    },
    isSpecialOffer: {
        type: Boolean,
        default: false
    },
    type: { // New field for product type
        type: String,
        enum: ['veg', 'non-veg', 'vegan'],
        required: true
    }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
