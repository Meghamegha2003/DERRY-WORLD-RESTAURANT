const express = require('express');
const passport = require('passport');
const router = express.Router();

// Google OAuth login route
router.get('/',
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
      if (!req.user || !req.user.token) {
        console.error('No user or token found after Google authentication');
        return res.redirect('/login?error=Authentication+failed');
      }

      // Set JWT token in cookie
      res.cookie('userToken', req.user.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Redirect to home page
      res.redirect('/');
    } catch (error) {
      console.error('Error in Google callback:', error);
      res.redirect('/login?error=Authentication+failed');
    }
  }
);

module.exports = router;