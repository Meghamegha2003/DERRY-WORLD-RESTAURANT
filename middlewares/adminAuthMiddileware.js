const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');

const isAdminAuthenticated = async (req, res, next) => {
  const token = req.cookies?.auth_token || req.headers['authorization']?.split(' ')[1];

  if (!token) {
    console.log('No token provided');
    return res.redirect('/admin/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`Decoded user ID: ${decoded.id}`);

    const user = await User.findById(decoded.id);
    if (!user || !user.isAdmin) {
      console.log('Access forbidden: Not an admin user');
      return res.redirect('/admin/login');
    }

    req.user = user; 
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.error('Token expired');
    } else {
      console.error('Invalid token:', err.message);
    }

    res.clearCookie('auth_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    return res.redirect('/admin/login');
  }
};

module.exports = isAdminAuthenticated;
