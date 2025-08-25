const mongoose = require('mongoose');
const Wallet = require('../models/walletSchema');
require('dotenv').config();

async function checkWalletData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find wallet transactions that mention "E2EC7F1A" (from the image)
        const wallets = await Wallet.find({
            'transactions.description': { $regex: /E2EC7F1A/i }
        });

        console.log(`Found ${wallets.length} wallets with E2EC7F1A transactions`);

        for (const wallet of wallets) {
            console.log(`\nWallet for user: ${wallet.user}`);
            
            for (const transaction of wallet.transactions) {
                if (transaction.description && transaction.description.includes('E2EC7F1A')) {
                    console.log('Transaction details:', {
                        type: transaction.type,
                        amount: transaction.amount,
                        originalAmount: transaction.originalAmount,
                        couponDiscount: transaction.couponDiscount,
                        couponRatio: transaction.couponRatio,
                        description: transaction.description,
                        date: transaction.date
                    });
                }
            }
        }
        
    } catch (error) {
        console.error('Error checking wallet data:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

checkWalletData();
