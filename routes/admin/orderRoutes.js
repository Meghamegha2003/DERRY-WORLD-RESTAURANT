const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/authMiddleware');
const orderController = require('../../controllers/admin/orderController');

router.get('/', adminAuth, orderController.getOrders);
router.get('/:id', adminAuth, orderController.getOrderDetails);
router.put('/:id/status', adminAuth, orderController.updateOrderStatus);
router.post('/:orderId/items/:itemId/:action(approve|reject)', adminAuth, orderController.handleReturnAction);

module.exports = router;