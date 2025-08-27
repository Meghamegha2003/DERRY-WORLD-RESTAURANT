const Razorpay = require('razorpay');
const Wallet = require('../models/walletSchema');
const { calculateItemRefund, calculateOrderRefund, validateRefundInputs } = require('./refundCalculationService');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Process refund for whole order cancellation
 * @param {Object} order - The order object
 * @param {String} reason - Reason for refund ('Cancellation' or 'Return')
 * @returns {Promise<Object>} - Refund result
 */
async function processOrderRefund(order, reason = 'Cancellation') {
  try {
    console.log(`[REFUND_SERVICE] Processing ${reason.toLowerCase()} refund for order ${order._id}`);
    
    // Validate inputs
    const validation = validateRefundInputs(order);
    if (!validation.isValid) {
      console.error('[REFUND_SERVICE] Validation failed:', validation.errors);
      return {
        success: false,
        message: `Validation failed: ${validation.errors.join(', ')}`,
        refundAmount: 0
      };
    }

    // Use centralized calculation service
    const refundCalculation = calculateOrderRefund(order, reason);
    
    if (refundCalculation.error) {
      console.error('[REFUND_SERVICE] Calculation error:', refundCalculation.error);
      return {
        success: false,
        message: `Calculation failed: ${refundCalculation.error}`,
        refundAmount: 0
      };
    }

    const { totalRefundAmount, orderSubtotal, couponDiscount, offerDiscount } = refundCalculation;
    
    console.log(`[REFUND_SERVICE] Refund calculation:`, {
      orderSubtotal,
      couponDiscount,
      offerDiscount,
      totalRefundAmount,
      paymentMethod: order.paymentMethod
    });

    if (totalRefundAmount <= 0) {
      return {
        success: false,
        message: 'No refund amount calculated',
        refundAmount: 0
      };
    }

    let refundResult = { success: false, refundAmount: totalRefundAmount };

    // Process refund based on payment method
    if (order.paymentMethod === 'cod') {
      // COD orders don't need refund processing
      refundResult = {
        success: true,
        message: 'COD order - no refund needed',
        refundAmount: 0,
        method: 'cod'
      };
    } else if (order.paymentMethod === 'wallet') {
      // Refund to wallet
      refundResult = await processWalletRefund(order.user, totalRefundAmount, order, reason);
    } else if (order.paymentMethod === 'online' && order.razorpay?.paymentId) {
      // Try Razorpay refund first, fallback to wallet
      refundResult = await processRazorpayRefund(order, totalRefundAmount, reason);
      
      if (!refundResult.success) {
        console.log('[REFUND_SERVICE] Razorpay refund failed, falling back to wallet');
        refundResult = await processWalletRefund(order.user, totalRefundAmount, order, reason);
      }
    } else {
      // Default to wallet refund
      refundResult = await processWalletRefund(order.user, totalRefundAmount, order, reason);
    }

    // Update order refund tracking
    if (refundResult.success) {
      order.orderLevelRefund = (order.orderLevelRefund || 0) + totalRefundAmount;
      
      if (refundResult.method === 'wallet') {
        order.walletRefund = (order.walletRefund || 0) + totalRefundAmount;
      }

      order.refundTransactions.push({
        type: refundResult.method === 'wallet' ? 'Wallet' : 'Razorpay',
        amount: totalRefundAmount,
        reason,
        razorpayRefundId: refundResult.razorpayRefundId,
        walletTransactionId: refundResult.walletTransactionId,
        status: 'Completed'
      });

      await order.save();
    }

    return refundResult;

  } catch (error) {
    console.error('[REFUND_SERVICE] Error processing order refund:', error);
    return {
      success: false,
      message: `Refund processing failed: ${error.message}`,
      refundAmount: 0
    };
  }
}

/**
 * Process refund for individual item cancellation/return
 * @param {Object} order - The order object
 * @param {Object} item - The item being cancelled/returned
 * @param {String} reason - Reason for refund ('Cancellation' or 'Return')
 * @returns {Promise<Object>} - Refund result
 */
async function processItemRefund(order, item, reason = 'Cancellation') {
  try {
    console.log(`[REFUND_SERVICE] Processing item ${reason.toLowerCase()} refund for item ${item._id}`);
    
    // Validate inputs
    const validation = validateRefundInputs(order, item);
    if (!validation.isValid) {
      console.error('[REFUND_SERVICE] Validation failed:', validation.errors);
      return {
        success: false,
        message: `Validation failed: ${validation.errors.join(', ')}`,
        refundAmount: 0
      };
    }

    // Use centralized calculation service
    const refundCalculation = calculateItemRefund(order, item);
    
    if (refundCalculation.error) {
      console.error('[REFUND_SERVICE] Calculation error:', refundCalculation.error);
      return {
        success: false,
        message: `Calculation failed: ${refundCalculation.error}`,
        refundAmount: 0
      };
    }

    const { 
      itemTotal, 
      itemCouponDiscount, 
      refundAmount: itemRefundAmount, 
      couponRatio, 
      remainingCouponDiscount 
    } = refundCalculation;
    
    console.log(`[REFUND_SERVICE] Item refund calculation:`, {
      itemTotal,
      itemCouponDiscount,
      itemRefundAmount,
      couponRatio,
      calculationCheck: `${itemTotal} - ${itemCouponDiscount} = ${itemRefundAmount}`,
      orderHasCoupon: !!(order.totalCoupon || order.couponDiscount || order.appliedCoupon),
      orderTotalCoupon: order.totalCoupon,
      orderCouponDiscount: order.couponDiscount,
      appliedCoupon: order.appliedCoupon
    });

    if (itemRefundAmount <= 0) {
      return {
        success: false,
        message: 'No refund amount calculated for item',
        refundAmount: 0
      };
    }

    let refundResult = { success: false, refundAmount: itemRefundAmount };

    // Process refund based on payment method
    if (order.paymentMethod === 'cod') {
      refundResult = {
        success: true,
        message: 'COD order - no refund needed',
        refundAmount: 0,
        method: 'cod'
      };
    } else if (order.paymentMethod === 'wallet') {
      refundResult = await processWalletRefund(order.user, itemRefundAmount, order, reason, item);
    } else if (order.paymentMethod === 'online' && order.razorpay?.paymentId) {
      // For individual items, we'll use wallet refund as Razorpay partial refunds are complex
      refundResult = await processWalletRefund(order.user, itemRefundAmount, order, reason, item);
    } else {
      refundResult = await processWalletRefund(order.user, itemRefundAmount, order, reason, item);
    }

    // Update item and order refund tracking
    if (refundResult.success) {
      // Store the actual refunded amount (after coupon deduction) in the item
      item.refundAmount = itemRefundAmount;
      item.itemCouponDiscount = itemCouponDiscount;
      item.couponRatio = couponRatio;
      item.refundStatus = 'Completed';
      item.refundDate = new Date();

      // Update order totals
      order.orderLevelRefund = (order.orderLevelRefund || 0) + itemRefundAmount;
      
      if (refundResult.method === 'wallet') {
        order.walletRefund = (order.walletRefund || 0) + itemRefundAmount;
      }

      // Update remaining coupon discount
      order.couponDiscount = remainingCouponDiscount;

      // Add refund transaction
      order.refundTransactions.push({
        type: refundResult.method === 'wallet' ? 'Wallet' : 'Razorpay',
        amount: itemRefundAmount,
        reason,
        itemReference: item._id,
        razorpayRefundId: refundResult.razorpayRefundId,
        walletTransactionId: refundResult.walletTransactionId,
        status: 'Completed'
      });

      await order.save();
    }

    return refundResult;

  } catch (error) {
    console.error('[REFUND_SERVICE] Error processing item refund:', error);
    return {
      success: false,
      message: `Item refund processing failed: ${error.message}`,
      refundAmount: 0
    };
  }
}

/**
 * Process Razorpay refund
 * @param {Object} order - The order object
 * @param {Number} amount - Refund amount
 * @param {String} reason - Refund reason
 * @returns {Promise<Object>} - Refund result
 */
async function processRazorpayRefund(order, amount, reason) {
  try {
    console.log(`[REFUND_SERVICE] Processing Razorpay refund for payment ${order.razorpay.paymentId}`);
    
    const refundAmount = Math.round(amount * 100); // Convert to paise
    
    const refund = await razorpay.payments.refund(order.razorpay.paymentId, {
      amount: refundAmount,
      notes: {
        order_id: order._id.toString(),
        reason: reason
      }
    });

    console.log(`[REFUND_SERVICE] Razorpay refund successful:`, refund.id);

    return {
      success: true,
      message: 'Razorpay refund processed successfully',
      refundAmount: amount,
      method: 'razorpay',
      razorpayRefundId: refund.id
    };

  } catch (error) {
    console.error('[REFUND_SERVICE] Razorpay refund failed:', error);
    return {
      success: false,
      message: `Razorpay refund failed: ${error.message}`,
      refundAmount: 0
    };
  }
}

/**
 * Process wallet refund
 * @param {String} userId - User ID
 * @param {Number} amount - Refund amount
 * @param {Object} order - Order object
 * @param {String} reason - Refund reason
 * @param {Object} item - Item object (optional, for item-specific refunds)
 * @returns {Promise<Object>} - Refund result
 */
async function processWalletRefund(userId, amount, order, reason, item = null) {
  try {
    console.log(`[REFUND_SERVICE] Processing wallet refund for user ${userId}, amount: ${amount}`);
    
    // Find or create wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({
        user: userId,
        balance: 0,
        transactions: []
      });
    }

    const previousBalance = wallet.balance;
    wallet.balance += amount;

    // Create transaction record with coupon breakdown
    let originalAmount = item ? Number((item.price * item.quantity).toFixed(2)) : Number(amount.toFixed(2));
    let couponDiscount = 0;
    let couponRatio = 0;
    
    if (item) {
      // Use stored coupon data from refund calculation
      couponDiscount = Number((item.itemCouponDiscount || 0).toFixed(2));
      couponRatio = Number(((item.couponRatio || 0) * 100).toFixed(2));
      
      // If no stored coupon data but we have a difference, calculate it
      if (couponDiscount === 0 && originalAmount > amount) {
        couponDiscount = Number((originalAmount - amount).toFixed(2));
        couponRatio = Number(((couponDiscount / originalAmount) * 100).toFixed(2));
        console.log('[WALLET_REFUND] Calculated coupon data:', { couponDiscount, couponRatio });
      }
    }
    
    const transaction = {
      type: 'refund',
      amount: Number(amount.toFixed(2)),
      finalAmount: Number(amount.toFixed(2)),
      originalAmount: originalAmount,
      couponDiscount: couponDiscount,
      couponRatio: couponRatio,
      refundAmount: Number(amount.toFixed(2)),
      description: item 
        ? `${reason} refund for item in order #${order._id.toString().slice(-8).toUpperCase()}`
        : `${reason} refund for order #${order._id.toString().slice(-8).toUpperCase()}`,
      orderId: order._id.toString(),
      orderReference: order._id,
      status: 'completed',
      date: new Date()
    };

    console.log('[WALLET_TRANSACTION_CREATE]', {
      itemId: item ? item._id : 'N/A',
      originalAmount: transaction.originalAmount,
      couponDiscount: transaction.couponDiscount,
      couponRatio: transaction.couponRatio,
      refundAmount: transaction.amount,
      itemCouponDiscount: item ? item.itemCouponDiscount : 'N/A',
      itemCouponRatio: item ? item.couponRatio : 'N/A'
    });

    wallet.transactions.push(transaction);
    await wallet.save();

    const transactionId = wallet.transactions[wallet.transactions.length - 1]._id;

    console.log(`[REFUND_SERVICE] Wallet refund successful. New balance: ${wallet.balance}`);

    return {
      success: true,
      message: 'Amount refunded to wallet successfully',
      refundAmount: amount,
      method: 'wallet',
      walletTransactionId: transactionId.toString(),
      newBalance: wallet.balance
    };

  } catch (error) {
    console.error('[REFUND_SERVICE] Wallet refund failed:', error);
    return {
      success: false,
      message: `Wallet refund failed: ${error.message}`,
      refundAmount: 0
    };
  }
}

module.exports = {
  processOrderRefund,
  processItemRefund,
  processRazorpayRefund,
  processWalletRefund
};
