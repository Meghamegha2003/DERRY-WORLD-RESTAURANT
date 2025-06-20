const express = require('express');
const router = express.Router();
const checkoutController = require('../../controllers/user/checkoutController');
const { auth } = require('../../middlewares/authMiddleware');

// Checkout page
router.get('/', auth, checkoutController.getCheckout);
router.post('/process', auth, checkoutController.processCheckout);

// Coupon management
router.post('/apply-coupon', auth, checkoutController.applyCoupon);
router.post('/remove-coupon', auth, checkoutController.removeCoupon);
router.get('/coupons/available', auth, checkoutController.getAvailableCoupons);

// Address management
router.post('/address', auth, checkoutController.addAddress);
router.put('/address/:addressId', auth, checkoutController.editAddress);
router.delete('/address/:addressId', auth, checkoutController.deleteAddress);

module.exports = router;