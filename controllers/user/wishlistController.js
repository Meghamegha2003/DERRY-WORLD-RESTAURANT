const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const OfferService = require('../../services/offerService');
const Cart = require('../../models/cartSchema');
const Offer = require('../../models/offerSchema');

const getUniqueProductCount = (cart) => {
  if (!cart || !cart.items) return 0;
  return new Set(cart.items.filter(item => item && item.product).map(item => item.product.toString())).size;
}

exports.renderWishlist = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Please login to view wishlist'
            });
        }

        let cartCount = 0;
        const cart = await Cart.findOne({ user: req.user._id });
        cartCount = getUniqueProductCount(cart);

        const user = await User.findById(req.user._id)
            .populate({
                path: 'wishlist.product',
                match: { isListed: true, isBlocked: false },
                populate: { path: 'category' }
            });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!Array.isArray(user.wishlist)) {
            user.wishlist = [];
        }

        const uniqueProductIds = new Set();
        const uniqueWishlistItems = user.wishlist.filter(item => {
            if (!item || !item.product) return false;
            const productId = item.product._id.toString();
            if (uniqueProductIds.has(productId)) return false;
            uniqueProductIds.add(productId);
            return true;
        });

        if (uniqueWishlistItems.length !== user.wishlist.length) {
            user.wishlist = uniqueWishlistItems;
            await user.save();
        }

        const validWishlistItems = uniqueWishlistItems.map(async (item) => {
            try {
                const productData = await OfferService.getProductWithOffer(item.product._id);
                if (!productData || !productData.isListed || productData.isBlocked || productData.category?.isBlocked) {
                    return null;
                }
                return {
                    ...productData,
                    addedAt: item.addedAt
                };
            } catch (error) {
                console.error('Error processing wishlist item:', error);
                return null;
            }
        });

        const wishlistItems = (await Promise.all(validWishlistItems))
            .filter(item => item !== null)
            .sort((a, b) => b.addedAt - a.addedAt);

        if (wishlistItems.length !== uniqueWishlistItems.length) {
            user.wishlist = wishlistItems.map(item => ({
                product: item._id,
                addedAt: item.addedAt
            }));
            await user.save();
        }

        const cartProductIds = cart?.items?.map(item => item.product.toString()) || [];
        wishlistItems.forEach(item => {
            item.isInCart = cartProductIds.includes(item._id.toString());
        });

        const now = new Date();
        const offers = await Offer.find({
            isActive: true,
            validFrom: { $lte: now },
            validUntil: { $gte: now }
        }).lean();

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                wishlistItems,
                cartCount
            });
        }

        res.render('user/wishlist', {
            offers,
            wishlistItems,
            user: req.user,
            path: '/wishlist',
            title: 'My Wishlist',
            cartCount
        });

    } catch (error) {
        console.error('Error fetching wishlist:', error);
        const errorMessage = error.message || 'Error fetching wishlist';
        res.status(500).render('error', {
            message: errorMessage,
            error
        });
    }
};

exports.toggleWishlist = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Please login to manage wishlist'
            });
        }

        const productId = req.params.productId;
        
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        // First check if the product exists and is available
        const product = await Product.findOne({
            _id: productId,
            isListed: true,
            isBlocked: false
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found or unavailable'
            });
        }

        // Find the user and check if product is in wishlist
        const existingItem = await User.findOne({
            _id: req.user._id,
            'wishlist.product': productId
        });

        let updateOperation;
        let message;

        if (!existingItem) {
            // Add to wishlist using $addToSet to prevent duplicates
            updateOperation = {
                $addToSet: {
                    wishlist: {
                        product: productId,
                        addedAt: new Date()
                    }
                }
            };
            message = 'Product added to wishlist';
        } else {
            // Remove from wishlist
            updateOperation = {
                $pull: {
                    wishlist: { product: productId }
                }
            };
            message = 'Product removed from wishlist';
        }

        // Use findOneAndUpdate to avoid version conflicts
        const updatedUser = await User.findOneAndUpdate(
            { _id: req.user._id },
            updateOperation,
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message,
            action: !existingItem ? 'added' : 'removed'
        });
    } catch (error) {
        console.error('Error toggling wishlist:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating wishlist'
        });
    }
};

exports.removeFromWishlist = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Please login to manage wishlist'
            });
        }

        const productId = req.params.productId;
        
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find and remove the product
        const existingIndex = user.wishlist.findIndex(
            item => item.product.toString() === productId
        );

        if (existingIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Product not found in wishlist'
            });
        }

        user.wishlist.splice(existingIndex, 1);
        await user.save();

        res.json({
            success: true,
            message: 'Product removed from wishlist'
        });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error removing from wishlist'
        });
    }
};