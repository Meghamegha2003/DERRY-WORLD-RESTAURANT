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

// Debug middleware
// router.use((req, res, next) => {
//     console.log('[DEBUG] Coupon route:', {
//         path: req.path,
//         method: req.method,
//         originalUrl: req.originalUrl,
//         isXHR: req.xhr || req.headers.accept?.includes('application/json')
//     });
//     next();
// });

// View all coupons - no auth required
router.get('/', couponController.viewCoupons);

// Get single coupon - no auth required
router.get('/:id', couponController.getCouponById);

// Create new coupon
router.post('/', adminAuth, couponController.createCoupon);

// Update coupon
router.put('/:id', adminAuth, couponController.updateCoupon);

// Toggle coupon status
router.patch('/:id/toggle', adminAuth, couponController.toggleCouponStatus);

// Delete coupon
router.delete('/:id', adminAuth, couponController.deleteCoupon);

// Check if coupon code exists
router.get('/check-code', adminAuth, couponController.checkCouponCode);

module.exports = router;