const Razorpay = require('razorpay');
const Wallet = require('../models/walletSchema');
const { calculateItemRefund, calculateOrderRefund, validateRefundInputs } = require('./refundCalculationService');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function processOrderRefund(order, reason = 'Cancellation') {
  try {
    const validation = validateRefundInputs(order);
    if (!validation.isValid) {
      return {
        success: false,
        message: `Validation failed: ${validation.errors.join(', ')}`,
        refundAmount: 0
      };
    }

    // Process each item individually to get proper coupon breakdown
    let totalRefundAmount = 0;
    const refundResults = [];
    
    if (order.paymentMethod === 'cod') {
      return {
        success: true,
        message: 'COD order - no refund needed',
        refundAmount: 0,
        method: 'cod'
      };
    }

    // Process each active item individually for proper coupon calculations
    for (const item of order.items) {
      if (item.status === 'Active' || !item.status) {
        const itemRefundCalculation = calculateItemRefund(order, item);
        
        if (itemRefundCalculation.error) {
          continue; // Skip this item if calculation fails
        }

        const { 
          itemTotal, 
          itemCouponDiscount, 
          refundAmount: itemRefundAmount, 
          couponRatio 
        } = itemRefundCalculation;

        if (itemRefundAmount > 0) {
          let itemRefundResult;
          
          if (order.paymentMethod === 'wallet') {
            itemRefundResult = await processWalletRefund(order.user, itemRefundAmount, order, reason, item);
          } else if (order.paymentMethod === 'online' && order.razorpay?.paymentId) {
            itemRefundResult = await processWalletRefund(order.user, itemRefundAmount, order, reason, item);
          } else {
            itemRefundResult = await processWalletRefund(order.user, itemRefundAmount, order, reason, item);
          }

          if (itemRefundResult.success) {
            // Store refund data in item for tracking
            item.refundAmount = itemRefundAmount;
            item.itemCouponDiscount = itemCouponDiscount;
            item.couponRatio = couponRatio;
            item.refundStatus = 'Completed';
            item.refundDate = new Date();
            
            totalRefundAmount += itemRefundAmount;
            refundResults.push(itemRefundResult);
          }
        }
      }
    }

    if (totalRefundAmount > 0 && refundResults.length > 0) {
      order.orderLevelRefund = (order.orderLevelRefund || 0) + totalRefundAmount;
      order.walletRefund = (order.walletRefund || 0) + totalRefundAmount;

      // Add consolidated refund transaction record
      order.refundTransactions.push({
        type: 'Wallet',
        amount: totalRefundAmount,
        reason,
        walletTransactionId: refundResults.map(r => r.walletTransactionId).join(','),
        status: 'Completed'
      });

      // Reset coupon discount since entire order is cancelled
      order.couponDiscount = 0;

      await order.save();

      return {
        success: true,
        message: 'Order refund processed successfully',
        refundAmount: totalRefundAmount,
        method: 'wallet',
        itemsProcessed: refundResults.length
      };
    } else {
      return {
        success: false,
        message: 'No refund amount calculated or all item refunds failed',
        refundAmount: 0
      };
    }

  } catch (error) {
    return {
      success: false,
      message: `Refund processing failed: ${error.message}`,
      refundAmount: 0
    };
  }
}

async function processItemRefund(order, item, reason = 'Cancellation') {
  try {
    const validation = validateRefundInputs(order, item);
    if (!validation.isValid) {
      return {
        success: false,
        message: `Validation failed: ${validation.errors.join(', ')}`,
        refundAmount: 0
      };
    }

    const refundCalculation = calculateItemRefund(order, item);
    
    if (refundCalculation.error) {
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

    if (itemRefundAmount <= 0) {
      return {
        success: false,
        message: 'No refund amount calculated for item',
        refundAmount: 0
      };
    }

    let refundResult = { success: false, refundAmount: itemRefundAmount };

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
      refundResult = await processWalletRefund(order.user, itemRefundAmount, order, reason, item);
    } else {
      refundResult = await processWalletRefund(order.user, itemRefundAmount, order, reason, item);
    }

    if (refundResult.success) {
      item.refundAmount = itemRefundAmount;
      item.itemCouponDiscount = itemCouponDiscount;
      item.couponRatio = couponRatio;
      item.refundStatus = 'Completed';
      item.refundDate = new Date();

      order.orderLevelRefund = (order.orderLevelRefund || 0) + itemRefundAmount;
      
      if (refundResult.method === 'wallet') {
        order.walletRefund = (order.walletRefund || 0) + itemRefundAmount;
      }

      order.couponDiscount = remainingCouponDiscount;

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
    return {
      success: false,
      message: `Item refund processing failed: ${error.message}`,
      refundAmount: 0
    };
  }
}

async function processRazorpayRefund(order, amount, reason) {
  try {
    const refundAmount = Math.round(amount * 100);
    
    const refund = await razorpay.payments.refund(order.razorpay.paymentId, {
      amount: refundAmount,
      notes: {
        order_id: order._id.toString(),
        reason: reason
      }
    });

    return {
      success: true,
      message: 'Razorpay refund processed successfully',
      refundAmount: amount,
      method: 'razorpay',
      razorpayRefundId: refund.id
    };

  } catch (error) {
    return {
      success: false,
      message: `Razorpay refund failed: ${error.message}`,
      refundAmount: 0
    };
  }
}

async function processWalletRefund(userId, amount, order, reason, item = null) {
  try {
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

    let originalAmount = item ? Number((item.price * item.quantity).toFixed(2)) : Number(amount.toFixed(2));
    let couponDiscount = 0;
    let couponRatio = 0;
    
    if (item) {
      couponDiscount = Number((item.itemCouponDiscount || 0).toFixed(2));
      couponRatio = Number(((item.couponRatio || 0) * 100).toFixed(2));
      
      if (couponDiscount === 0 && originalAmount > amount) {
        couponDiscount = Number((originalAmount - amount).toFixed(2));
        couponRatio = Number(((couponDiscount / originalAmount) * 100).toFixed(2));
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

    wallet.transactions.push(transaction);
    await wallet.save();

    const transactionId = wallet.transactions[wallet.transactions.length - 1]._id;

    return {
      success: true,
      message: 'Amount refunded to wallet successfully',
      refundAmount: amount,
      method: 'wallet',
      walletTransactionId: transactionId.toString(),
      newBalance: wallet.balance
    };

  } catch (error) {
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
