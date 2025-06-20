const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/authMiddleware');
const orderController = require('../../controllers/admin/orderController');

// Get all orders
router.get('/', adminAuth, orderController.getOrders);

// Get single order details
router.get('/:id', adminAuth, orderController.getOrderDetails);

// Update order status
router.put('/:id/status', adminAuth, orderController.updateOrderStatus);

// Handle return requests
router.post('/:orderId/items/:itemId/return/approve', adminAuth, orderController.handleReturnAction);
router.post('/:orderId/items/:itemId/return/reject', adminAuth, orderController.handleReturnAction);

module.exports = router;