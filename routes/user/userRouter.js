const express = require('express');
const passport = require('passport');
const userController = require('../../controllers/user/userController');
const menuController = require('../../controllers/user/menuController');
const productController = require('../../controllers/user/productController');
const wishlistController = require('../../controllers/user/wishlistController');
const walletController = require('../../controllers/user/walletController');
const { auth, optionalAuth } = require('../../middlewares/authMiddleware');

const router = express.Router();

// <====Login Routes====>
router.get('/', optionalAuth, userController.renderHomePage);
router.get('/login', userController.renderLoginPage);
router.post('/login', userController.processLoginRequest, userController.loginUser);

// <====Register Routes====>
router.get('/register', userController.renderRegisterPage);
router.post('/register', userController.registerUser);
router.get('/verify-otp', userController.renderVerifyOtpPage);
router.post('/verify-otp', userController.verifyOTP);
router.post('/resend-otp', userController.resendOTP);

// <====Forgot Password Routes====>
router.get('/forgot-password', userController.renderForgotPassword);
router.post('/forgot-password', userController.handleForgotPassword);

// <====Reset Password Routes====>
router.get('/reset-password/:token', userController.renderResetPassword);
router.post('/reset-password/:token', userController.handleResetPassword);
router.post('/verify-referral', userController.verifyReferralCode);

// <====Google Auth Routes====>
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), userController.googleCallback);


// <====Menu Page Routes====>
router.get('/menu', auth, menuController.renderMenuPage);
router.get('/products', auth, menuController.renderMenuPage);
router.get('/menu/category/:categoryId', auth, menuController.renderCategoryMenu);
router.get('/menu/search', auth, menuController.searchProducts);
router.get('/menu/filter', auth, menuController.filterProducts);

// <====contact Routes====>
router.get('/contact', auth, userController.renderContactPage);
router.post('/contact', auth, userController.handleContactForm);

// <====Food Details Page Routes====>
router.get('/food/:id', auth, productController.getProductDetails);
router.get('/api/food/:id/status', auth, productController.getFoodStatus);
router.get('/about', auth, userController.renderAboutPage);

// <====Address Routes====>
router.get('/addresses', auth, userController.getAddresses);
router.post('/addresses', auth, userController.addAddress);
router.patch('/addresses/:id', auth, userController.updateAddress);
router.delete('/addresses/:id', auth, userController.deleteAddress);

// <====Logout Routes====>
router.get('/logout', auth, userController.logoutUser);

// <====Profile Routes====>
router.get('/profile', auth, userController.renderProfilePage);
router.post('/profile', auth, userController.updateUserProfile);
router.post('/change-password', auth, userController.changePassword);

// <====Cart Routes====>
router.get('/cart', auth, userController.renderCartPage);
router.post('/cart/add', auth, userController.addToCart);
router.put('/cart/:id', auth, userController.updateCartItem);
router.delete('/cart/:id', auth, userController.removeFromCart);

// <====WishList Routes====>
router.get('/wishlist', auth, wishlistController.renderWishlist);
router.post('/wishlist/toggle/:productId', auth, wishlistController.toggleWishlist);
router.delete('/wishlist/remove/:productId', auth, wishlistController.removeFromWishlist);

// <====Wallet Routes====>
router.get('/wallet', auth, walletController.getWallet);
router.post('/wallet/add-money', auth, walletController.initializeAddMoney);
router.post('/wallet/verify-payment', auth, walletController.verifyAndAddMoney);

module.exports = router;