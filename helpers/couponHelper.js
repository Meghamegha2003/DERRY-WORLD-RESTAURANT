const Coupon = require('../models/couponSchema');

/**
 * Validates and updates the cart's applied coupon
 * @param {Object} cart - The cart object
 * @returns {Promise<Object>} - The updated cart with validated coupon
 */
async function validateAndUpdateCartCoupon(cart) {
  try {
    if (!cart.appliedCoupon || !cart.appliedCoupon.code) {
      return cart;
    }

    const coupon = await Coupon.findOne({
      code: cart.appliedCoupon.code,
      isActive: true,
      isBlocked: { $ne: true }
    });

    // If coupon is not found or invalid, remove it from cart
    if (!coupon || !coupon.isValid()) {
      cart.appliedCoupon = undefined;
      cart.couponDiscount = 0;
      await cart.save();
    } else {
      // Update cart with current coupon data
      cart.appliedCoupon = {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchase: coupon.minPurchase,
        maxDiscount: coupon.maxDiscount,
        couponId: coupon._id
      };
      await cart.save();
    }
  } catch (error) {
    console.error('Error validating cart coupon:', error);
    // In case of error, remove the coupon to be safe
    if (cart.appliedCoupon) {
      cart.appliedCoupon = undefined;
      cart.couponDiscount = 0;
      await cart.save();
    }
  }

  return cart;
}

module.exports = {
  validateAndUpdateCartCoupon
};
