const mongoose = require('mongoose');
const Wallet = require('../models/walletSchema');
const { Order } = require('../models/orderSchema');

/**
 * Fix wallet transactions missing breakdown data
 * Add originalAmount, couponDiscount, and couponRatio for existing refund transactions
 */
async function fixWalletCouponRatio() {
    try {
        console.log('🔄 Starting wallet refund breakdown fix...');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find all wallets with refund transactions that might be missing breakdown data
        const wallets = await Wallet.find({
            'transactions': {
                $elemMatch: {
                    type: 'credit',
                    description: { $regex: /refund|cancelled|returned/i },
                    $or: [
                        { originalAmount: { $exists: false } },
                        { couponDiscount: { $exists: false } },
                        { originalAmount: 0 },
                        { couponDiscount: 0 }
                    ]
                }
            }
        });

        console.log(`📊 Found ${wallets.length} wallets with refund transactions needing breakdown data`);

        let totalFixed = 0;

        for (const wallet of wallets) {
            let walletUpdated = false;

            for (const transaction of wallet.transactions) {
                // Check if this is a refund transaction that needs fixing
                const isRefund = transaction.type === 'credit' && 
                    transaction.description && 
                    /refund|cancelled|returned/i.test(transaction.description);

                if (isRefund && transaction.orderId && (!transaction.originalAmount || !transaction.couponDiscount)) {
                    try {
                        const order = await Order.findById(transaction.orderId);
                        if (order && order.couponDiscount > 0) {
                            // Find the cancelled/returned item from the description
                            const itemMatch = transaction.description.match(/cancelled item: (.+)|returned item: (.+)/i);
                            const itemName = itemMatch ? (itemMatch[1] || itemMatch[2]) : null;
                            
                            if (itemName) {
                                const item = order.items.find(i => i.product && i.product.name === itemName);
                                if (item) {
                                    const itemTotal = item.price * item.quantity;
                                    const originalOrderTotal = order.items.reduce((sum, orderItem) => sum + (orderItem.price * orderItem.quantity), 0);
                                    const itemRatio = originalOrderTotal > 0 ? itemTotal / originalOrderTotal : 0;
                                    const proportionalCouponDeduction = (order.couponDiscount * itemRatio);
                                    
                                    // Update transaction with breakdown data
                                    transaction.originalAmount = itemTotal;
                                    transaction.couponDiscount = Math.round(proportionalCouponDeduction * 100) / 100;
                                    transaction.couponRatio = Math.round(itemRatio * 10000) / 100; // Percentage
                                    
                                    console.log(`🔧 Fixed refund transaction: ${itemName} - Item: ₹${itemTotal}, Coupon: ₹${transaction.couponDiscount.toFixed(2)}, Ratio: ${transaction.couponRatio.toFixed(2)}%`);
                                    walletUpdated = true;
                                    totalFixed++;
                                }
                            }
                        }
                    } catch (orderError) {
                        console.log(`⚠️  Could not process order ${transaction.orderId}: ${orderError.message}`);
                    }
                }
            }

            // Save wallet if any transactions were updated
            if (walletUpdated) {
                await wallet.save();
                console.log(`💾 Updated wallet for user: ${wallet.user}`);
            }
        }

        console.log(`\n✅ Fixed ${totalFixed} wallet refund transactions with breakdown data!`);
        
    } catch (error) {
        console.error('❌ Error fixing wallet refund breakdowns:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
if (require.main === module) {
    require('dotenv').config();
    fixWalletCouponRatio();
}

module.exports = { fixWalletCouponRatio };
