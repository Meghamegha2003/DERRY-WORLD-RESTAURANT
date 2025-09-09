const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');


passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
    passReqToCallback: true,
    proxy: true
  },
  async function(req, accessToken, refreshToken, profile, done) {
    try {
      let user = await User.findOne({ email: profile.emails[0].value });
      
      if (user) {
        if (!user.googleId) {
          user.googleId = profile.id;
          await user.save();
        }

        if (!user.isActive) {
          return done(null, false, { message: 'Account is blocked' });
        }
      } else {
        user = await User.create({
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          isVerified: true, 
          password: Math.random().toString(36).slice(-8), 
          phone: null, 
          roles: ['user'], 
          isActive: true
        });
      }

      const token = jwt.sign(
        { 
          userId: user._id,
          isAdmin: user.roles?.includes('admin'),
          sessionVersion: user.sessionVersion || 1
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      user.token = token;

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));

module.exports = passport;