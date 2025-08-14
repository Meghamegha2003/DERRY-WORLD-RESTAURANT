const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/admin/adminController');
const { adminAuth, preventAuthPages } = require('../../middlewares/authMiddleware');

// Auth routes
router.get('/login', preventAuthPages, adminController.loginPage);
router.post('/login', preventAuthPages, adminController.loginAdmin);
router.post('/logout', adminAuth, adminController.adminLogout);

// Dashboard routes
router.get('/', adminAuth, adminController.loadDashboard);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/dashboard-data', adminAuth, adminController.getDashboardData);

// Customer routes
router.get('/customers', adminAuth, adminController.customerList);
router.post('/customers/:id/toggle-status', adminAuth, adminController.toggleCustomerStatus);

// Sales report routes
router.use(require('./salesReportRoutes'));

module.exports = router;