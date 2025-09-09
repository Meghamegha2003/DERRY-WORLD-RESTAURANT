const Coupon = require("../../models/couponSchema");

exports.viewCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, coupons });
    }

    res.render("admin/coupons", {
      title: "Coupon Management",
      coupons,
      error: null,
      path: "/admin/coupons",
    });
  } catch (error) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch coupons" });
    }

    res.status(500).render("admin/error", {
      message: "Failed to fetch coupons",
      error,
    });
  }
};

exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    res.json({ success: true, coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch coupon" });
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minPurchase,
      maxDiscount,
      validFrom,
      validUntil,
      usageLimit,
    } = req.body;

    if (!code || !discountType || !discountValue) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Validate maxDiscount for percentage coupons
    if (discountType === 'percentage' && maxDiscount !== null && maxDiscount !== undefined) {
      if (maxDiscount <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Maximum discount must be greater than 0" });
      }
    }

    // For fixed discount coupons, maxDiscount should be null
    const processedMaxDiscount = discountType === 'percentage' ? maxDiscount : null;

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon code already exists" });
    }

    const coupon = new Coupon({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      minPurchase,
      maxDiscount: processedMaxDiscount,
      validFrom,
      validUntil,
      usageLimit,
      isActive: true,
    });

    await coupon.save();

    res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to create coupon" });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minPurchase,
      maxDiscount,
      validFrom,
      validUntil,
      usageLimit,
    } = req.body;

    if (!code || !discountType || !discountValue) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Validate maxDiscount for percentage coupons
    if (discountType === 'percentage' && maxDiscount !== null && maxDiscount !== undefined) {
      if (maxDiscount <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Maximum discount must be greater than 0" });
      }
    }

    // For fixed discount coupons, maxDiscount should be null
    const processedMaxDiscount = discountType === 'percentage' ? maxDiscount : null;

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    if (code.toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
      if (existingCoupon) {
        return res
          .status(400)
          .json({ success: false, message: "Coupon code already exists" });
      }
    }

    coupon.code = code.toUpperCase();
    coupon.description = description;
    coupon.discountType = discountType;
    coupon.discountValue = discountValue;
    coupon.minPurchase = minPurchase;
    coupon.maxDiscount = processedMaxDiscount;
    coupon.validFrom = validFrom;
    coupon.validUntil = validUntil;
    coupon.usageLimit = usageLimit;

    await coupon.save();

    res.json({
      success: true,
      message: "Coupon updated successfully",
      coupon,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to update coupon" });
  }
};

exports.toggleCouponStatus = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    const now = new Date();
    if (!coupon.isActive) {
      if (coupon.validUntil < now) {
        return res
          .status(400)
          .json({ success: false, message: "Cannot enable expired coupon" });
      }
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Cannot enable coupon - usage limit reached",
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
      message: `Coupon ${
        updatedCoupon.isActive ? "activated" : "deactivated"
      } successfully`,
      coupon: updatedCoupon,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to toggle coupon status" });
  }
};

exports.checkCouponCode = async (req, res) => {
  try {
    const { code, excludeId } = req.query;

    if (!code) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon code is required" });
    }

    const query = { code: code.toUpperCase() };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existingCoupon = await Coupon.findOne(query);

    res.json({
      success: true,
      exists: !!existingCoupon,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to check coupon code" });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    // Optional: Check if coupon has been used (commented out for testing)
    // if (coupon.usedCount > 0) {
    //   return res
    //     .status(400)
    //     .json({ 
    //       success: false, 
    //       message: "Cannot delete coupon that has been used by customers" 
    //     });
    // }

    await Coupon.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete coupon" });
  }
};
