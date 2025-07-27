const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/authMiddleware');
const Coupon = require('../../models/couponSchema');
const Cart = require('../../models/cartSchema');

router.get('/available', auth, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const cart = await Cart.findOne({ user: userId });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        const subtotal = cart.calculateTotals().subtotal;
        const now = new Date();
        
        const coupons = await Coupon.find({
            isActive: true,
            validFrom: { $lte: now },
            validUntil: { $gt: now },
            minPurchase: { $lte: subtotal }
        }).exec();

        const validCoupons = coupons.filter(coupon => coupon.usedCount < coupon.usageLimit);

        res.json({
            success: true,
            coupons: validCoupons.map(coupon => ({
                code: coupon.code,
                description: coupon.description || '',
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                minPurchase: coupon.minPurchase,
                maxDiscount: coupon.maxDiscount
            }))
        });

    } catch (error) {
        console.error('Error fetching available coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available coupons'
        });
    }
});

router.post('/apply', auth, async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user._id;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required'
            });
        }

        // Find the coupon
        const coupon = await Coupon.findOne({ code: code.toUpperCase() });
        
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Invalid coupon code'
            });
        }

        // Validate coupon
        if (!coupon.isValid()) {
            return res.status(400).json({
                success: false,
                message: 'Coupon has expired or is not active'
            });
        }

        // Find user's cart
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        const { subtotal } = cart.calculateTotals();
        if (subtotal < coupon.minPurchase) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase amount of ₹${coupon.minPurchase} required`
            });
        }

        // Calculate discount
        const discountAmount = coupon.calculateDiscount(subtotal);

        // Apply coupon to cart
        cart.appliedCoupon = {
            code: coupon.code,
            discountType: coupon.discountType,
            discountAmount: coupon.discountAmount,
            maxDiscount: coupon.maxDiscount,
            couponId: coupon._id
        };
        cart.couponDiscount = discountAmount;
        cart.couponCode = coupon.code;
        cart.couponType = coupon.discountType;
        cart.couponValue = coupon.discountAmount;

        await cart.save();

        // Increment coupon usage
        coupon.usedCount += 1;
        await coupon.save();

        // Calculate final totals
        const totals = cart.calculateTotals();

        res.json({
            success: true,
            message: 'Coupon applied successfully',
            totals,
            cart: {
                appliedCoupon: cart.appliedCoupon,
                couponDiscount: cart.couponDiscount,
                total: totals.total
            }
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to apply coupon'
        });
    }
});

router.post('/remove', auth, async (req, res) => {
    try {
        const userId = req.user._id;

        // Find user's cart
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Get coupon ID before removing
        const couponId = cart.appliedCoupon?.couponId;

        // Remove coupon from cart
        cart.appliedCoupon = undefined;
        cart.couponDiscount = 0;
        cart.couponCode = null;
        cart.couponType = null;
        cart.couponValue = 0;

        await cart.save();

        // Decrement coupon usage if coupon exists
        if (couponId) {
            const coupon = await Coupon.findById(couponId);
            if (coupon) {
                coupon.usedCount = Math.max(0, coupon.usedCount - 1);
                await coupon.save();
            }
        }

        // Calculate final totals
        const totals = cart.calculateTotals();

        res.json({
            success: true,
            message: 'Coupon removed successfully',
            totals,
            cart: {
                appliedCoupon: null,
                couponDiscount: 0,
                total: totals.total
            }
        });

    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove coupon'
        });
    }
});

module.exports = router;