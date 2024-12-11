const jwt = require('jsonwebtoken');
const User = require('../models/User'); 

const isAuthenticated = (role) => {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.auth_token;

      if (!token) {
        console.warn('No token provided. Redirecting to login.');
        return res.redirect('/login');
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) {
        console.error('User not found. Clearing token and redirecting.');
        res.clearCookie('auth_token');
        return res.redirect('/login');
      }

      if (user.status === 'Blocked') {
        console.warn('User is blocked. Redirecting to login.');
        res.clearCookie('auth_token');
        return res.redirect('/login');
      }

      if (role && !user.hasRole(role)) {
        console.warn(`Access denied. User does not have required role: ${role}`);
        return res.status(403).json({ error: 'Access denied' });
      }

      req.user = user; 
      next();
    } catch (err) {
      console.error('Error verifying token:', err.message);
      res.clearCookie('auth_token');
      res.redirect('/login');
    }
  };
};

module.exports = isAuthenticated;
