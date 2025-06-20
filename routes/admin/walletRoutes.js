const express = require('express');
const router = express.Router();
const walletController = require('../../controllers/admin/walletController');

// Admin manual refund to wallet
router.post('/manual-refund/:userId', walletController.manualRefund);

module.exports = router;
