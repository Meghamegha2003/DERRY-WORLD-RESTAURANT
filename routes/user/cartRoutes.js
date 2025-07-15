const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/user/cartController');
const Cart = require('../../models/cartSchema');
const { auth } = require('../../middlewares/authMiddleware');



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