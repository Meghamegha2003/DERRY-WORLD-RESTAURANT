require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/productSchema');

async function fixRatingUserFields() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all products with ratings
        const products = await Product.find({ 'ratings.0': { $exists: true } });
        console.log(`Found ${products.length} products with ratings`);

        let updatedCount = 0;
        let totalRatingsFixed = 0;

        for (const product of products) {
            let productUpdated = false;
            
            for (let i = 0; i < product.ratings.length; i++) {
                const rating = product.ratings[i];
                
                // If rating has userId but no user field, copy userId to user
                if (rating.userId && !rating.user) {
                    product.ratings[i].user = rating.userId;
                    productUpdated = true;
                    totalRatingsFixed++;
                    console.log(`Fixed rating for product ${product.name}: userId ${rating.userId}`);
                }
                
                // Ensure images field exists
                if (!rating.images) {
                    product.ratings[i].images = [];
                    productUpdated = true;
                }
                
                // Ensure date field exists
                if (!rating.date && rating.createdAt) {
                    product.ratings[i].date = rating.createdAt;
                    productUpdated = true;
                }
            }
            
            if (productUpdated) {
                await product.save();
                updatedCount++;
                console.log(`Updated product: ${product.name}`);
            }
        }

        console.log(`Migration completed:`);
        console.log(`- Products updated: ${updatedCount}`);
        console.log(`- Total ratings fixed: ${totalRatingsFixed}`);
        
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run migration if called directly
if (require.main === module) {
    fixRatingUserFields();
}

module.exports = fixRatingUserFields;
