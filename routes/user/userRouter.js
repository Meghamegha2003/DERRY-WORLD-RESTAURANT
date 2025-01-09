const express = require('express');
const jwt = require("jsonwebtoken");
const userController = require('../../controllers/user/userController');
const cartController = require('../../controllers/user/cartController');
const { checkRole, isActiveUser } = require('../../middlewares/roleMiddleware'); 
const attachUserToLocals = require('../../middlewares/attachUserToLocals');
const passport = require('passport');
const isAuthenticated = require('../../middlewares/userAuthMiddleware');

const router = express.Router();
router.use(attachUserToLocals);

const preventCaching = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// Authentication routes
router.get('/', preventCaching, userController.renderLandingPage);
router.get('/register', preventCaching, userController.renderRegisterPage);
router.post('/register', preventCaching, userController.registerUser);
router.post('/verify-otp', preventCaching, userController.verifyOTP);
router.get('/resend-otp', preventCaching, userController.resendOTP);
router.get('/login', preventCaching, (req, res) => {
  if (req.user) {
    return res.redirect('/');
  }
  res.render('login', { errorMessage: null });
});
router.post('/login', userController.loginUser);
router.post('/logout', preventCaching, userController.logout);
router.get('/logout', preventCaching, userController.logout);

// Menu routes
router.get('/menu', preventCaching, userController.renderMenuPage);
router.post('/menu/add-to-cart', isAuthenticated, userController.addToCart);

// Product and cart routes
router.get('/food/:productId', isAuthenticated, cartController.renderProductDetails);
router.post('/food/:id/rate', isAuthenticated, cartController.submitRating);
router.get('/cart', isAuthenticated, cartController.getCart);
router.post('/cart/update', isAuthenticated, cartController.updateCart);
router.post('/cart/remove', isAuthenticated, cartController.removeFromCart);
router.get('/profile', isAuthenticated, cartController.getProfile);

// Address routes
router.post('/cart/address/add', isAuthenticated, cartController.addAddress);
router.post('/cart/address/update/:id', isAuthenticated, cartController.updateAddress);
router.delete('/cart/address/delete/:id', isAuthenticated, cartController.deleteAddress);

// Checkout and order routes
router.get('/checkout', isAuthenticated, cartController.renderCheckoutPage);
router.post('/order/confirm', cartController.confirmOrder);
router.get('/order/latest', isAuthenticated, cartController.getLatestOrder);
router.get('/order/:Id', cartController.getOrderDetails);
router.put('/:orderId', cartController.updateOrderDetails);

module.exports = router;
