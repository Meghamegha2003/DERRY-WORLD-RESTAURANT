const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');

const jwtAuth = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;
    
    if (!token) {
      return res.redirect('/login');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.redirect('/login');
    }

    req.user = user;
    next();
  } catch (error) {
    res.clearCookie('jwt');
    return res.redirect('/login');
  }
};

module.exports = jwtAuth;
