const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: 'http://localhost:3000/auth/google/callback',
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // First, check if user exists with this Google ID
                let user = await User.findOne({ googleId: profile.id });

                if (user) {
                    // User already exists with this Google account
                    const token = generateToken(user);
                    user.token = token;
                    await user.save();
                    return done(null, { ...user.toObject(), token });
                }

                // Check if email already exists
                const existingUser = await User.findOne({ email: profile.emails[0].value });
                if (existingUser) {
                    // Email already registered through regular signup
                    return done(null, false, { 
                        message: 'Email already registered. Please use regular login.' 
                    });
                }

                // Create new user if email not registered
                user = new User({
                    googleId: profile.id,
                    email: profile.emails[0].value,
                    name: profile.displayName,
                    picture: profile.photos[0].value,
                    isGoogleUser: true,
                    isVerified: true, // Google users are automatically verified
                    role: 'user'
                });

                await user.save();

                const token = generateToken(user);
                user.token = token;
                await user.save();

                return done(null, { ...user.toObject(), token });
            } catch (error) {
                return done(error, null);
            }
        }
    )
);

// Helper function to generate JWT token
function generateToken(user) {
    return jwt.sign(
        {
            userId: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            isGoogleUser: user.isGoogleUser
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}

module.exports = passport;
