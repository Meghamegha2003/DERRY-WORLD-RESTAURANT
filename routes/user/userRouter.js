const express = require('express');
const passport = require('passport');
const userController = require('../../controllers/user/userController');
const menuController = require('../../controllers/user/menuController');
const productController = require('../../controllers/user/productController');

const wishlistController = require('../../controllers/user/wishlistController');
const walletController = require('../../controllers/user/walletController');
const { auth, optionalAuth, preventAuthPages } = require('../../middlewares/authMiddleware');

const router = express.Router();

// Public routes with optional auth
router.get('/', optionalAuth, userController.renderHomePage);

// Authentication routes (no auth required)
router.get('/login', preventAuthPages, userController.renderLoginPage);
router.post('/login', preventAuthPages, userController.loginUser);
router.get('/register', preventAuthPages, userController.renderRegisterPage);
router.post('/register', preventAuthPages, userController.registerUser);
router.get('/verify-otp', preventAuthPages, userController.renderVerifyOtpPage);
router.post('/verify-otp', preventAuthPages, userController.verifyOTP);
router.post('/resend-otp', preventAuthPages, userController.resendOTP);
router.get('/forgot-password', preventAuthPages, userController.renderForgotPassword);
router.post('/forgot-password', preventAuthPages, userController.handleForgotPassword);
router.get('/reset-password/:token', preventAuthPages, userController.renderResetPassword);
router.post('/reset-password/:token', preventAuthPages, userController.handleResetPassword);
router.post('/verify-referral', preventAuthPages, userController.verifyReferralCode);

// Google OAuth routes
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), userController.googleCallback);

// Protected routes (auth required)
router.use(auth); // Apply auth middleware to all routes below this

// Menu routes (now protected)
router.get('/menu', menuController.renderMenuPage);
// Products route (alias to menu)
router.get('/products', menuController.renderMenuPage);
router.get('/menu/category/:categoryId', menuController.renderCategoryMenu);
router.get('/menu/search', menuController.searchProducts);
router.get('/menu/filter', menuController.filterProducts);

// Contact routes (now protected)
router.get('/contact', userController.renderContactPage);
router.post('/contact', userController.handleContactForm);

// Food details route (now protected)
router.get('/food/:id', productController.getProductDetails);

// API for food status (for polling, AJAX auto-update)
router.get('/api/food/:id/status', optionalAuth, productController.getFoodStatus);

// About route (now protected)
router.get('/about', userController.renderAboutPage);

// Address routes (protected)
router.get('/addresses', userController.getAddresses);
router.post('/addresses', userController.addAddress);
router.patch('/addresses/:id', userController.updateAddress);
router.delete('/addresses/:id', userController.deleteAddress);

// Logout routes
router.get('/logout', userController.logoutUser);
router.post('/logout', userController.logoutUser);

// Profile routes
router.get('/profile', userController.renderProfilePage);
router.post('/profile', userController.updateUserProfile);
router.post('/change-password', userController.changePassword);

// Address routes
router.get('/addresses', userController.getAddresses);
router.post('/addresses', userController.addAddress);
router.patch('/addresses/:id', userController.updateAddress);
router.delete('/addresses/:id', userController.deleteAddress);

// Cart routes
router.get('/cart', userController.renderCartPage);
router.post('/cart/add', userController.addToCart);
router.put('/cart/:id', userController.updateCartItem);
router.delete('/cart/:id', userController.removeFromCart);

// Wishlist routes
router.get('/wishlist', wishlistController.renderWishlist);
router.post('/wishlist/toggle/:productId', wishlistController.toggleWishlist);
router.delete('/wishlist/remove/:productId', wishlistController.removeFromWishlist);

// Wallet routes
router.get('/wallet', walletController.getWallet);
router.post('/wallet/add-money', walletController.initializeAddMoney);
router.post('/wallet/verify-payment', walletController.verifyAndAddMoney);

module.exports = router;