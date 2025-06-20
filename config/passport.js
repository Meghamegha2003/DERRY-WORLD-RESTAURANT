const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback",
    passReqToCallback: true,
    proxy: true
  },
  async function(req, accessToken, refreshToken, profile, done) {
    try {
      // Check if user already exists
      let user = await User.findOne({ email: profile.emails[0].value });
      
      if (user) {
        // If user exists but was created with regular signup
        if (!user.googleId) {
          user.googleId = profile.id;
          await user.save();
        }

        // Check if user is active
        if (!user.isActive) {
          return done(null, false, { message: 'Account is blocked' });
        }
      } else {
        // Create new user if doesn't exist
        user = await User.create({
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          isVerified: true, // Google accounts are already verified
          password: Math.random().toString(36).slice(-8), // Random password for Google users
          phone: null, // Explicitly set phone as null for OAuth users
          roles: ['user'], // Set default role
          isActive: true
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user._id,
          isAdmin: user.roles?.includes('admin')
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Attach token to user object
      user.token = token;

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));

module.exports = passport;