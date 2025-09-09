const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/authMiddleware');
const couponController = require('../../controllers/admin/couponController');


router.get('/', couponController.viewCoupons);
router.get('/:id', couponController.getCouponById);
router.post('/', adminAuth, couponController.createCoupon);
router.put('/:id', adminAuth, couponController.updateCoupon);
router.patch('/:id/toggle', adminAuth, couponController.toggleCouponStatus);
router.delete('/:id', adminAuth, couponController.deleteCoupon);
router.get('/check-code', adminAuth, couponController.checkCouponCode);

module.exports = router;