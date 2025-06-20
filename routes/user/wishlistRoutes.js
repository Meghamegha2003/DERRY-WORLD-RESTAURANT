const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/authMiddleware');
const wishlistController = require('../../controllers/user/wishlistController');

// Get wishlist
router.get('/', auth, wishlistController.renderWishlist);

// Toggle product in wishlist
router.post('/toggle/:productId', auth, wishlistController.toggleWishlist);

// Remove from wishlist (alternative endpoint for direct removal)
router.delete('/:productId', auth, wishlistController.removeFromWishlist);

module.exports = router;
