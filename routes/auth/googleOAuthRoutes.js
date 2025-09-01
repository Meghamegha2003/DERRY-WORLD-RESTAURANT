const express = require('express');
const passport = require('passport');
const router = express.Router();

// Google OAuth login route
router.get('/',
  (req, res, next) => {
    console.log('Google OAuth initiated from:', req.get('host'));
    console.log('Callback URL will be:', process.env.GOOGLE_CALLBACK_URL || 'http://derryworld.ddns.net/auth/google/callback');
    next();
  },
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account',
    session: false
  })
);

// Google OAuth callback route
router.get('/callback',
  passport.authenticate('google', { 
    failureRedirect: '/login?error=Authentication+failed',
    session: false
  }),
  (req, res) => {
    try {
      console.log('Google OAuth callback - req.user:', !!req.user);
      console.log('Google OAuth callback - req.user.token:', !!req.user?.token);
      
      if (!req.user || !req.user.token) {
        console.error('No user or token found after Google authentication');
        return res.redirect('/login?error=Authentication+failed');
      }

      console.log('Google OAuth callback - Setting token cookie for user:', req.user.email);
      console.log('Google OAuth callback - Token value:', req.user.token);

      // Set JWT token in cookie
      res.cookie('userToken', req.user.token, {
        httpOnly: true,
        secure: false, // Match regular login settings
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
        sameSite: 'lax' // Match regular login settings
      });

      console.log('Google OAuth callback - Cookie set, redirecting to home');
      // Redirect to home page
      res.redirect('/');
    } catch (error) {
      console.error('Error in Google callback:', error);
      res.redirect('/login?error=Authentication+failed');
    }
  }
);

module.exports = router;