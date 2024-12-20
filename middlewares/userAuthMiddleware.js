const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');

const isUserAuthenticated = async (req, res, next) => {
  const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
  console.log(token);
  
  if (!token) {
    console.log('here ,No token provided');
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`Decoded user ID: ${decoded.userId}`);

    const user = await User.findById(decoded.userId);
    if (!user || user.isAdmin) {
      console.log('Access forbidden: Admin users cannot access user routes');
      return res.redirect('/login');
    }

    if (user.status === 'Blocked') {
      console.log('Access forbidden: User is blocked');
      return res.redirect('/login');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.error('Token expired');
      // Handle token expiration
    }
  }
};

module.exports = isUserAuthenticated;
