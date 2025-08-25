const mongoose = require('mongoose');
const Wallet = require('../models/walletSchema');
const { Order } = require('../models/orderSchema');
require('dotenv').config();

async function updateWalletTransactions() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all wallet transactions that are refunds but missing coupon breakdown
        const wallets = await Wallet.find({
            'transactions.type': 'credit',
            'transactions.description': { $regex: /refund|cancelled|returned/i }
        });

        console.log(`Found ${wallets.length} wallets with refund transactions`);

        for (const wallet of wallets) {
            let updated = false;
            
            for (const transaction of wallet.transactions) {
                // Check if this is a refund transaction missing breakdown data
                if (transaction.type === 'credit' && 
                    transaction.description && 
                    (transaction.description.toLowerCase().includes('refund') ||
                     transaction.description.toLowerCase().includes('cancelled') ||
                     transaction.description.toLowerCase().includes('returned')) &&
                    (!transaction.originalAmount || transaction.originalAmount === 0)) {
                    
                    // Extract order ID from description
                    const orderIdMatch = transaction.description.match(/#([A-F0-9]{8})/);
                    if (orderIdMatch) {
                        const orderIdSuffix = orderIdMatch[1];
                        
                        // Find the order by matching the last 8 characters
                        const order = await Order.findOne({
                            $expr: {
                                $eq: [
                                    { $substr: [{ $toString: "$_id" }, -8, 8] },
                                    orderIdSuffix.toLowerCase()
                                ]
                            }
                        });
                        
                        if (order && order.couponDiscount > 0) {
                            // Calculate what the breakdown should have been
                            const orderTotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                            const couponRatio = (order.couponDiscount / orderTotal) * 100;
                            
                            // Estimate the original item amount based on the refund amount and coupon ratio
                            const estimatedOriginalAmount = transaction.amount / (1 - (order.couponDiscount / orderTotal));
                            const estimatedCouponDeduction = estimatedOriginalAmount - transaction.amount;
                            
                            // Update the transaction with estimated breakdown
                            transaction.originalAmount = Math.round(estimatedOriginalAmount * 100) / 100;
                            transaction.couponDiscount = Math.round(estimatedCouponDeduction * 100) / 100;
                            transaction.couponRatio = Math.round(couponRatio * 100) / 100;
                            
                            console.log(`Updated transaction for order ${order._id}:`, {
                                amount: transaction.amount,
                                originalAmount: transaction.originalAmount,
                                couponDiscount: transaction.couponDiscount,
                                couponRatio: transaction.couponRatio
                            });
                            
                            updated = true;
                        }
                    }
                }
            }
            
            if (updated) {
                await wallet.save();
                console.log(`Updated wallet for user ${wallet.user}`);
            }
        }
        
        console.log('Wallet transaction update completed');
        
    } catch (error) {
        console.error('Error updating wallet transactions:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

updateWalletTransactions();
