const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    category: {
        type: String,
        required: true,
        enum: ['appetizer', 'main course', 'dessert', 'beverage']
    },
    dietaryType: {
        type: String,
        required: true,
        enum: ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free'],
        default: 'Non-Vegetarian'
    },
    image: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
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

menuSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Menu = mongoose.model('Menu', menuSchema);

module.exports = Menu;