/**
 * Refund Calculation Service
 * Centralized service for calculating refund amounts with proper coupon deductions
 * Formula: (itemPrice/total) * totalCoupon
 */

/**
 * Calculate refund amount for individual item with coupon deduction
 * @param {Object} order - The order object
 * @param {Object} item - The item being refunded
 * @returns {Object} - Refund calculation result
 */
function calculateItemRefund(order, item) {
  try {
    console.log('[REFUND_CALC] Starting item refund calculation', {
      orderId: order._id,
      itemId: item._id,
      itemPrice: item.price,
      itemQuantity: item.quantity
    });

    // Calculate item total (using salesPrice or offerPrice)
    const itemTotal = item.price * item.quantity;

    // Calculate total order value (include all items - canceled or returned)
    // This uses the actual price stored in schema (salesPrice or offerPrice)
    const totalOrderValue = order.items.reduce((sum, orderItem) => {
      return sum + (orderItem.price * orderItem.quantity);
    }, 0);

    console.log('[REFUND_CALC] Order totals', {
      itemTotal,
      totalOrderValue,
      allItems: order.items.map(i => ({
        id: i._id,
        price: i.price,
        quantity: i.quantity,
        subtotal: i.price * i.quantity,
        status: i.status
      }))
    });

    // Get total coupon amount
    let totalCouponAmount = 0;

    // Priority order for finding coupon amount:
    // 1. order.totalCoupon (stored original coupon)
    // 2. order.appliedCoupon with calculation
    // 3. Reconstruct from existing item coupon deductions
    // 4. Current order.couponDiscount

    if (order.totalCoupon && order.totalCoupon > 0) {
      totalCouponAmount = order.totalCoupon;
      console.log('[REFUND_CALC] Using order.totalCoupon:', totalCouponAmount);
    } else if (order.appliedCoupon && order.appliedCoupon.discountValue) {
      // Calculate based on applied coupon
      if (order.appliedCoupon.discountType === 'percentage') {
        const calculatedDiscount = (totalOrderValue * order.appliedCoupon.discountValue) / 100;
        totalCouponAmount = order.appliedCoupon.maxDiscount 
          ? Math.min(calculatedDiscount, order.appliedCoupon.maxDiscount)
          : calculatedDiscount;
      } else {
        totalCouponAmount = order.appliedCoupon.discountValue;
      }
      console.log('[REFUND_CALC] Calculated from appliedCoupon:', totalCouponAmount);
    } else {
      // Reconstruct from existing item coupon deductions
      const existingCouponDeductions = order.items
        .filter(orderItem => orderItem.itemCouponDiscount && orderItem.itemCouponDiscount > 0)
        .reduce((sum, orderItem) => sum + orderItem.itemCouponDiscount, 0);

      if (existingCouponDeductions > 0) {
        // Calculate what the original total coupon would have been
        const processedItemsValue = order.items
          .filter(orderItem => orderItem.itemCouponDiscount && orderItem.itemCouponDiscount > 0)
          .reduce((sum, orderItem) => sum + (orderItem.price * orderItem.quantity), 0);

        if (processedItemsValue > 0) {
          const couponRate = existingCouponDeductions / processedItemsValue;
          totalCouponAmount = couponRate * totalOrderValue;
        }
        console.log('[REFUND_CALC] Reconstructed from existing deductions:', totalCouponAmount);
      } else if (order.couponDiscount && order.couponDiscount > 0) {
        totalCouponAmount = order.couponDiscount;
        console.log('[REFUND_CALC] Using current order.couponDiscount:', totalCouponAmount);
      }
    }

    console.log('[REFUND_CALC] Final coupon calculation', {
      totalCouponAmount,
      totalOrderValue,
      itemTotal,
      orderTotalCoupon: order.totalCoupon,
      orderCouponDiscount: order.couponDiscount,
      appliedCouponCode: order.appliedCoupon?.code,
      appliedCouponType: order.appliedCoupon?.discountType,
      appliedCouponValue: order.appliedCoupon?.discountValue
    });
    
    console.log('[REFUND_CALC] Detailed coupon source check', {
      totalCouponAmount,
      totalOrderValue,
      itemTotal
    });

    // Apply the formula: (itemPrice/total) * totalCoupon
    let itemCouponDiscount = 0;
    if (totalOrderValue > 0 && totalCouponAmount > 0) {
      itemCouponDiscount = (itemTotal / totalOrderValue) * totalCouponAmount;
      
      // Safety cap: coupon deduction cannot exceed item price
      itemCouponDiscount = Math.min(itemCouponDiscount, itemTotal);
    }

    // Calculate final refund amount
    const refundAmount = Math.max(0, itemTotal - itemCouponDiscount);

    // Calculate coupon ratio for display purposes
    const couponRatio = itemTotal > 0 ? (itemCouponDiscount / itemTotal) : 0;

    // Calculate remaining coupon discount for order
    const remainingCouponDiscount = Math.max(0, (order.couponDiscount || 0) - itemCouponDiscount);

    const result = {
      itemTotal,
      itemCouponDiscount: Number(itemCouponDiscount.toFixed(2)),
      refundAmount: Number(refundAmount.toFixed(2)),
      couponRatio: Number(couponRatio.toFixed(4)),
      remainingCouponDiscount: Number(remainingCouponDiscount.toFixed(2)),
      totalCouponAmount: Number(totalCouponAmount.toFixed(2)),
      totalOrderValue
    };

    console.log('[REFUND_CALC] Final calculation result', result);

    return result;

  } catch (error) {
    console.error('[REFUND_CALC] Error calculating item refund:', error);
    return {
      itemTotal: item.price * item.quantity,
      itemCouponDiscount: 0,
      refundAmount: item.price * item.quantity,
      couponRatio: 0,
      remainingCouponDiscount: order.couponDiscount || 0,
      totalCouponAmount: 0,
      totalOrderValue: 0,
      error: error.message
    };
  }
}

/**
 * Calculate refund amount for entire order
 * @param {Object} order - The order object
 * @param {String} reason - Reason for refund ('Cancellation' or 'Return')
 * @returns {Object} - Refund calculation result
 */
function calculateOrderRefund(order, reason = 'Cancellation') {
  try {
    console.log('[REFUND_CALC] Starting order refund calculation', {
      orderId: order._id,
      reason,
      paymentMethod: order.paymentMethod
    });

    // Calculate total for items being refunded
    const itemsToRefund = order.items.filter(item => 
      item.status === 'Active' || reason === 'Cancellation'
    );

    const orderSubtotal = itemsToRefund.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    // Get discounts
    const couponDiscount = order.couponDiscount || 0;
    const offerDiscount = order.offerDiscount || 0;

    // Calculate net refund amount (what customer actually paid)
    const totalRefundAmount = Math.max(0, orderSubtotal - offerDiscount - couponDiscount);

    const result = {
      orderSubtotal,
      couponDiscount,
      offerDiscount,
      totalRefundAmount: Number(totalRefundAmount.toFixed(2)),
      itemsCount: itemsToRefund.length
    };

    console.log('[REFUND_CALC] Order refund calculation result', result);

    return result;

  } catch (error) {
    console.error('[REFUND_CALC] Error calculating order refund:', error);
    return {
      orderSubtotal: 0,
      couponDiscount: 0,
      offerDiscount: 0,
      totalRefundAmount: 0,
      itemsCount: 0,
      error: error.message
    };
  }
}

/**
 * Validate refund calculation inputs
 * @param {Object} order - The order object
 * @param {Object} item - The item object (optional)
 * @returns {Object} - Validation result
 */
function validateRefundInputs(order, item = null) {
  const errors = [];

  if (!order) {
    errors.push('Order object is required');
  } else {
    if (!order._id) errors.push('Order ID is required');
    if (!order.items || !Array.isArray(order.items)) errors.push('Order items array is required');
    if (order.items && order.items.length === 0) errors.push('Order must have at least one item');
  }

  if (item) {
    if (!item._id) errors.push('Item ID is required');
    if (typeof item.price !== 'number' || item.price < 0) errors.push('Valid item price is required');
    if (typeof item.quantity !== 'number' || item.quantity <= 0) errors.push('Valid item quantity is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  calculateItemRefund,
  calculateOrderRefund,
  validateRefundInputs
};
