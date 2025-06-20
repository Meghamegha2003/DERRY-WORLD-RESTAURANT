const Coupon = require('../../models/couponSchema');

// View all coupons
async function viewCoupons(req, res) {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        
        // Check if it's an AJAX request
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                coupons
            });
        }

        // Regular page render
        res.render('admin/coupons', {
            title: 'Coupon Management',
            coupons,
            error: null
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        
        // Check if it's an AJAX request
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch coupons'
            });
        }

        res.status(500).render('error', {
            message: 'Failed to fetch coupons',
            error
        });
    }
};

// Get coupon by ID
async function getCouponById(req, res) {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        res.json({
            success: true,
            coupon
        });
    } catch (error) {
        console.error('Error fetching coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch coupon'
        });
    }
};

// Create new coupon
async function createCoupon(req, res) {
    try {
        const { code, description, discountType, discountValue, minPurchase, maxDiscount, validFrom, validUntil, usageLimit } = req.body;

        // Validate required fields
        if (!code || !discountType || !discountValue) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code already exists'
            });
        }

        // Create new coupon
        const coupon = new Coupon({
            code: code.toUpperCase(),
            description,
            discountType,
            discountValue,
            minPurchase,
            maxDiscount,
            validFrom,
            validUntil,
            usageLimit,
            isActive: true
        });

        await coupon.save();

        res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon
        });
    } catch (error) {
        console.error('Error creating coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create coupon'
        });
    }
};

// Update coupon
async function updateCoupon(req, res) {
    try {
        const { code, description, discountType, discountValue, minPurchase, maxDiscount, validFrom, validUntil, usageLimit } = req.body;

        // Validate required fields
        if (!code || !discountType || !discountValue) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Find coupon
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // Check if updated code conflicts with existing coupon
        if (code.toUpperCase() !== coupon.code) {
            const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
            if (existingCoupon) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon code already exists'
                });
            }
        }

        // Update coupon
        coupon.code = code.toUpperCase();
        coupon.description = description;
        coupon.discountType = discountType;
        coupon.discountValue = discountValue;
        coupon.minPurchase = minPurchase;
        coupon.maxDiscount = maxDiscount;
        coupon.validFrom = validFrom;
        coupon.validUntil = validUntil;
        coupon.usageLimit = usageLimit;

        await coupon.save();

        res.json({
            success: true,
            message: 'Coupon updated successfully',
            coupon
        });
    } catch (error) {
        console.error('Error updating coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update coupon'
        });
    }
};

// Toggle coupon status
async function toggleCouponStatus(req, res) {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // Check if trying to enable an expired or fully used coupon
        const now = new Date();
        if (!coupon.isActive) {
            if (coupon.validUntil < now) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot enable expired coupon'
                });
            }
            if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot enable coupon - usage limit reached'
                });
            }
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            { $set: { isActive: !coupon.isActive } },
            { new: true, runValidators: false }
        );

        res.json({
            success: true,
            message: `Coupon ${updatedCoupon.isActive ? 'activated' : 'deactivated'} successfully`,
            coupon: updatedCoupon
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle coupon status'
        });
    }
};

// Delete coupon
async function deleteCoupon(req, res) {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        res.json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete coupon'
        });
    }
};

// Check if coupon code exists
async function checkCouponCode(req, res) {
    try {
        const { code, excludeId } = req.query;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required'
            });
        }

        // Build query to check for existing code
        const query = { code: code.toUpperCase() };
        if (excludeId) {
            query._id = { $ne: excludeId };
        }

        const existingCoupon = await Coupon.findOne(query);

        res.json({
            success: true,
            exists: !!existingCoupon
        });
    } catch (error) {
        console.error('Error checking coupon code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check coupon code'
        });
    }
};

module.exports = {
    viewCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    toggleCouponStatus,
    deleteCoupon,
    checkCouponCode
};