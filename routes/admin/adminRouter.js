const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/admin/adminController');
const { adminAuth, preventAuthPages } = require('../../middlewares/authMiddleware');

// Prevent caching for admin routes
router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});



router.get('/login', preventAuthPages, adminController.loginPage);
router.post('/login', preventAuthPages, adminController.loginAdmin);
router.get('/logout', adminAuth, adminController.logoutAdmin);
router.post('/logout', adminAuth, adminController.logoutAdmin);

// Protected admin routes
router.get('/', adminAuth, adminController.loadDashboard);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/dashboard-data', adminAuth, adminController.getDashboardData);
// router.get('/search', adminAuth, adminController.generalSearch);


// Customer Routes
router.get('/customers', adminAuth, adminController.customerList);
router.get('/customers/:id', adminAuth, adminController.getCustomerDetails);
router.post('/customers/:id/block', adminAuth, adminController.blockCustomer);
router.post('/customers/:id/unblock', adminAuth, adminController.unblockCustomer);
router.post('/customers/:id/status', adminAuth, adminController.updateCustomerStatus);

// Export Routes
router.get('/export/customers', adminAuth, adminController.exportCustomerData);
router.get('/export/sales/pdf', adminAuth, adminController.exportSalesReportPDF);
router.get('/export/sales/excel', adminAuth, adminController.exportSalesReportExcel);

// Report Routes
router.get('/reports/sales', adminAuth, adminController.getSalesReport);
router.get('/sales-report', adminAuth, adminController.getSalesReport);

router.get('/sales-report/export-pdf', adminAuth, adminController.exportSalesReportPDF);

module.exports = router;