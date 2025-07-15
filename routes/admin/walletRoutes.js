const express = require('express');
const router = express.Router();
const walletController = require('../../controllers/admin/walletController');

router.post('/manual-refund/:userId', walletController.manualRefund);

module.exports = router;
