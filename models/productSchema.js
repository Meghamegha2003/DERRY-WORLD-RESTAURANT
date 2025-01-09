const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Category is required']
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
    }
}, {
    timestamps: true
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;