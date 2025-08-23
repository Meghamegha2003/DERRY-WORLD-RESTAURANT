const express = require('express');
const router = express.Router();
const paymentController = require('../../controllers/user/paymentController');
const orderController = require('../../controllers/user/orderController');
const { auth } = require('../../middlewares/authMiddleware');
const { cacheControl } = require('../../middlewares/cacheControl');

router.post('/razorpay/create', auth, paymentController.createRazorpayOrder);
// Cache control is applied to prevent back button to payment success page
router.post('/verify', auth, cacheControl, paymentController.verifyPayment);
router.post('/failure', auth, paymentController.handlePaymentFailure);
router.post('/wallet',  auth,paymentController.processWalletPayment);
router.post("/payment/failure-log", paymentController.logPaymentFailure);
router.get("/retry-payment/:orderId",  orderController.showRetryPaymentPage);

module.exports = router;
