require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/productSchema');

async function updateExistingRatings() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all products with ratings
        const products = await Product.find({ 'ratings.0': { $exists: true } });
        console.log(`Found ${products.length} products with ratings`);

        const User = require('../models/userSchema');
        let updatedCount = 0;
        let totalRatingsUpdated = 0;

        for (const product of products) {
            let productUpdated = false;
            
            for (let i = 0; i < product.ratings.length; i++) {
                const rating = product.ratings[i];
                
                // If rating doesn't have userName, try to get it from user
                if (!rating.userName || rating.userName === 'Anonymous') {
                    const userId = rating.userId || rating.user;
                    
                    if (userId) {
                        try {
                            const user = await User.findById(userId).select('name');
                            if (user && user.name) {
                                product.ratings[i].userName = user.name;
                                productUpdated = true;
                                totalRatingsUpdated++;
                                console.log(`Updated rating for product ${product.name}: ${user.name}`);
                            } else {
                                // Set to Anonymous if user not found
                                product.ratings[i].userName = 'Anonymous';
                                productUpdated = true;
                            }
                        } catch (error) {
                            console.log(`Error finding user ${userId}:`, error.message);
                            product.ratings[i].userName = 'Anonymous';
                            productUpdated = true;
                        }
                    } else {
                        // No userId, set to Anonymous
                        product.ratings[i].userName = 'Anonymous';
                        productUpdated = true;
                    }
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
        console.log(`- Total ratings updated: ${totalRatingsUpdated}`);
        
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

updateExistingRatings();
