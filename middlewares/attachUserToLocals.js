const jwt = require('jsonwebtoken');
const User = require('../models/userSchema'); 

const attachUserToLocals = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    res.locals.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select('name email roles status');

    if (!user || user.status === 'Blocked') {
      res.locals.user = null;
      res.clearCookie('token');
      return next();
    }

    req.user = user; 
    res.locals.user = { 
      id: user._id, 
      email: user.email, 
      roles: user.roles, 
      name: user.name 
    };
    next();
  } catch (err) {
    console.error('Error verifying token:', err.message);
    res.locals.user = null;
    res.clearCookie('token');
    next();
  }
};

module.exports = attachUserToLocals;
