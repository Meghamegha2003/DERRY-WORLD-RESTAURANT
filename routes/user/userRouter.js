const express = require('express');
const passport = require('passport');
const userController = require('../../controllers/user/userController');
const menuController = require('../../controllers/user/menuController');
const productController = require('../../controllers/user/productController');
const wishlistController = require('../../controllers/user/wishlistController');
const walletController = require('../../controllers/user/walletController');
const cartController = require('../../controllers/user/cartController');
const { auth, optionalAuth, preventAuthPages } = require('../../middlewares/authMiddleware');
const { cacheControl, preventBackAfterLogin } = require('../../middlewares/cacheControl');

const router = express.Router();

// Apply cache control to all auth-related routes
const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-otp'];

// <====Login Routes====>
router.get('/', optionalAuth, userController.renderHomePage);
router.get('/login', cacheControl, preventBackAfterLogin, userController.renderLoginPage);
router.post('/login', cacheControl, userController.loginUser);

// <====Register Routes====>
router.get('/register', cacheControl, preventBackAfterLogin, userController.renderRegisterPage);
router.post('/register', cacheControl, userController.registerUser);
router.get('/verify-otp', userController.renderVerifyOtpPage);
router.post('/verify-otp', userController.verifyOTP);
router.post('/resend-otp', userController.resendOTP);

// <====Forgot Password Routes====>
router.get('/forgot-password', cacheControl, preventBackAfterLogin, userController.renderForgotPassword);
router.post('/forgot-password', cacheControl, userController.handleForgotPassword);

// <====Reset Password Routes====>
router.get('/reset-password/:token', cacheControl, preventBackAfterLogin, userController.renderResetPassword);
router.post('/reset-password/:token', cacheControl, userController.handleResetPassword);
router.post('/verify-referral', cacheControl, userController.verifyReferralCode);

// <====Google Auth Routes====>
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), userController.googleCallback);

// <====Menu Page Routes====>
router.get('/menu', auth, menuController.renderMenuPage);
router.post('/menu', auth, menuController.renderMenuPage); // Support POST for filtering
router.get('/products', auth, menuController.renderMenuPage);
router.get('/menu/category/:categoryId', auth, menuController.renderCategoryMenu);
router.get('/menu/search', auth, menuController.searchProducts);
router.get('/menu/filter', auth, menuController.filterProducts);
router.post('/menu/filter', auth, menuController.filterMenuPage); // POST method for filtering

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


// <====Profile Routes====>
router.get('/profile', auth, userController.renderProfilePage);
router.post('/profile', auth, userController.updateUserProfile);
router.post('/change-password', auth, userController.changePassword);

// <====Cart Routes====>
router.get('/cart', auth, cartController.getCartPage);
router.post('/cart/add', auth, cartController.addToCart);
router.put('/cart/:id', auth, cartController.updateCart);
router.delete('/cart/:id', auth, cartController.removeFromCart);

// <====WishList Routes====>
router.get('/wishlist', auth, wishlistController.renderWishlist);
router.post('/wishlist/toggle/:productId', auth, wishlistController.toggleWishlist);
router.delete('/wishlist/remove/:productId', auth, wishlistController.removeFromWishlist);

// <====Wallet Routes====>
router.get('/wallet', auth, walletController.getWallet);
router.post('/wallet/add-money', auth, walletController.initializeAddMoney);
router.post('/wallet/verify-payment', auth, walletController.verifyAndAddMoney);

// <====Logout Routes====>
router.get('/logout', auth, userController.logoutUser);


module.exports = router;