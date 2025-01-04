const express = require('express');
const jwt = require("jsonwebtoken");
const userController = require('../../controllers/user/userController');
const { checkRole, isActiveUser } = require('../../middlewares/roleMiddleware'); 
const attachUserToLocals = require('../../middlewares/attachUserToLocals');
const passport = require('passport');
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
router.post('/verify-otp', preventCaching, userController.verifyOTP);
router.get('/resend-otp', preventCaching, userController.resendOTP);

router.get('/login', preventCaching, (req, res) => {if (req.user) {
    return res.redirect('/');
  }
  res.render('login', { errorMessage: null });
});

router.post('/login', userController.loginUser);
router.get('/menu', isActiveUser, checkRole(['user']), userController.renderMenuPage);

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

router.post('/order/confirm', cartController.confirmOrder);
router.get('/order/latest', isAuthenticated, cartController.getLatestOrder);
router.get('/order/:Id', cartController.getOrderDetails);
router.put('/:orderId', cartController.updateOrderDetails);

module.exports = router;
