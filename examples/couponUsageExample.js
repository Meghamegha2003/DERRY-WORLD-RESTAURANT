// Example usage of the new coupon calculation system
const { updateOrderCouponCalculations } = require('../helpers/couponHelper');
const { Order } = require('../models/orderSchema');
const Coupon = require('../models/couponSchema');

/**
 * Example: How to use the new coupon system when creating an order
 */
async function createOrderWithCoupon(orderData, couponCode) {
  try {
    // 1. Create the order first
    const order = new Order(orderData);
    
    // 2. If coupon is applied, get the coupon and update calculations
    if (couponCode) {
      const coupon = await Coupon.findOne({ 
        code: couponCode, 
        isActive: true 
      });
      
      if (coupon && coupon.isValid()) {
        // Set applied coupon info
        order.appliedCoupon = {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minPurchase: coupon.minPurchase,
          maxDiscount: coupon.maxDiscount,
          couponId: coupon._id
        };
        
        // 3. Calculate all coupon values and update order
        await updateOrderCouponCalculations(order, coupon);
        
        // 4. Update final order total
        order.total = order.total - order.balanceCoupon;
      }
    }
    
    // 5. Save the order
    await order.save();
    
    console.log('Order created with coupon calculations:', {
      orderId: order._id,
      totalCoupon: order.totalCoupon,
      balanceCoupon: order.balanceCoupon,
      finalTotal: order.total
    });
    
    return order;
  } catch (error) {
    console.error('Error creating order with coupon:', error);
    throw error;
  }
}

/**
 * Example: How to update coupon calculations when cancelling an item
 */
async function cancelOrderItemWithCoupon(orderId, itemId) {
  try {
    // 1. Get the order
    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found');
    
    // 2. Find the item to cancel
    const item = order.items.id(itemId);
    if (!item) throw new Error('Item not found');
    
    // 3. Mark item as cancelled
    item.status = 'Cancelled';
    item.cancelledAt = new Date();
    
    // 4. Update coupon calculations
    await updateOrderCouponCalculations(order);
    
    // 5. Update order total
    const activeItemsTotal = order.items
      .filter(item => item.status === 'Active')
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    order.total = activeItemsTotal - order.balanceCoupon;
    
    // 6. Save the order
    await order.save();
    
    console.log('Item cancelled with updated coupon calculations:', {
      orderId: order._id,
      cancelledItemId: itemId,
      totalCoupon: order.totalCoupon,
      deductRefundCoupon: order.deductRefundCoupon,
      balanceCoupon: order.balanceCoupon,
      newTotal: order.total
    });
    
    return order;
  } catch (error) {
    console.error('Error cancelling item with coupon update:', error);
    throw error;
  }
}

/**
 * Example: How to display coupon breakdown in frontend
 */
function getCouponBreakdownForDisplay(order) {
  return {
    hasCoupon: order.totalCoupon > 0,
    totalCoupon: order.totalCoupon || 0,
    deductRefundCoupon: order.deductRefundCoupon || 0,
    balanceCoupon: order.balanceCoupon || 0,
    couponCode: order.appliedCoupon?.code || null,
    
    // Percentage calculations
    usedPercentage: order.totalCoupon > 0 ? 
      ((order.deductRefundCoupon / order.totalCoupon) * 100).toFixed(1) : 0,
    remainingPercentage: order.totalCoupon > 0 ? 
      ((order.balanceCoupon / order.totalCoupon) * 100).toFixed(1) : 0,
    
    // Individual item breakdowns
    itemBreakdowns: order.items.map(item => ({
      itemId: item._id,
      itemTotal: item.price * item.quantity,
      individualCoupon: item.individualCoupon || 0,
      deductRefundCoupon: item.deductRefundCoupon || 0,
      couponRatio: item.couponRatio || 0,
      status: item.status
    }))
  };
}

module.exports = {
  createOrderWithCoupon,
  cancelOrderItemWithCoupon,
  getCouponBreakdownForDisplay
};
