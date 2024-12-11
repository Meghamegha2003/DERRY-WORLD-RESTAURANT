const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema')

const loadLogin = (req, res) => {
  res.render("adminLogin", { message: null });
};

const handleLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !user.isAdmin) {
      return res.render("adminLogin", { message: "Access denied: Admins only" });
    }

    const isMatch = bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("adminLogin", { message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.cookie('auth_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    return res.render("adminLogin", { message: "An error occurred" });
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





module.exports = { 
  loadLogin,
  handleLogin,
  loadDashboard,
  customerList,
  updateUserStatus,
};
