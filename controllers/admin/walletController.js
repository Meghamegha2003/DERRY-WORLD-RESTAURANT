const Wallet = require('../../models/walletSchema');

// Admin manual refund to user wallet
exports.manualRefund = async (req, res) => {
    const { userId } = req.params;
    const { amount, description } = req.body;
    try {
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) wallet = new Wallet({ user: userId, balance: 0, transactions: [] });
        wallet.balance += Number(amount);
        wallet.transactions.push({
            type: 'credit',
            amount: Number(amount),
            description: description || 'Manual refund',
            date: new Date(),
            status: 'completed'
        });
        await wallet.save();
        res.json({ success: true, wallet });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Manual refund failed', error: err.message });
    }
};
