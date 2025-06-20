const mongoose = require('mongoose');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');

async function updateProducts() {
    try {
        await mongoose.connect('mongodb://localhost:27017/derry');

        // Get all categories
        const categories = await Category.find();

        // Get the category IDs
        const mainCourseId = categories.find(c => c.name === 'Main Course')._id;
        const appetizersId = categories.find(c => c.name === 'Appetizers')._id;

        // Update existing products
        const products = await Product.find();
        
        for (const product of products) {
            // Clean up the product name and description
            if (product.name.toLowerCase().includes('beef') || product.name.toLowerCase().includes('chicken')) {
                // Update to Main Course category
                product.category = mainCourseId;
                product.description = product.name.toLowerCase().includes('beef') 
                    ? 'Tender and juicy beef prepared to perfection'
                    : 'Succulent chicken cooked to golden perfection';
            } else {
                // Default to Appetizers for other products
                product.category = appetizersId;
                product.description = 'Delicious appetizer to start your meal';
            }

            // Save the updated product
            await product.save();
        }

    } catch (error) {
        console.error('Error updating products:', error);
    } finally {
        await mongoose.disconnect();
    }
}

updateProducts();