const Coupon = require('../models/couponSchema');

/**
 * Calculate total coupon discount for an order
 * @param {Object} order - Order object
 * @param {Object} coupon - Coupon object
 * @returns {Number} Total coupon discount amount
 */
function calculateTotalCoupon(order, coupon) {
  try {
    if (!order || !coupon) {
      return 0;
    }

    // Calculate order subtotal (sum of all items)
    const orderSubtotal = order.items.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    if (orderSubtotal <= 0) {
      return 0;
    }

    // Use coupon's built-in calculation method
    return coupon.calculateTotalDiscount(orderSubtotal);
  } catch (error) {
    console.error('[COUPON_HELPER] Error calculating total coupon:', error);
    return 0;
  }
}

/**
 * Calculate individual coupon discount for each item
 * @param {Object} order - Order object
 * @param {Number} totalCouponAmount - Total coupon discount
 * @returns {Array} Array of items with individual coupon amounts
 */
function calculateIndividualCoupon(order, totalCouponAmount) {
  try {
    if (!order || !order.items || totalCouponAmount <= 0) {
      return order.items.map(item => ({
        ...item,
        individualCoupon: 0,
        couponRatio: 0
      }));
    }

    // Calculate total order value
    const totalOrderValue = order.items.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    if (totalOrderValue <= 0) {
      return order.items.map(item => ({
        ...item,
        individualCoupon: 0,
        couponRatio: 0
      }));
    }

    // Calculate proportional coupon for each item
    return order.items.map(item => {
      const itemTotal = item.price * item.quantity;
      const itemRatio = itemTotal / totalOrderValue;
      const itemCouponDiscount = itemRatio * totalCouponAmount;

      return {
        ...item,
        individualCoupon: Math.min(itemCouponDiscount, itemTotal),
        couponRatio: itemRatio
      };
    });
  } catch (error) {
    console.error('[COUPON_HELPER] Error calculating individual coupons:', error);
    return order.items.map(item => ({
      ...item,
      individualCoupon: 0,
      couponRatio: 0
    }));
  }
}

/**
 * Calculate deduct refund coupon for cancelled/returned items
 * @param {Object} order - Order object
 * @returns {Number} Total coupon amount deducted for refunds
 */
function calculateDeductRefundCoupon(order) {
  try {
    if (!order || !order.items) {
      return 0;
    }

    // Sum up coupon deductions for cancelled/returned items
    return order.items
      .filter(item => ['Cancelled', 'Returned', 'Return Approved'].includes(item.status))
      .reduce((sum, item) => {
        return sum + (item.deductRefundCoupon || 0);
      }, 0);
  } catch (error) {
    console.error('[COUPON_HELPER] Error calculating deduct refund coupon:', error);
    return 0;
  }
}

/**
 * Calculate balance coupon (remaining coupon after deductions)
 * @param {Number} totalCoupon - Total coupon amount
 * @param {Number} deductRefundCoupon - Deducted coupon amount
 * @returns {Number} Remaining coupon balance
 */
function calculateBalanceCoupon(totalCoupon, deductRefundCoupon) {
  try {
    const balance = (totalCoupon || 0) - (deductRefundCoupon || 0);
    return Math.max(0, balance);
  } catch (error) {
    console.error('[COUPON_HELPER] Error calculating balance coupon:', error);
    return 0;
  }
}

/**
 * Update order with all coupon calculations
 * @param {Object} order - Order object
 * @param {Object} coupon - Coupon object (optional)
 * @returns {Object} Updated order with coupon calculations
 */
async function updateOrderCouponCalculations(order, coupon = null) {
  try {
    // If no coupon provided, try to get it from order
    if (!coupon && order.appliedCoupon && order.appliedCoupon.couponId) {
      coupon = await Coupon.findById(order.appliedCoupon.couponId);
    }

    if (!coupon) {
      // No coupon applied, reset all coupon fields
      order.totalCoupon = 0;
      order.deductRefundCoupon = 0;
      order.balanceCoupon = 0;
      
      order.items.forEach(item => {
        item.individualCoupon = 0;
        item.deductRefundCoupon = 0;
        item.couponRatio = 0;
      });
      
      return order;
    }

    // 1. Calculate total coupon
    const totalCoupon = calculateTotalCoupon(order, coupon);
    order.totalCoupon = totalCoupon;

    // 2. Calculate individual coupon for each item
    const itemsWithCoupons = calculateIndividualCoupon(order, totalCoupon);
    
    // Update items with individual coupon calculations
    order.items.forEach((item, index) => {
      if (itemsWithCoupons[index]) {
        item.individualCoupon = itemsWithCoupons[index].individualCoupon;
        item.couponRatio = itemsWithCoupons[index].couponRatio;
        
        // If item is cancelled/returned, set deductRefundCoupon
        if (['Cancelled', 'Returned', 'Return Approved'].includes(item.status)) {
          item.deductRefundCoupon = item.individualCoupon;
        }
      }
    });

    // 3. Calculate total deduct refund coupon
    const deductRefundCoupon = calculateDeductRefundCoupon(order);
    order.deductRefundCoupon = deductRefundCoupon;

    // 4. Calculate balance coupon
    const balanceCoupon = calculateBalanceCoupon(totalCoupon, deductRefundCoupon);
    order.balanceCoupon = balanceCoupon;

    console.log('[COUPON_HELPER] Updated order coupon calculations:', {
      orderId: order._id,
      totalCoupon,
      deductRefundCoupon,
      balanceCoupon,
      appliedCoupon: order.appliedCoupon?.code
    });

    return order;
  } catch (error) {
    console.error('[COUPON_HELPER] Error updating order coupon calculations:', error);
    return order;
  }
}

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

    if (!coupon || !coupon.isValid() || cart.total < (coupon.minPurchase || 0)) {
      cart.appliedCoupon = undefined;
      cart.couponDiscount = 0;
      await cart.save();
    } else {
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
    if (cart.appliedCoupon) {
      cart.appliedCoupon = undefined;
      cart.couponDiscount = 0;
      await cart.save();
    }
  }

  return cart;
}

module.exports = {
  calculateTotalCoupon,
  calculateIndividualCoupon,
  calculateDeductRefundCoupon,
  calculateBalanceCoupon,
  updateOrderCouponCalculations,
  validateAndUpdateCartCoupon
};
