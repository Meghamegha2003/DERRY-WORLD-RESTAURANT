const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/user/cartController');
const { auth } = require('../../middlewares/authMiddleware');



router.get('/', auth, cartController.getCartPage);
router.post('/add/:productId', auth, cartController.addToCart);
router.put('/increment/:productId', auth, cartController.incrementCartItem);
router.put('/decrement/:productId', auth, cartController.decrementCartItem);
router.delete('/remove/:productId', auth, cartController.removeFromCart);
router.get('/check/:productId', auth, cartController.checkProductInCart);

router.post('/coupons/apply', auth, cartController.applyCoupon);
router.post('/coupons/remove', auth, cartController.removeCoupon);
router.post('/remove-coupon', auth, cartController.removeCouponOnAdd);
router.get('/coupons/available', auth, cartController.getAvailableCoupons);
router.post('/clear', auth, cartController.clearCart);
router.get('/data', auth, cartController.getCartData);

module.exports = router;