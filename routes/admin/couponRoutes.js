const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/authMiddleware');
const couponController = require('../../controllers/admin/couponController');

// AJAX endpoint to check if coupon code exists
router.get('/check-code', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.json({ exists: false });
    const Coupon = require('../../models/couponSchema');
    const exists = await Coupon.exists({ code: code.trim() });
    res.json({ exists: !!exists });
});


router.get('/', couponController.viewCoupons);
router.get('/:id', couponController.getCouponById);
router.post('/', adminAuth, couponController.createCoupon);
router.put('/:id', adminAuth, couponController.updateCoupon);
router.patch('/:id/toggle', adminAuth, couponController.toggleCouponStatus);
router.delete('/:id', adminAuth, couponController.deleteCoupon);
router.get('/check-code', adminAuth, couponController.checkCouponCode);

module.exports = router;