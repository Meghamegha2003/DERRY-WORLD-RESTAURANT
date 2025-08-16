const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/user/orderController');
const { auth } = require('../../middlewares/authMiddleware');

router.use(auth);

router.get('/', orderController.getUserOrders);
router.get('/:orderId/view', orderController.viewOrder);
router.get('/:orderId/items/:itemId?', orderController.getOrderDetails);
router.post('/submit-rating', orderController.submitRating);




module.exports = router;