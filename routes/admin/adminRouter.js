const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/admin/adminController');
const salesReportController = require('../../controllers/admin/salesReportController');
const { adminAuth, preventAuthPages } = require('../../middlewares/authMiddleware');


router.get('/login', preventAuthPages, adminController.loginPage);
router.post('/login', preventAuthPages, adminController.loginAdmin);
router.post('/logout', adminAuth, adminController.adminLogout);

router.get('/', adminAuth, adminController.loadDashboard);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/dashboard-data', adminAuth, adminController.getDashboardData);

router.get('/customers', adminAuth, adminController.customerList);
router.post('/customers/:id/toggle-status', adminAuth, adminController.toggleCustomerStatus);


router.get('/sales-report', adminAuth, salesReportController.viewSalesReport);

router.get('/sales-report/export-pdf', adminAuth, salesReportController.exportSalesReportPDF);
router.get('/sales-report/export-excel', adminAuth, salesReportController.exportSalesReportExcel);


module.exports = router;