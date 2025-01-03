const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const userRouter = require('./routes/userRouter');
const attachUserToLocals = require('./middlewares/attachUserToLocals');
const errorHandler = require('./middlewares/errorHandler');
const cookieParser = require('cookie-parser');
const adminRouter = require('./routes/adminRouter');
const passport = require('./config/passport');  
const session = require('express-session');
const jwt = require('jsonwebtoken');
const upload = require('./config/multerConfig');


dotenv.config();

const app = express();

connectDB();

// Configure session
app.use(session({
  secret: process.env.SESSION_SECRET, 
  resave: false,                     
  saveUninitialized: false,          
  cookie: {
    httpOnly: true,                 
    secure: process.env.NODE_ENV === 'production', 
    maxAge: 24 * 60 * 60 * 1000,    
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());  

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/food', userRouter);

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Views setup
app.set('views', [
  path.join(__dirname, 'views/user'),
  path.join(__dirname, 'views/admin'),
]);
app.set('view engine', 'ejs');

// Prevent Caching
const preventCaching = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// Google authentication routes
app.get('/auth/google', 
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account' 
    })
);

app.get('/auth/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/login',
        failureMessage: true,
        session: false 
    }),
    (req, res) => {
        try {
            if (!req.user) {
                return res.redirect('/login?error=Google authentication failed');
            }

            // Set JWT token in cookie
            res.cookie('token', req.user.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000 
            });

            // Redirect to home page
            res.redirect('/');
        } catch (error) {
            console.error('Error in Google callback:', error);
            res.redirect('/login?error=Authentication error');
        }
    }
);

// Logout route
app.get('/logout', (req, res) => {
    try {
        
        res.clearCookie('token');
        
        
        res.clearCookie('connect.sid');
        
        
        if (req.session) {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Error destroying session:', err);
                }
            });
        }

        // Logout from passport
        if (req.logout) {
            req.logout((err) => {
                if (err) {
                    console.error('Error logging out from passport:', err);
                }
            });
        }

        // Redirect to login page
        res.redirect('/login');
    } catch (error) {
        console.error('Error during logout:', error);
        res.redirect('/login');
    }
});

// Define routes
app.use(preventCaching);
app.use(attachUserToLocals);

// Routes
app.use('/', userRouter);
app.use('/admin', adminRouter);


// Handle errors
app.use(errorHandler);
app.post('/admin/products/add', (req, res, next) => {
  console.log('Received request for /admin/products/add');
  next(); 
}, upload.array('productImage[]', 4), (req, res) => {
  console.log('Multer middleware reached');
  res.send('Files uploaded');
});


const PORT = process.env.PORT;

if (process.env.NODE_ENV !== 'test') {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
}

app.listen(PORT, () => {
  console.log(`App is running on port ${PORT}`);
});

module.exports = app;
