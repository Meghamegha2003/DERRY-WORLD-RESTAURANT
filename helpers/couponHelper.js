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

    // If coupon is not found, invalid, or cart total is less than minimum purchase, remove it from cart
    if (!coupon || !coupon.isValid() || cart.total < (coupon.minPurchase || 0)) {
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

async function recalculateOrderCoupon(order) {
  if (!order.couponCode) {
    return { newCouponDiscount: 0, discountAdjustment: 0 };
  }

  const coupon = await Coupon.findOne({ code: order.couponCode });

  if (!coupon || !coupon.isActive || coupon.isBlocked) {
    const discountAdjustment = order.couponDiscount || 0;
    return { newCouponDiscount: 0, discountAdjustment };
  }

  const activeItems = order.items.filter(item => item.status !== 'Cancelled' && item.status !== 'Returned' && item.status !== 'Return Approved');
  const newSubtotal = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  if (newSubtotal < coupon.minPurchase) {
    const discountAdjustment = order.couponDiscount || 0;
    return { newCouponDiscount: 0, discountAdjustment };
  }

  let newDiscount = 0;
  if (coupon.discountType === 'percentage') {
    newDiscount = (newSubtotal * coupon.discountValue) / 100;
    if (coupon.maxDiscount && newDiscount > coupon.maxDiscount) {
      newDiscount = coupon.maxDiscount;
    }
  } else {
    newDiscount = coupon.discountValue;
  }

  const oldDiscount = order.couponDiscount || 0;
  const newCouponDiscount = Math.min(newDiscount, newSubtotal);
  const discountAdjustment = oldDiscount - newCouponDiscount;

  return { newCouponDiscount, discountAdjustment };
}

/**
 * Calculate proportional coupon discount for a specific item being cancelled/returned
 * @param {Object} order - The order object
 * @param {Object} item - The item being cancelled/returned
 * @returns {Promise<Object>} - Contains itemCouponDiscount and remainingCouponDiscount
 */
async function calculateItemCouponRefund(order, item) {
  console.log('[COUPON_REFUND_START]', {
    hasCouponCode: !!order.couponCode,
    couponCode: order.couponCode,
    couponDiscount: order.couponDiscount,
    itemStatus: item.status
  });

  if (!order.couponDiscount || order.couponDiscount <= 0) {
    console.log('[COUPON_REFUND_NO_COUPON]', 'No coupon discount found');
    return { itemCouponDiscount: 0, remainingCouponDiscount: order.couponDiscount || 0 };
  }

  // Calculate original subtotal (only active items when coupon was originally applied)
  const originalSubtotal = order.items.reduce((sum, orderItem) => {
    // Only include items that are not already cancelled/returned
    if (orderItem.status === 'Active' || orderItem._id.toString() === item._id.toString()) {
      return sum + (orderItem.price * orderItem.quantity);
    }
    return sum;
  }, 0);

  // Calculate item's share of the original coupon discount
  const itemTotal = item.price * item.quantity;
  const itemCouponRatio = originalSubtotal > 0 ? itemTotal / originalSubtotal : 0;
  const itemCouponDiscount = Math.round((order.couponDiscount * itemCouponRatio) * 100) / 100;

  // Calculate remaining coupon discount after this item is removed
  const remainingCouponDiscount = Math.max(0, order.couponDiscount - itemCouponDiscount);

  console.log('[COUPON_REFUND_CALCULATION]', {
    originalSubtotal,
    itemTotal,
    itemCouponRatio: (itemCouponRatio * 100).toFixed(2) + '%',
    itemCouponDiscount,
    remainingCouponDiscount,
    orderCouponDiscount: order.couponDiscount
  });

  return { 
    itemCouponDiscount, 
    remainingCouponDiscount,
    itemCouponRatio: Math.round(itemCouponRatio * 10000) / 100
  };
}

module.exports = {
  validateAndUpdateCartCoupon,
  recalculateOrderCoupon,
  calculateItemCouponRefund
};
