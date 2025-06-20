// Add this route to your existing auth routes
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const { googleCallback } = require('../controllers/user/userController');

// Initialize passport with JWT (no sessions)
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
    scope: ['profile', 'email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Pass the profile data to the callback
      return done(null, {
        id: profile.id,
        email: profile.emails[0].value,
        displayName: profile.displayName,
        picture: profile.photos[0].value
      });
    } catch (error) {
      return done(error, null);
    }
  }
));

// No need for serializeUser/deserializeUser as we're not using sessions

// Check authentication status
router.get('/check-auth', (req, res) => {
    const token = req.cookies.token;
    
    if (!token) {
        return res.status(401).json({ authenticated: false });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.status(200).json({ 
            authenticated: true,
            user: {
                id: decoded.userId,
                roles: decoded.roles
            }
        });
    } catch (error) {
        // Clear invalid token
        res.clearCookie('token');
        
        res.status(401).json({ 
            authenticated: false,
            error: 'Invalid or expired token'
        });
    }
});

// Google OAuth routes
router.get('/google', passport.authenticate('google', { 
    session: false, // Disable session
    scope: ['profile', 'email'] 
}));

router.get('/google/callback', 
    passport.authenticate('google', { 
        session: false, // Disable session
        failureRedirect: '/login'
    }),
    googleCallback
);

module.exports = router;