require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/productSchema');

async function debugRatings() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find a product with ratings
        const product = await Product.findOne({ 'ratings.0': { $exists: true } });
        
        if (!product) {
            console.log('No products with ratings found');
            return;
        }

        console.log('Product name:', product.name);
        console.log('Number of ratings:', product.ratings.length);
        
        // Check the structure of the first rating
        if (product.ratings.length > 0) {
            const firstRating = product.ratings[0];
            console.log('\nFirst rating structure:');
            console.log('- user:', firstRating.user);
            console.log('- userId:', firstRating.userId);
            console.log('- rating:', firstRating.rating);
            console.log('- review:', firstRating.review);
            console.log('- images:', firstRating.images);
            console.log('- date:', firstRating.date);
            console.log('- createdAt:', firstRating.createdAt);
            console.log('- Full rating object:', JSON.stringify(firstRating, null, 2));
        }

        // Try to populate user data
        const User = require('./models/userSchema');
        for (let i = 0; i < Math.min(3, product.ratings.length); i++) {
            const rating = product.ratings[i];
            const userId = rating.userId || rating.user;
            
            console.log(`\nRating ${i + 1}:`);
            console.log('- userId from rating:', userId);
            
            if (userId) {
                try {
                    const user = await User.findById(userId).select('name');
                    console.log('- Found user:', user ? user.name : 'User not found');
                } catch (error) {
                    console.log('- Error finding user:', error.message);
                }
            } else {
                console.log('- No userId found in rating');
            }
        }
        
    } catch (error) {
        console.error('Debug failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

debugRatings();
