function calculateItemRefund(order, item) {
  try {
    const itemTotal = item.price * item.quantity;
    const totalOrderValue = order.items.reduce((sum, orderItem) => {
      return sum + (orderItem.price * orderItem.quantity);
    }, 0);

    let totalCouponAmount = 0;

    if (order.totalCoupon && order.totalCoupon > 0) {
      totalCouponAmount = order.totalCoupon;
    } else if (order.appliedCoupon && order.appliedCoupon.discountValue) {
      if (order.appliedCoupon.discountType === 'percentage') {
        const calculatedDiscount = (totalOrderValue * order.appliedCoupon.discountValue) / 100;
        totalCouponAmount = order.appliedCoupon.maxDiscount 
          ? Math.min(calculatedDiscount, order.appliedCoupon.maxDiscount)
          : calculatedDiscount;
      } else {
        totalCouponAmount = order.appliedCoupon.discountValue;
      }
    } else {
      const existingCouponDeductions = order.items
        .filter(orderItem => orderItem.itemCouponDiscount && orderItem.itemCouponDiscount > 0)
        .reduce((sum, orderItem) => sum + orderItem.itemCouponDiscount, 0);

      if (existingCouponDeductions > 0) {
        const processedItemsValue = order.items
          .filter(orderItem => orderItem.itemCouponDiscount && orderItem.itemCouponDiscount > 0)
          .reduce((sum, orderItem) => sum + (orderItem.price * orderItem.quantity), 0);

        if (processedItemsValue > 0) {
          const couponRate = existingCouponDeductions / processedItemsValue;
          totalCouponAmount = couponRate * totalOrderValue;
        }
      } else if (order.couponDiscount && order.couponDiscount > 0) {
        totalCouponAmount = order.couponDiscount;
      }
    }

    let itemCouponDiscount = 0;
    if (totalOrderValue > 0 && totalCouponAmount > 0) {
      itemCouponDiscount = (itemTotal / totalOrderValue) * totalCouponAmount;
      itemCouponDiscount = Math.min(itemCouponDiscount, itemTotal);
    }

    const refundAmount = Math.max(0, itemTotal - itemCouponDiscount);
    const couponRatio = itemTotal > 0 ? (itemCouponDiscount / itemTotal) : 0;
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

    return result;

  } catch (error) {
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

function calculateOrderRefund(order, reason = 'Cancellation') {
  try {
    const itemsToRefund = order.items.filter(item => 
      item.status === 'Active' || reason === 'Cancellation'
    );

    const orderSubtotal = itemsToRefund.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    const couponDiscount = order.couponDiscount || 0;
    const offerDiscount = order.offerDiscount || 0;
    const totalRefundAmount = Math.max(0, orderSubtotal - offerDiscount - couponDiscount);

    const result = {
      orderSubtotal,
      couponDiscount,
      offerDiscount,
      totalRefundAmount: Number(totalRefundAmount.toFixed(2)),
      itemsCount: itemsToRefund.length
    };

    return result;

  } catch (error) {
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
