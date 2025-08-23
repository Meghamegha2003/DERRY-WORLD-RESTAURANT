const express = require('express');
const router = express.Router();
const checkoutController = require('../../controllers/user/checkoutController');
const cartController = require('../../controllers/user/cartController');
const userController = require('../../controllers/user/userController');
const { auth } = require('../../middlewares/authMiddleware');

router.get('/', auth, checkoutController.getCheckout);
router.post('/process', auth, checkoutController.processCheckout);

// Coupon management
router.post('/apply-coupon', auth, cartController.applyCoupon);
router.post('/remove-coupon', auth, cartController.removeCoupon);
router.get('/coupons/available', auth, cartController.getAvailableCoupons);

// Address management
router.post('/address', auth, userController.addAddress);
router.put('/address/:addressId', auth, userController.updateAddress);
router.delete('/address/:addressId', auth, userController.deleteAddress);



module.exports = router;