const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
require('dotenv').config();

require('./config/passport');

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
const paymentRoutes = require('./routes/user/paymentRoutes');
const adminWalletRoutes = require('./routes/admin/walletRoutes');
const uploadRoutes = require('./routes/user/uploadRoutes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandlers');
const { auth, adminAuth, checkUserBlocked } = require('./middlewares/authMiddleware');
const { cacheControl, preventBackAfterLogin, preventCache } = require('./middlewares/cacheControl');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(cacheControl);
app.use(preventBackAfterLogin);

// Check if user is blocked
app.use((req, res, next) => {
    if (req.path.startsWith('/admin') || 
        req.path.startsWith('/login') || 
        req.path.startsWith('/register') || 
        req.path.startsWith('/public') || 
        req.path.startsWith('/uploads') ||
        req.path.startsWith('/auth/google')) {
        return next();
    }
    checkUserBlocked(req, res, next);
});

// Set authentication info to locals
app.use((req, res, next) => {
    res.locals.authenticated = Boolean(req.cookies.userToken);
    next();
});

// Fetch user and cart info
app.use(async (req, res, next) => {
    try {
        const jwt = require('jsonwebtoken');
        const User = require('./models/userSchema');
        const Cart = require('./models/cartSchema');

        const token = req.cookies.userToken;
        if (!token) {
            res.locals.user = null;
            res.locals.cartCount = 0;
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');

        if (user && user.isActive) {
            res.locals.user = user;
            const cart = await Cart.findOne({ user: user._id });
            res.locals.cartCount = cart?.items ? new Set(cart.items.map(i => i.product?.toString())).size : 0;
        } else {
            res.locals.user = null;
            res.locals.cartCount = 0;
        }

        next();
    } catch (error) {
        res.locals.user = null;
        res.locals.cartCount = 0;
        next();
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Admin routes
const adminGroup = express.Router();
adminGroup.use('/offers', adminOfferRoutes);
adminGroup.use('/orders', adminOrderRoutes);
adminGroup.use('/products', adminProductRoutes);
adminGroup.use('/categories', adminCategoryRoutes);
adminGroup.use('/coupons', adminCouponRoutes);
adminGroup.use('/wallet', adminWalletRoutes);

app.use('/admin', preventCache, adminRouter);
app.use('/admin', preventCache, adminGroup);  

// User routes
app.use('/payment', paymentRoutes);
app.use('/auth/google', googleOAuthRoutes);
app.use('/cart', preventCache, auth, cartRouter);
app.use('/', preventCache, userRouter);
app.use('/user/coupons', auth, userCouponRoutes);
app.use('/checkout', auth, checkoutRouter);
app.use('/orders', auth, userOrderRoutes);
app.use('/upload', uploadRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// ----------------- MONGODB CONNECTION -----------------
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI)
.then(() => {
    console.log('MongoDB connected successfully');
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}/`));
})
.catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
});

module.exports = app;
