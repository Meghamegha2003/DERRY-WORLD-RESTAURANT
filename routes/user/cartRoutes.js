const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/user/cartController');
const Cart = require('../../models/cartSchema');
const { auth } = require('../../middlewares/authMiddleware');

// --- DEBUG: Test population route ---
router.get('/test-populate', auth, async (req, res) => {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const cart = await Cart.findOne({ user: userId })
        .populate({
            path: 'items.product',
            select: 'name category',
            populate: {
                path: 'category',
                model: 'Category',
                select: 'isBlocked name'
            }
        });
    res.json(cart && cart.items ? cart.items.map(item => item.product && item.product.category) : []);
});
// --- END DEBUG ROUTE ---

// Debug route to check cart data
router.get('/debug', async (req, res) => {
    try {
        const carts = await Cart.find().lean();
        res.json(carts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cart page
router.get('/', auth, cartController.getCartPage);

// Add to cart
router.post('/add/:productId', auth, cartController.addToCart);

// Increment cart item quantity
router.put('/increment/:productId', auth, cartController.incrementCartItem);

// Decrement cart item quantity
router.put('/decrement/:productId', auth, cartController.decrementCartItem);

// Remove from cart
router.delete('/remove/:productId', auth, cartController.removeFromCart);

// Check if product is in cart
router.get('/check/:productId', auth, cartController.checkProductInCart);

// Coupon routes
router.post('/coupons/apply', auth, cartController.applyCoupon);
router.post('/coupons/remove', auth, cartController.removeCoupon);
router.get('/coupons/available', auth, cartController.getAvailableCoupons);

module.exports = router;