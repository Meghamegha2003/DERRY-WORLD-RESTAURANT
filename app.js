const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require("passport");
const bodyParser = require("body-parser");
const connectDB = require('./config/db');
const userRouter = require('./routes/user/userRouter');
const attachUserToLocals = require('./middlewares/attachUserToLocals');
const errorHandler = require('./middlewares/errorHandler');
const cookieParser = require('cookie-parser');
const adminRouter = require('./routes/admin/adminRouter');
const upload = require('./config/multerConfig');


const app = express();
dotenv.config();
connectDB();

const preventCaching = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

app.use(bodyParser.json());
app.use(passport.initialize());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/food', userRouter);
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(preventCaching);
app.use(attachUserToLocals);
app.use('/', userRouter);
app.use('/admin', adminRouter);
app.use(errorHandler);
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));


app.set('views', [
  path.join(__dirname, 'views/user'),
  path.join(__dirname, 'views/admin'),
]);
app.set('view engine', 'ejs');


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
