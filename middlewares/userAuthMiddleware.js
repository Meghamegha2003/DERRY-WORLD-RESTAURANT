const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');

const isUserAuthenticated = async (req, res, next) => {
  // Get the token from cookies or headers
  const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
  console.log(token);

  if (!token) {
    console.log('No token provided');
    return res.redirect('/login'); // Redirect if no token is found
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`Decoded user ID: ${decoded.userId}`);

    // Find the user based on decoded user ID
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log('User not found');
      return res.redirect('/login'); // Redirect if the user doesn't exist
    }

    // Admin users should not access user routes (change logic if needed)
    if (user.isAdmin) {
      console.log('Access forbidden: Admin users cannot access user routes');
      return res.redirect('/admin/dashboard'); // Redirect admins to their dashboard or another page
    }

    // Check if the user is blocked
    if (user.status === 'Blocked') {
      console.log('Access forbidden: User is blocked');
      return res.redirect('/login'); // Redirect blocked users to login
    }

    // Attach user object to the request for further use in routes
    req.user = user;
    next(); // Continue to the next middleware or route handler
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.error('Token expired');
      return res.status(401).json({ message: 'Token has expired, please log in again' }); // Send specific message for expired token
    }

    if (err.name === 'JsonWebTokenError') {
      console.error('Invalid token');
      return res.status(400).json({ message: 'Invalid token, please log in again' }); // Handle other errors (invalid token)
    }

    console.error('Token verification failed:', err.message);
    return res.status(500).json({ message: 'Internal server error' }); // Generic error for any other failures
  }
};

module.exports = isUserAuthenticated;
