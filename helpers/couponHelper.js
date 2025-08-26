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
  console.log('[RECALCULATE_COUPON_DEBUG]', {
    hasCouponCode: !!order.couponCode,
    couponCode: order.couponCode,
    currentCouponDiscount: order.couponDiscount,
    orderId: order._id
  });

  if (!order.couponCode) {
    console.log('[RECALCULATE_COUPON_NO_CODE]', 'No coupon code found, returning 0');
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
    totalCoupon: order.totalCoupon,
    appliedCoupon: order.appliedCoupon,
    itemStatus: item.status,
    orderId: order._id,
    currentItemId: item._id,
    existingItemCoupons: order.items.map(i => ({ 
      id: i._id, 
      status: i.status,
      itemCouponDiscount: i.itemCouponDiscount,
      hasItemCouponDiscount: !!(i.itemCouponDiscount && i.itemCouponDiscount > 0)
    }))
  });

  // Check if there's any coupon applied to the order (either current or historical)
  const hasCouponApplied = order.couponDiscount > 0 || order.couponCode || order.totalCoupon > 0 ||
    order.appliedCoupon || 
    order.items.some(orderItem => 
      orderItem.refundBreakdown && 
      orderItem.refundBreakdown.some(breakdown => breakdown.type === 'coupon')
    ) ||
    order.items.some(orderItem => orderItem.itemCouponDiscount && orderItem.itemCouponDiscount > 0);

  console.log('[COUPON_REFUND_CHECK]', {
    hasCouponApplied,
    checks: {
      couponDiscount: order.couponDiscount > 0,
      couponCode: !!order.couponCode,
      totalCoupon: order.totalCoupon > 0,
      appliedCoupon: !!order.appliedCoupon,
      hasRefundBreakdown: order.items.some(orderItem => 
        orderItem.refundBreakdown && 
        orderItem.refundBreakdown.some(breakdown => breakdown.type === 'coupon')
      ),
      hasItemCouponDiscount: order.items.some(orderItem => orderItem.itemCouponDiscount && orderItem.itemCouponDiscount > 0)
    }
  });

  if (!hasCouponApplied) {
    console.log('[COUPON_REFUND_NO_COUPON]', 'No coupon discount found');
    return { itemCouponDiscount: 0, remainingCouponDiscount: 0 };
  }

  // If order.couponDiscount is 0 but there's evidence of coupon usage, reconstruct it
  let effectiveCouponDiscount = order.couponDiscount;
  if (effectiveCouponDiscount <= 0 && order.couponCode) {
    // Try to reconstruct coupon discount from refund breakdowns
    let totalCouponFromBreakdowns = 0;
    order.items.forEach(orderItem => {
      if (orderItem.refundBreakdown) {
        const couponBreakdown = orderItem.refundBreakdown.find(b => b.type === 'coupon');
        if (couponBreakdown) {
          totalCouponFromBreakdowns += Math.abs(couponBreakdown.amount);
        }
      }
    });
    
    if (totalCouponFromBreakdowns > 0) {
      // Calculate what the original coupon would have been
      const totalItemsValue = order.items.reduce((sum, orderItem) => sum + (orderItem.price * orderItem.quantity), 0);
      const activeItemsValue = order.items.filter(orderItem => 
        orderItem.status !== 'Cancelled' && orderItem.status !== 'Returned' && orderItem.status !== 'Return Approved'
      ).reduce((sum, orderItem) => sum + (orderItem.price * orderItem.quantity), 0);
      
      if (totalItemsValue > 0) {
        effectiveCouponDiscount = (totalCouponFromBreakdowns * totalItemsValue) / (totalItemsValue - activeItemsValue);
      }
    }
  }

  if (effectiveCouponDiscount <= 0) {
    console.log('[COUPON_REFUND_NO_EFFECTIVE_COUPON]', 'No effective coupon discount calculated');
    return { itemCouponDiscount: 0, remainingCouponDiscount: 0 };
  }

  // Calculate total order value using actual sales/offer prices
  const totalOrderValue = order.items.reduce((sum, orderItem) => sum + (orderItem.price * orderItem.quantity), 0);

  console.log('[COUPON_REFUND_ORDER_VALUE]', {
    totalOrderValue,
    allItems: order.items.map(i => ({
      id: i._id,
      price: i.price,
      quantity: i.quantity,
      status: i.status,
      subtotal: i.price * i.quantity
    }))
  });

  if (totalOrderValue <= 0) {
    console.log('[COUPON_REFUND_NO_TOTAL]', 'No valid total order value found');
    return { itemCouponDiscount: 0, remainingCouponDiscount: effectiveCouponDiscount };
  }

  // Use totalCoupon if available, otherwise reconstruct from existing item coupon deductions
  let totalCouponAmount = order.totalCoupon || effectiveCouponDiscount;
  
  // If no totalCoupon found, reconstruct from already cancelled items
  if (totalCouponAmount <= 0) {
    const cancelledItemsCouponTotal = order.items
      .filter(orderItem => orderItem.itemCouponDiscount && orderItem.itemCouponDiscount > 0)
      .reduce((sum, orderItem) => sum + orderItem.itemCouponDiscount, 0);
    
    console.log('[COUPON_RECONSTRUCTION]', {
      cancelledItemsCouponTotal,
      currentItemBeingCancelled: item._id,
      cancelledItems: order.items.filter(orderItem => orderItem.itemCouponDiscount && orderItem.itemCouponDiscount > 0).map(i => ({
        id: i._id,
        price: i.price,
        quantity: i.quantity,
        status: i.status,
        itemCouponDiscount: i.itemCouponDiscount,
        isCurrentItem: i._id.toString() === item._id.toString()
      }))
    });
    
    if (cancelledItemsCouponTotal > 0) {
      // Estimate original total coupon based on cancelled items
      const cancelledItemsValue = order.items
        .filter(orderItem => orderItem.itemCouponDiscount && orderItem.itemCouponDiscount > 0)
        .reduce((sum, orderItem) => sum + (orderItem.price * orderItem.quantity), 0);
      
      if (cancelledItemsValue > 0) {
        const couponRate = cancelledItemsCouponTotal / cancelledItemsValue;
        totalCouponAmount = couponRate * totalOrderValue;
        
        console.log('[COUPON_RECONSTRUCTION_CALC]', {
          cancelledItemsValue,
          couponRate,
          totalOrderValue,
          reconstructedTotalCoupon: totalCouponAmount
        });
      }
    }
  }

  // Calculate proportional coupon discount using the formula:
  // (item_price / total_order_value) * total_coupon
  const itemSubtotal = item.price * item.quantity;
  const itemPriceRatio = itemSubtotal / totalOrderValue;
  const itemCouponDiscount = Math.min(itemSubtotal, itemPriceRatio * totalCouponAmount);

  // Calculate remaining coupon discount after this item is removed
  const remainingCouponDiscount = Math.max(0, order.couponDiscount - itemCouponDiscount);

  console.log('[COUPON_REFUND_CALCULATION]', {
    totalOrderValue,
    itemSubtotal,
    itemPriceRatio: (itemPriceRatio * 100).toFixed(2) + '%',
    totalCouponAmount,
    itemCouponDiscount,
    remainingCouponDiscount,
    orderCouponDiscount: order.couponDiscount,
    calculationCheck: `min(${itemSubtotal}, ${itemPriceRatio.toFixed(4)} * ${totalCouponAmount}) = ${itemCouponDiscount}`,
    reconstructedFromCancelled: totalCouponAmount > (order.totalCoupon || effectiveCouponDiscount),
    itemId: item._id,
    itemStatus: item.status
  });

  return { 
    itemCouponDiscount, 
    remainingCouponDiscount,
    itemCouponRatio: itemPriceRatio
  };
}

module.exports = {
  validateAndUpdateCartCoupon,
  recalculateOrderCoupon,
  calculateItemCouponRefund
};
