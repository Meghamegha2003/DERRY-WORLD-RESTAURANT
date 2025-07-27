const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/authMiddleware');
const orderController = require('../../controllers/admin/orderController');

router.get('/', adminAuth, orderController.getOrders);
router.get('/:id', adminAuth, orderController.getOrderDetails);
router.put('/:id/status', adminAuth, orderController.updateOrderStatus);
router.post('/:orderId/items/:itemId/return/approve', adminAuth, orderController.handleReturnAction);
router.post('/:orderId/items/:itemId/return/reject', adminAuth, orderController.handleReturnAction);
router.post('/:orderId/return/:itemId', adminAuth, orderController.handleReturnAction);

module.exports = router;