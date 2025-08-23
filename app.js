const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const passport = require('passport');
require('dotenv').config();
require('./config/passport');

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
const paymentRoutes = require('./routes/user/paymentRoutes');
const adminWalletRoutes = require('./routes/admin/walletRoutes');
const { setMessage, getFlash } = require('./middlewares/flashMiddleware');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandlers');
const { auth, adminAuth } = require('./middlewares/authMiddleware');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


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
app.use(setMessage);
app.use(getFlash);
app.use(notFoundHandler);
app.use(errorHandler);

mongoose.connect(process.env.MONGODB_URI)
.then(()=>app.listen(3000,()=>{console.log(`server run on http://localhost:3000/`); module.exports = app;}))
.catch((err)=>console.error(err))