const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const passport = require('passport');
require('dotenv').config();
require('./config/passport');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));

// Initialize Passport
app.use(passport.initialize());

// Add setMessage helper to response object
app.use((req, res, next) => {
    res.setMessage = function(type, message) {
        res.cookie('flash', JSON.stringify({ type, message }), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });
    };
    next();
});

// Get and clear flash message from cookie
app.use((req, res, next) => {
    const flash = req.cookies.flash;
    if (flash) {
        try {
            res.locals.flash = JSON.parse(flash);
        } catch (e) {
            console.error('Error parsing flash message:', e);
        }
        res.clearCookie('flash');
    }
    next();
});


// Import routes
const adminRouter = require('./routes/admin/adminRouter');
const userRouter = require('./routes/user/userRouter');
const cartRouter = require('./routes/user/cartRoutes');
const checkoutRouter = require('./routes/user/checkoutRoutes');
const adminOfferRoutes = require('./routes/admin/offerRoutes');
const adminCategoryRoutes = require('./routes/admin/categoryRoutes');
const adminCouponRoutes = require('./routes/admin/couponRoutes');
const googleOAuthRoutes = require('./routes/auth/googleOAuthRoutes');
const userOrderRoutes = require('./routes/user/orderRoutes');
const adminOrderRoutes = require('./routes/admin/orderRoutes');
const adminProductRoutes = require('./routes/admin/productRoutes');
const userCouponRoutes = require('./routes/user/couponRoutes');
const { auth, adminAuth } = require('./middlewares/authMiddleware');
const paymentRoutes = require('./routes/user/paymentRoutes');
const adminWalletRoutes = require('./routes/admin/walletRoutes');


const adminGroup = express.Router();
adminGroup.use('/offers', adminOfferRoutes);
adminGroup.use('/orders', adminOrderRoutes);
adminGroup.use('/products', adminProductRoutes);
adminGroup.use('/categories', adminCategoryRoutes);
adminGroup.use('/coupons', adminCouponRoutes);
adminGroup.use('/wallet', adminWalletRoutes);

app.use('/admin', adminRouter);  
app.use('/admin', adminGroup);  
app.use('/payment', paymentRoutes);
app.use('/auth/google', googleOAuthRoutes);
app.use('/cart', auth, cartRouter);
app.use('/', userRouter);
app.use('/user/coupons', auth, userCouponRoutes);
app.use('/checkout', auth, checkoutRouter);
app.use('/orders', auth, userOrderRoutes);



app.use((req, res, next) => {
    res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'Page not found',
        error: {
            status: 404,
            stack: process.env.NODE_ENV === 'development' ? 'Page not found' : ''
        },
        user: req.user || null,
        cartCount: 0
    });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);

    // Check if it's an API request
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(err.status || 500).json({
            success: false,
            message: err.message || 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }

    // Render error page
    res.status(err.status || 500).render('error', {
        title: 'Error',
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.user || null,
        cartCount: 0
    });
});



mongoose.connect(process.env.MONGODB_URI)
.then(()=>app.listen(3000,()=>console.log( `server run on http://localhost:3000/`)))
.catch((err)=>console.error(err))