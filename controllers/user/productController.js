const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const OfferService = require('../../services/offerService');
const Cart = require('../../models/cartSchema');

exports.getCartCount = async (userId) => {
    try {
        const cart = await Cart.findOne({ user: userId });
        if (!cart || !cart.items) return 0;
        // Count unique products, not total quantities
        return new Set(
            cart.items
                .filter(item => item && item.product)
                .map(item => item.product.toString())
        ).size;
    } catch (error) {
        console.error('Error getting cart count:', error);
        return 0;
    }
};


exports.calculateOffersForProducts = async (products) => {
    return await Promise.all(products.map(async (product) => {
        const productObj = product.toObject();
        // Ensure we pass the salesPrice to the offer calculation
        const salesPrice = product.salesPrice;
        
        productObj.offerDetails = await OfferService.getProductWithOffer(product._id);
        return productObj;
    }));
};


exports.capitalizeWords = (str) => {
    return str.replace(/\b\w/g, char => char.toUpperCase());
}


exports.getAllProducts = async (req, res) => {
    const offers = await require("../../models/offerSchema").find({
        isActive: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
    }).lean();
    try {
        let products = await Product.find({ isBlocked: true })
            .populate('category');


        products = await exports.calculateOffersForProducts(products);

        

        res.render('user/products', {
            offers,
            products,
            user: req.user,
            messages: res.locals.messages,
            
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.setMessage('error', 'Failed to fetch products');
        res.redirect('/');
    }
};


exports.getProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = 3;
        const skip = (page - 1) * limit;
        
        const product = await Product.findById(productId).populate('category');
        
        if (!product) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }
            res.setMessage('error', 'Product not found');
            return res.redirect('/products');
        }

        const offerDetails = await OfferService.getBestOffer(product);
        const productObj = product.toObject();
        productObj.offerDetails = {
            bestOffer: offerDetails.bestOffer,
            finalPrice: offerDetails.finalPrice
        };
        productObj.inStock = productObj.quantity > 0;

        // Calculate rating breakdown for Flipkart-style display
        const ratingBreakdown = {
            5: 0, 4: 0, 3: 0, 2: 0, 1: 0
        };
        
        if (product.ratings && product.ratings.length > 0) {
            product.ratings.forEach(rating => {
                ratingBreakdown[rating.rating]++;
            });
        }

        // Calculate percentages
        const totalRatings = product.ratings ? product.ratings.length : 0;
        const ratingPercentages = {};
        for (let i = 1; i <= 5; i++) {
            ratingPercentages[i] = totalRatings > 0 ? Math.round((ratingBreakdown[i] / totalRatings) * 100) : 0;
        }

        // Get paginated reviews
        const paginatedRatings = product.ratings ? 
            product.ratings
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(skip, skip + limit) : [];

        // Use ratings directly since userName is now stored in the schema
        const populatedRatings = paginatedRatings.map(rating => {
            const ratingObj = rating.toObject();
            return {
                ...ratingObj,
                userName: ratingObj.userName || 'Anonymous',
                images: ratingObj.images || []
            };
        });

        // Pagination info
        const totalPages = Math.ceil(totalRatings / limit);
        const reviewsPagination = {
            currentPage: page,
            totalPages,
            totalReviews: totalRatings,
            hasNext: page < totalPages,
            hasPrev: page > 1,
            nextPage: page + 1,
            prevPage: page - 1
        };

        let isInCart = false;
        if (req.user) {
            const cart = await Cart.findOne({ user: req.user._id });
            if (cart?.items) {
                isInCart = cart.items.some(item => item.product.toString() === productId);
            }
        }

        const cartCount = req.user ? await exports.getCartCount(req.user._id) : 0;


        let relatedProducts = [];
        if (product.category) {
            const related = await Product.find({
                _id: { $ne: productId },
                category: product.category._id,
                isListed: true,
                isBlocked: false
            }).limit(8);

            relatedProducts = await Promise.all(related.map(async (rp) => {
                const rpOffer = await OfferService.getBestOffer(rp);
                const rpObj = rp.toObject();
                rpObj.offerDetails = rpOffer;
                rpObj.finalPrice = rpOffer.finalPrice;
                rpObj.inStock = rpObj.quantity > 0;
                return rpObj;
            }));
        }


        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                product: productObj,
                relatedProducts,
                inCart: isInCart
            });
        }


        res.render('user/foodDetails', {
            title: product.name,
            product: productObj,
            relatedProducts,
            user: req.user,
            messages: res.locals.messages,
            isInCart,
            cartCount,
            path: '/menu',
            ratingBreakdown,
            ratingPercentages,
            paginatedRatings: populatedRatings,
            reviewsPagination
        });

    } catch (error) {
        console.error('Error getting product details:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ 
                success: false, 
                message: 'Error loading product details' 
            });
        }
        res.setMessage('error', 'Failed to load product details');
        res.redirect('/products');
    }
};


exports.calculateProductPrice = async (req, res) => {
    try {
        const { productId } = req.params;
        const product = await Product.findById(productId);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const offerDetails = await OfferService.getProductWithOffer(productId);

        

        res.json({
            success: true,
            price: offerDetails.finalPrice,
            offerDetails,
            
        });
    } catch (error) {
        console.error('Error calculating product price:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate price'
        });
    }
};


exports.rateProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const { rating, review } = req.body;
        const userId = req.user._id;


        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Invalid rating value'
            });
        }


        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }


        const existingRatingIndex = product.ratings.findIndex(r => 
            r.userId.toString() === userId.toString()
        );

        // Get user name for the rating
        const User = require('../../models/userSchema');
        const user = await User.findById(userId).select('name');
        const userName = user ? user.name : 'Anonymous';

        if (existingRatingIndex > -1) {

            product.ratings[existingRatingIndex] = {
                user: userId,
                userId,
                userName: userName,
                rating,
                review,
                date: new Date(),
                images: []
            };
        } else {

            product.ratings.push({
                user: userId,
                userId,
                userName: userName,
                rating,
                review,
                date: new Date(),
                images: []
            });
        }


        const totalRating = product.ratings.reduce((sum, r) => sum + r.rating, 0);
        product.averageRating = totalRating / product.ratings.length;

        await product.save();

        res.json({
            success: true,
            message: 'Rating submitted successfully',
            averageRating: product.averageRating
        });
    } catch (error) {
        console.error('Error rating product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit rating'
        });
    }
};


exports.getFoodStatus = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId).populate('category');
        if (!product) return res.status(404).json({ success: false });
        const offerDetails = await OfferService.getBestOffer(product);
        let inCart = false;
        if (req.user && req.user._id) {
            const cart = await Cart.findOne({ user: req.user._id, 'items.product': productId });
            inCart = !!cart;
        }
        const blocked = product.isBlocked || (product.category && product.category.isBlocked);
        res.json({
            success: true,
            product: {
                regularPrice: product.regularPrice,
                salesPrice: product.salesPrice,
                quantity: product.quantity,
                inStock: product.quantity > 0,
                offerDetails,
                finalPrice: offerDetails.finalPrice,
                isBlocked: product.isBlocked,
                categoryIsBlocked: product.category && product.category.isBlocked
            },
            inCart,
            blocked
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};