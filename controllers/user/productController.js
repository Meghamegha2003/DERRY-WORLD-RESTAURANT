const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const OfferService = require('../../services/offerService');
const Cart = require('../../models/cartSchema');

// Helper function to get cart count
exports.getCartCount = async (userId) => {
    try {
        const cart = await Cart.findOne({ user: userId });
        if (!cart || !cart.items) return 0;
        return cart.items.length;
    } catch (error) {
        console.error('Error getting cart count:', error);
        return 0;
    }
};

// Helper function to calculate offers for products
exports.calculateOffersForProducts = async (products) => {
    return await Promise.all(products.map(async (product) => {
        const productObj = product.toObject();
        // Ensure we pass the salesPrice to the offer calculation
        const salesPrice = product.salesPrice;
        
        productObj.offerDetails = await OfferService.getProductWithOffer(product._id);
        return productObj;
    }));
};

// Helper function to capitalize words
exports.capitalizeWords = (str) => {
    return str.replace(/\b\w/g, char => char.toUpperCase());
}

// Get all products with offers
exports.getAllProducts = async (req, res) => {
    const offers = await require("../../models/offerSchema").find({
        isActive: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
    }).lean();
    try {
        let products = await Product.find({ isBlocked: true })
            .populate('category');

        // Calculate offers for each product, using salesPrice if available
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

// Get product details with offers
exports.getProductDetails = async (req, res) => {
    
    try {
        const productId = req.params.id;
        let product = await Product.findById(productId).populate('category');

        if (!product) {
            res.setMessage('error', 'Product not found');
            return res.redirect('/products');
        }

        // Calculate best offer
        const offerDetails = await OfferService.getProductWithOffer(productId);
        product = product.toObject();
        product.offerDetails = {
            bestOffer: offerDetails.offerDetails.bestOffer,
            finalPrice: offerDetails.offerDetails.finalPrice
        };


        // Determine if this product is already in the user's cart
        let isInCart = false;
        if (req.user) {
            const cart = await Cart.findOne({ user: req.user._id });
            if (cart && cart.items) {
                isInCart = cart.items.some(item => item.product.toString() === productId);
            }
        }
        // Get unique product count for cart icon
        const cartCount = req.user ? await exports.getCartCount(req.user._id) : 0;

        // Fetch related products (same category, not this product)
        let relatedProducts = [];
        if (product && product.category) {
            relatedProducts = await Product.find({
                _id: { $ne: productId },
                category: product.category._id,
                isListed: true,
                isBlocked: false
            }).limit(4).lean();
        }

        res.render('user/foodDetails', {
            product,
            user: req.user,
            messages: res.locals.messages,
            isInCart,
            cartCount,
            relatedProducts
        });
    } catch (error) {
        console.error('Error getting product details:', error);
        res.setMessage('error', 'Failed to load product details');
        res.redirect('/products');
    }
};

// Calculate product price with offers
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

// Rate a product
exports.rateProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const { rating, review } = req.body;
        const userId = req.user._id;

        // Validate rating
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Invalid rating value'
            });
        }

        // Find the product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if user has already rated
        const existingRatingIndex = product.ratings.findIndex(r => 
            r.userId.toString() === userId.toString()
        );

        if (existingRatingIndex > -1) {
            // Update existing rating
            product.ratings[existingRatingIndex] = {
                userId,
                rating,
                review,
                date: new Date()
            };
        } else {
            // Add new rating
            product.ratings.push({
                userId,
                rating,
                review,
                date: new Date()
            });
        }

        // Calculate average rating
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


exports.getFoodDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);
        if (!product) return res.status(404).render('error', { message: 'Product not found' });
        const offerDetails = await OfferService.getBestOffer(product);
        let inCart = false;
        if (req.user && req.user._id) {
            const cart = await Cart.findOne({ user: req.user._id, 'items.product': productId });
            inCart = !!cart;
        }
        const productObj = product.toObject();
        productObj.offerDetails = {
            bestOffer: offerDetails.bestOffer,
            finalPrice: offerDetails.finalPrice
        };
        productObj.inStock = productObj.quantity > 0;

        // Related products with offers
        const relatedProducts = await Product.find({
            category: product.category,
            _id: { $ne: productId }
        }).limit(4);
        const relatedProductsWithOffers = await Promise.all(relatedProducts.map(async (rp) => {
            const rpOffer = await OfferService.getBestOffer(rp);
            const rpObj = rp.toObject();
            rpObj.offerDetails = rpOffer;
            rpObj.finalPrice = rpOffer.finalPrice;
            rpObj.inStock = rpObj.quantity > 0;
            return rpObj;
        }));

        // If AJAX/fetch, return JSON
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                product: productObj,
                relatedProducts: relatedProductsWithOffers,
                inCart
            });
        }

        // Otherwise, render the EJS page
        // Calculate cartCount as in userController.js
        let cartCount = 0;
        if (req.user) {
            cartCount = await exports.getCartCount(req.user._id);
        }
        
        res.render('user/foodDetails', {
            title: productObj.name,
            product: productObj,
            relatedProducts: relatedProductsWithOffers,
            user: req.user || null,
            cartCount, // Pass cartCount to the view
            path: '/menu',
            isInCart: inCart
        });
    } catch (err) {
        res.status(500).render('error', { message: 'Error loading product details' });
    }
};

// API to get latest food status (for AJAX polling)
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