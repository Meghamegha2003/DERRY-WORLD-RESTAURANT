const express = require('express');
const router = express.Router();
const salesReportController = require('../../controllers/admin/salesReportController');
const { adminAuth } = require('../../middlewares/authMiddleware');

// Sales report routes
router.get('/sales-report', adminAuth, salesReportController.getSalesReport);
router.get('/sales-report/export', adminAuth, salesReportController.exportSalesReport);

module.exports = router;
