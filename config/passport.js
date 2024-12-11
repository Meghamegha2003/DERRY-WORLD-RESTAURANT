const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:3000/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          user = await User.findOne({ email: profile.emails[0].value });

          if (!user) {
            user = new User({
              googleId: profile.id,
              email: profile.emails[0].value,
              name: profile.displayName,
              picture: profile.photos[0].value,
              isGoogleUser: true,
            });
            await user.save();
          } else {
            user.googleId = profile.id;
            user.isGoogleUser = true;
            await user.save();
          }
        }

        const token = jwt.sign(
          {
            id: user._id,
            email: user.email,
            name: user.name,
            isGoogleUser: user.isGoogleUser,
          },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );

        user.token = token;
        await user.save();

        return done(null, { ...user.toObject(), token });
      } catch (error) {
        console.error('Error in Google strategy:', error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

module.exports = passport;
