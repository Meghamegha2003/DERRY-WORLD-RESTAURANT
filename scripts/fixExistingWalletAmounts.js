const mongoose = require('mongoose');
const Wallet = require('../models/walletSchema');
const { Order } = require('../models/orderSchema');
const { calculateItemCouponRefund } = require('../helpers/couponHelper');

/**
 * Fix existing wallet transactions to show correct net refund amounts
 * This script recalculates refund amounts by subtracting proportional coupon discounts
 */
async function fixExistingWalletAmounts() {
    try {
        console.log('🔄 Starting existing wallet amount fix...');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find all wallets with refund transactions that need fixing
        const wallets = await Wallet.find({
            'transactions': {
                $elemMatch: {
                    type: 'credit',
                    description: { $regex: /refund|cancelled|returned/i },
                    // Look for transactions without breakdown data or with suspicious amounts
                    $or: [
                        { originalAmount: { $exists: false } },
                        { couponDiscount: { $exists: false } },
                        { originalAmount: 0 },
                        { couponDiscount: 0 }
                    ]
                }
            }
        });

        console.log(`📊 Found ${wallets.length} wallets with transactions needing amount fix`);

        let totalFixed = 0;
        let balanceAdjustments = [];

        for (const wallet of wallets) {
            let walletUpdated = false;
            let balanceAdjustment = 0;

            for (const transaction of wallet.transactions) {
                // Check if this is a refund transaction that needs fixing
                const isRefund = transaction.type === 'credit' && 
                    transaction.description && 
                    /refund|cancelled|returned/i.test(transaction.description);

                if (isRefund && transaction.orderId && !transaction.originalAmount) {
                    try {
                        const order = await Order.findById(transaction.orderId);
                        if (order && order.couponDiscount > 0) {
                            // Extract item name from description
                            const itemMatch = transaction.description.match(/cancelled item: (.+)|returned item: (.+)/i);
                            const itemName = itemMatch ? (itemMatch[1] || itemMatch[2]) : null;
                            
                            if (itemName) {
                                const item = order.items.find(i => i.product && i.product.name === itemName);
                                if (item) {
                                    const itemTotal = item.price * item.quantity;
                                    const originalOrderTotal = order.items.reduce((sum, orderItem) => sum + (orderItem.price * orderItem.quantity), 0);
                                    const itemRatio = originalOrderTotal > 0 ? itemTotal / originalOrderTotal : 0;
                                    const proportionalCouponDeduction = (order.couponDiscount * itemRatio);
                                    const correctNetAmount = itemTotal - proportionalCouponDeduction;
                                    
                                    // Calculate the difference between current amount and correct amount
                                    const amountDifference = transaction.amount - correctNetAmount;
                                    
                                    console.log(`🔧 Fixing transaction: ${itemName}`);
                                    console.log(`   Current amount: ₹${transaction.amount.toFixed(2)}`);
                                    console.log(`   Correct amount: ₹${correctNetAmount.toFixed(2)}`);
                                    console.log(`   Difference: ₹${amountDifference.toFixed(2)}`);
                                    
                                    // Update transaction with correct data
                                    transaction.amount = Math.round(correctNetAmount * 100) / 100;
                                    transaction.originalAmount = itemTotal;
                                    transaction.couponDiscount = Math.round(proportionalCouponDeduction * 100) / 100;
                                    transaction.couponRatio = Math.round(itemRatio * 10000) / 100; // Percentage
                                    
                                    // Track balance adjustment needed
                                    balanceAdjustment -= amountDifference;
                                    
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

            // Update wallet balance to reflect corrected transaction amounts
            if (walletUpdated && balanceAdjustment !== 0) {
                const oldBalance = wallet.balance;
                wallet.balance += balanceAdjustment;
                
                console.log(`💰 Adjusting wallet balance for user ${wallet.user}:`);
                console.log(`   Old balance: ₹${oldBalance.toFixed(2)}`);
                console.log(`   Adjustment: ₹${balanceAdjustment.toFixed(2)}`);
                console.log(`   New balance: ₹${wallet.balance.toFixed(2)}`);
                
                balanceAdjustments.push({
                    userId: wallet.user,
                    oldBalance,
                    adjustment: balanceAdjustment,
                    newBalance: wallet.balance
                });
            }

            // Save wallet if any transactions were updated
            if (walletUpdated) {
                await wallet.save();
                console.log(`💾 Updated wallet for user: ${wallet.user}`);
            }
        }

        console.log(`\n✅ Fixed ${totalFixed} wallet transactions!`);
        console.log(`💰 Adjusted ${balanceAdjustments.length} wallet balances`);
        
        if (balanceAdjustments.length > 0) {
            console.log('\n📊 Balance Adjustment Summary:');
            balanceAdjustments.forEach(adj => {
                console.log(`User ${adj.userId}: ₹${adj.oldBalance.toFixed(2)} → ₹${adj.newBalance.toFixed(2)} (${adj.adjustment >= 0 ? '+' : ''}₹${adj.adjustment.toFixed(2)})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error fixing wallet amounts:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
if (require.main === module) {
    require('dotenv').config();
    fixExistingWalletAmounts();
}

module.exports = { fixExistingWalletAmounts };
