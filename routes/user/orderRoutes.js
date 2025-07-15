const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/user/orderController');
const { auth } = require('../../middlewares/authMiddleware');

// Apply auth middleware to all routes
router.use(auth);

// Get all orders
router.get('/', orderController.getUserOrders);

// Get order details
router.get('/:orderId', orderController.getOrderDetails);

// Cancel entire order
router.post('/:orderId/cancel', orderController.cancelOrder);

// Cancel individual item
router.post('/:orderId/items/:itemId/cancel', orderController.cancelOrderItem);

// Return individual item
router.post('/:orderId/items/:itemId/return', orderController.requestItemReturn);

// Request return for item
router.post('/:orderId/return', orderController.requestReturn);

// Rating
router.post('/submit-rating', orderController.submitRating);

module.exports = router;