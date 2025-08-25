const mongoose = require('mongoose');
const { Order } = require('../models/orderSchema');
const { calculateItemCouponRefund } = require('../helpers/couponHelper');

async function fixCancelledItemRefunds() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all orders with cancelled items that have refund amounts
        const orders = await Order.find({
            'items.status': 'Cancelled',
            'items.refundAmount': { $exists: true }
        }).populate('items.product');

        console.log(`Found ${orders.length} orders with cancelled items`);

        for (const order of orders) {
            let orderUpdated = false;
            console.log(`\nProcessing order: ${order._id}`);
            console.log(`Coupon Code: ${order.couponCode}, Coupon Discount: ${order.couponDiscount}`);

            for (const item of order.items) {
                if (item.status === 'Cancelled' && item.refundAmount) {
                    console.log(`\nProcessing cancelled item: ${item.product.name}`);
                    console.log(`Current refund amount: ₹${item.refundAmount}`);

                    // Recalculate the refund with coupon deduction
                    const { itemCouponDiscount } = await calculateItemCouponRefund(order, item);
                    const itemTotal = item.price * item.quantity;
                    const newRefundAmount = itemTotal - itemCouponDiscount;

                    console.log(`Item total: ₹${itemTotal}`);
                    console.log(`Coupon deduction: ₹${itemCouponDiscount}`);
                    console.log(`New refund amount: ₹${newRefundAmount}`);

                    if (Math.abs(item.refundAmount - newRefundAmount) > 0.01) {
                        item.refundAmount = newRefundAmount;
                        orderUpdated = true;
                        console.log(`✓ Updated refund amount from ₹${item.refundAmount} to ₹${newRefundAmount}`);
                    } else {
                        console.log('✓ Refund amount already correct');
                    }
                }
            }

            if (orderUpdated) {
                await order.save();
                console.log(`✓ Order ${order._id} updated successfully`);
            }
        }

        console.log('\n✅ All cancelled item refunds have been fixed!');
    } catch (error) {
        console.error('❌ Error fixing cancelled item refunds:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
if (require.main === module) {
    require('dotenv').config();
    fixCancelledItemRefunds();
}

module.exports = { fixCancelledItemRefunds };