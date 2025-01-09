const express = require('express');
const jwt = require("jsonwebtoken");
const userController = require('../../controllers/user/userController');
const { checkRole, isActiveUser } = require('../../middlewares/roleMiddleware'); 
const attachUserToLocals = require('../../middlewares/attachUserToLocals');
const passport = require('passport');
require('../../config/passport-google');
const isAuthenticated = require('../../middlewares/userAuthMiddleware');
const  cartController=require('../../controllers/user/cartController')

const router = express.Router();
router.use(attachUserToLocals);

const preventCaching = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

router.get('/', preventCaching, userController.renderLandingPage);
router.get('/register', preventCaching, userController.renderRegisterPage);
router.post('/register', preventCaching, userController.registerUser);
router.get('/verify-otp', preventCaching, userController.renderVerifyOtp);
router.post('/verify-otp', preventCaching, userController.verifyOTP);
router.post('/resend-otp', preventCaching, userController.resendOTP);

router.get('/login', preventCaching, (req, res) => {if (req.user) {
    return res.redirect('/');
  }
  res.render('login', { errorMessage: null });
});

router.post('/login', userController.loginUser);
router.get('/menu', isActiveUser, checkRole(['user']), userController.renderMenuPage);

// Forgot Password Routes
router.get('/forgot-password', preventCaching, userController.renderForgotPassword);
router.post('/forgot-password', preventCaching, userController.handleForgotPassword);
router.get('/reset-password/:token', preventCaching, userController.renderResetPassword);
router.post('/reset-password/:token', preventCaching, userController.handleResetPassword);

router.post('/logout', preventCaching, userController.logout);
router.get('/logout', preventCaching, userController.logout); 


router.get('/food/:productId', isAuthenticated, cartController.renderProductDetails);
router.post('/food/:id/rate', isAuthenticated,  cartController.submitRating);
router.post('/add', isAuthenticated, cartController.addToCart);
router.get('/cart', isAuthenticated, cartController.getCart);
router.post('/cart/update', isAuthenticated, cartController.updateCart);
router.post('/cart/remove', isAuthenticated, cartController.removeFromCart);
router.get('/profile', isAuthenticated, cartController.getProfile);
router.post('/cart/address/add',  isAuthenticated, cartController.addAddress);
router.post('/cart/address/update/:id',  isAuthenticated, cartController.updateAddress);
router.delete('/cart/address/delete/:id', isAuthenticated, cartController.deleteAddress);
router.get('/checkout',  isAuthenticated, cartController.renderCheckoutPage);

// Google Authentication routes
router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    const { token } = req.user;
    // Set JWT token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    res.redirect('/');
  }
);

router.post('/order/confirm', cartController.confirmOrder);
router.get('/order/latest', isAuthenticated, cartController.getLatestOrder);
router.get('/order/:Id', cartController.getOrderDetails);
router.put('/:orderId', cartController.updateOrderDetails);

module.exports = router;
