const express = require('express');
const userController = require('../controllers/user/userController');
const { checkRole, isActiveUser } = require('../middlewares/roleMiddleware'); 
const attachUserToLocals = require('../middlewares/attachUserToLocals');
const User = require('../models/userSchema');
const passport = require('passport');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


const router = express.Router();
router.use(attachUserToLocals);

const preventCaching = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// Public routes
router.get('/', preventCaching, userController.renderLandingPage);
router.get('/register', preventCaching, userController.renderRegisterPage);
router.post('/register', preventCaching, userController.registerUser);
router.post('/verify-otp', preventCaching, userController.verifyOtp);
router.get('/login', preventCaching, (req, res) => {
  if (req.user) {
    return res.redirect('/');
  }
  res.render('login', { errorMessage: null });
});
router.post('/login', userController.loginUser);

// Password reset routes
router.get('/password-reset', preventCaching, (req, res) => {
  res.render('user/password-reset', { message: req.query.message || '', successMessage: req.query.successMessage || '' });
});
router.post('/request-password-reset', userController.requestPasswordReset);
router.get('/verify-reset-otp', preventCaching, (req, res) => {
  res.render('user/verify-reset-otp', { message: req.query.message || '', successMessage: req.query.successMessage || '' });
});
router.post('/verify-password-reset-otp', userController.verifyPasswordResetOtp);
router.get('/reset-password', preventCaching, (req, res) => {
  res.render('user/reset-password', { message: req.query.message || '', successMessage: req.query.successMessage || '' });
});
router.post('/reset-password', userController.resetPassword);

// Protected user routes
router.get('/home', preventCaching, isActiveUser, checkRole(['user']), (req, res) => {
  res.render('user/home', { user: req.user });
});
router.get('/menu', isActiveUser, checkRole(['user']), userController.renderMenuPage);
router.get('/products', isActiveUser, checkRole(['user']), userController.filterProductsByType);

// Google OAuth routes
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login', session: false }), 
  (req, res) => {
    const token = jwt.sign(
      {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        isGoogleUser: req.user.isGoogleUser,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Attach token to cookie or return as response
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/'); // Redirect to home or any other page
  }
);


router.post('/logout',preventCaching, userController.logout)

module.exports = router;
