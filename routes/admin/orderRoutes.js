const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/authMiddleware');
const orderController = require('../../controllers/admin/orderController');

router.get('/', adminAuth, orderController.getOrders);

router.get('/:id', adminAuth, orderController.getOrderDetails);

// Route for viewing order item details
router.get('/:orderId/items/:itemId', adminAuth, orderController.getOrderItemDetails);

// Route for updating order item status
router.put('/:orderId/items/:itemId/status', adminAuth, orderController.updateOrderItemStatus);

router.put('/:id/status', adminAuth, orderController.updateOrderStatus);


module.exports = router;