const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema')


const loginPage = async (req, res) => {
  try {
    const token = req.cookies?.admin_token; // Check for token in the cookies

    if (token) {
      // If a token exists, try to verify it
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if the user exists and is an admin
      const user = await User.findById(decoded.userId);
      if (user && user.isAdmin) {
        // If valid admin token, redirect to the dashboard
        return res.redirect('/admin/dashboard');
      }
    }

    // If no valid token or not an admin, render the login page
    res.render('adminLogin', { errorMessage: null, successMessage: null });
  } catch (error) {
    console.error('Error loading login page:', error);
    res.status(500).send('Server Error');
  }
};


const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  try {
    // Find the admin user in the database
    const admin = await User.findOne({ email, isAdmin: true });
    if (!admin) {
      return res.render('adminLogin', { errorMessage: 'Invalid credentials or not an admin.', successMessage: null });
    }

    // Compare the submitted password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.render('adminLogin', { errorMessage: 'Invalid credentials.', successMessage: null });
    }

    // Generate a JWT token
    const token = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: '12d' });

    // Set the JWT in a cookie
    res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

    // Redirect to the admin dashboard
    res.redirect('/admin/dashboard'); 
  } catch (error) {
    console.error('Error during admin login:', error);
    res.render('adminLogin', { errorMessage: 'An error occurred. Please try again.', successMessage: null });
  }
};



const loadDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isVerified: true });
    const blockedUsers = await User.countDocuments({ isBlocked: true });

    res.render('dashboard', {
      user: req.user,
      totalUsers,
      activeUsers,
      blockedUsers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};


const customerList = async (req, res) => {
  try {
    const customers = await User.find({ isAdmin: false }); 

    res.render('customer-list', { customers });
    
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
};


const updateUserStatus = async (req, res) => {
  const userId = req.params.id;

  
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  try {
    const user = await User.findById(userId);
    
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    
    user.status = user.status === 'Active' ? 'Blocked' : 'Active';
    await user.save();

    res.redirect('/admin/customer-list');
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// const logoutAdmin = (req, res) => {
//   try {
//     res.clearCookie('auth_token');
//     res.render('adminLogin', { errorMessage: null, successMessage: 'Logged out successfully.' });
//   } catch (error) {
//     console.error('Error during logout:', error);
//     res.status(500).send('Server Error');
//   }
// };


const logoutAdmin = (req, res) => {
  try {
    // Clear the admin authentication token from cookies
    res.clearCookie('admin_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    // Clear session cookie (if any)
    res.clearCookie('connect.sid');  // Adjust cookie name if using a different session name

    // Destroy the session if it exists
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
      });
    }

    // Render the login page with a success message
    res.render('adminLogin', { errorMessage: null, successMessage: 'Logged out successfully.' });
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).send('Server Error');
  }
};

module.exports = { 
  loginPage,
  loginAdmin,
  loadDashboard,
  customerList,
  updateUserStatus,
  logoutAdmin,
};
