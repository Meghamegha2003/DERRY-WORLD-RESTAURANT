const mongoose = require('mongoose');
const { Schema } = mongoose;

const categorySchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true, 
        trim: true,
    },
    
    description: {
        type: String,
        default: '',
    },
    isListed: {
        type: Boolean,
        default: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    categoryOffer: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,  // Add timestamps
    strict: true      // Enforce schema
});

// Add an index for commonly queried fields
categorySchema.index({  isListed: 1, isBlocked: 1 });

const Category = mongoose.model('Category', categorySchema);
module.exports = Category;