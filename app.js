const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const passport = require('passport');
require('dotenv').config();
require('./config/passport');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const activeUsers = new Map();

io.on('connection', (socket) => {

    socket.on('storeUserId', (userId) => {
        if (userId) {
           
            for (const [existingUserId, existingSocketId] of activeUsers.entries()) {
                if (existingUserId === userId && existingSocketId !== socket.id) {
                   
                    activeUsers.delete(existingUserId);
                }
            }
            activeUsers.set(userId, socket.id);
            socket.emit('socketStored', { userId, socketId: socket.id });
        }
    });

    socket.on('disconnect', () => {
        for (const [userId, socketId] of activeUsers.entries()) {
            if (socketId === socket.id) {
                activeUsers.delete(userId);
                break;
            }
        }
    });
});

app.set('io', io);
app.set('activeUsers', activeUsers);

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

// Create admin router group
const adminWalletRoutes = require('./routes/admin/walletRoutes');
const adminGroup = express.Router();
adminGroup.use('/offers', adminOfferRoutes);
adminGroup.use('/orders', adminOrderRoutes);
adminGroup.use('/products', adminProductRoutes);
adminGroup.use('/categories', adminCategoryRoutes);
adminGroup.use('/coupons', adminCouponRoutes);
adminGroup.use('/wallet', adminWalletRoutes);

// Mount admin routes with proper middleware
app.use('/admin', adminRouter);  
app.use('/admin', adminGroup);  

// Mount user routes with proper middleware
app.use('/auth/google', googleOAuthRoutes);
app.use('/cart', auth, cartRouter);
app.use('/', userRouter);
app.use('/user/coupons', auth, userCouponRoutes);
app.use('/checkout', auth, checkoutRouter);
app.use('/orders', auth, userOrderRoutes);



// Error handler for 404 Not Found
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

// Error handler for all other errors
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

// Set up mongoose connection
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB');
        try {
            await mongoose.connection.db.collection('users').dropIndex('wishlist.product_1');
        } catch (err) {
            if (err.codeName !== 'IndexNotFound') console.error('Error dropping wishlist.product_1 index:', err);
        }
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Start server
const port = process.env.PORT || 3000;

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please free up port ${port} or use a different port.`);
        process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
});

module.exports = app;