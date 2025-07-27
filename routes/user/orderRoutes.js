const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/user/orderController');
const { auth } = require('../../middlewares/authMiddleware');

router.use(auth);

router.get('/', orderController.getUserOrders);
router.get('/:orderId', orderController.getOrderDetails);
router.post('/:orderId/cancel', orderController.cancelOrder);
router.post('/:orderId/items/:itemId/cancel', orderController.cancelOrderItem);
router.post('/:orderId/items/:itemId/return', orderController.requestItemReturn);
router.post('/:orderId/return', orderController.requestReturn);
router.post('/submit-rating', orderController.submitRating);

router.get('/retry-payment/:orderId', auth , orderController.showRetryPaymentPage);
router.post('/retry-payment-initiate/:orderId', auth , orderController.initiateRetryPayment);
router.get('/:orderId/invoice', auth, orderController.downloadInvoice);



module.exports = router;