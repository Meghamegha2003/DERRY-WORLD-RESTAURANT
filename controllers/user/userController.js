const mongoose = require('mongoose');
const { getUniqueProductCount } = require('./cartController');
const { processReferralReward } = require('./walletController');
const User = require("../../models/userSchema");
const OTP = require("../../models/otpSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Offer = require("../../models/offerSchema");
const Wishlist = require("../../models/wishlistSchema");
const Cart = require("../../models/cartSchema");
const Rating = require("../../models/ratingSchema");
const OfferService = require('../../services/offerService');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// Define transporter for nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper function to generate JWT token
const generateToken = (user, cartCount = 0) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      isAdmin: false,
      cartCount
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Helper function to handle login errors
const handleLoginError = (req, res, message, redirectUrl = '/login') => {
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({
      success: false,
      message: message
    });
  }
  return res.status(401).render('user/login', {
    title: 'Login',
    path: '/login',
    error: message
  });
};

// Authentication Controllers
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    

    // Find user by email
    const userCount = await User.countDocuments({ email: email.toLowerCase() });
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      
      return handleLoginError(req, res, 'Invalid email or password');
    }

    // Check if user is an admin
    if (user.roles.includes('admin')) {
      
      return handleLoginError(req, res, 'Please use the admin login page');
    }

    // Check if user is blocked
    if (!user.isActive) {
      
      // Clear any existing user token
      res.clearCookie('userToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/'
      });
      // Emit socket event if user has an active socket
      const io = req.app.get('io');
      const activeUsers = req.app.get('activeUsers');
      const socketId = activeUsers.get(user._id.toString());
      
      if (socketId && io) {
        
        io.to(socketId).emit('userBlocked', {
          message: 'Your account has been blocked. Please contact support.'
        });
      }
      
      return handleLoginError(req, res, 'Your account has been blocked. Please contact support.');
    }

    // Check password
    
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
     
      return handleLoginError(req, res, 'Invalid email or password');
    }

    // Check if user is verified
    if (!user.isVerified) {
      
      
      // Generate and save new OTP
      const otp = await generateAndSaveOtp(user.email);
      
      // Create temporary token for OTP verification
      const tempToken = jwt.sign(
        { email: user.email, purpose: 'otp_verification' },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      // Set token in cookie
      res.cookie('otpToken', tempToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 10 * 60 * 1000 // 10 minutes
      });

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(200).json({
          success: false,
          message: 'Please verify your email first',
          redirectUrl: '/verify-otp'
        });
      }
      return res.redirect('/verify-otp');
    }

    // Get cart count
    const cartCount = await getCartCount(user._id);

    // Generate token
    const token = generateToken(user, cartCount);

    // Set token in cookie
    res.cookie('userToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        redirectUrl: '/'
      });
    }
    return res.redirect('/');
  } catch (error) {
    console.error('Error in loginUser:', error);
    return handleLoginError(req, res, 'An error occurred during login');
  }
};

// Logout user
const logoutUser = async (req, res) => {
  try {
    // Clear user token with proper options
    res.clearCookie('userToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });

    // Clean up socket connection if exists
    if (req.user) {
      const io = req.app.get('io');
      const activeUsers = req.app.get('activeUsers');
      const socketId = activeUsers.get(req.user._id.toString());
      
      if (socketId && io) {
       
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
        activeUsers.delete(req.user._id.toString());
      }
    }
    
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({
        success: true,
        message: 'Logout successful',
        redirectUrl: '/login'
      });
    }
    
    return res.redirect('/login');
  } catch (error) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({
        success: false,
        message: 'An error occurred during logout'
      });
    }
    res.status(500).send('Error during logout');
  }
};

// Profile Controllers
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, email, phone } = req.body;

    // Validate input
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Check if email is already taken by another user
    const existingUser = await User.findOne({ 
      email, 
      _id: { $ne: userId } 
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email is already registered with another account'
      });
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        name,
        email,
        phone,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone
      }
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Render home page
const renderHomePage = async (req, res) => {
  try {
    const selectedCategoryId = req.query.category;

    const offers = await Offer.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).lean();

    const categories = await Category.find({ isListed: true, isBlocked: false }).lean();

    const productQuery = {
      isListed: true,
      isBlocked: false
    };

    if (selectedCategoryId && selectedCategoryId !== 'all') {
      productQuery.category = selectedCategoryId;
    }

    let products = await Product.find(productQuery)
      .populate({
        path: 'category',
        match: { isBlocked: false, isListed: true }
      })
      .populate('ratings')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    const validProducts = products.filter(p => p.category);

    // Apply offers
    const productsWithOffers = await Promise.all(validProducts.map(async (product) => {
      const offerDetails = await OfferService.getBestOffer(product);
      return {
        ...product,
        offerDetails
      };
    }));

    // Get wishlist & cart
    let wishlistItems = [];
    let cartItems = [];

    if (req.user) {
      const user = await User.findById(req.user._id).select('wishlist').lean();
      wishlistItems = user?.wishlist?.map(item => item.product.toString()) || [];

      const cart = await Cart.findOne({ user: req.user._id }).lean();
      cartItems = cart?.items?.map(item => item.product.toString()) || [];
    }

    // Add wishlist + cart status to products
    const finalProducts = productsWithOffers.map(product => ({
      ...product,
      isInWishlist: req.user ? wishlistItems.includes(product._id.toString()) : false,
      isInCart: req.user ? cartItems.includes(product._id.toString()) : false
    }));

    const cartCount = req.user ? await getCartCount(req.user._id) : 0;

    res.render('user/home', {
      offers,
      categories,
      products: finalProducts,
      user: req.user,
      cartCount,
      messages: res.locals.messages,
      filters: { category: selectedCategoryId }
    });
  } catch (error) {
    console.error('Error rendering home page:', error);
    res.setMessage('error', 'Failed to load home page');
    res.redirect('/menu');
  }
};


// Render about page
const renderAboutPage = async (req, res) => {
  try {
    let cartCount = 0;
    if (req.user) {
      cartCount = await getCartCount(req.user._id);
    }
    res.render('user/about', { 
      user: req.user,
      cartCount: cartCount,
      title: 'About Us - Derry World Restaurant',
      messages: res.locals.messages
    });
  } catch (error) {
    console.error('Error rendering about page:', error);
    res.setMessage('error', 'Failed to load about page');
    res.redirect('/');
  }
};

// Render contact page
const renderContactPage = async (req, res) => {
    try {
        // Get cart count safely
        let cartCount = 0;
        if (req.user) {
            cartCount = await getCartCount(req.user._id) || 0;
        }

        res.render('user/contact', {
            title: 'Contact Us - Derry World',
            user: req.user || null,
            cartCount: cartCount
        });
    } catch (error) {
        console.error('[ERROR] Error rendering contact page:', error);
        res.status(500).render('error', { 
            message: 'Error loading contact page',
            error: process.env.NODE_ENV === 'development' ? error : {},
            cartCount: 0,
            user: null
        });
    }
};

// Address Controllers
const getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const cartCount = await getCartCount(req.user._id);

    res.render('user/addresses', {
      user,
      addresses: user.addresses,
      cartCount,
      title: 'My Addresses'
    });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching addresses'
    });
  }
};

const addAddress = async (req, res) => {
  try {
    const { fullName, phone, addressLine1, addressLine2, city, state, pincode, addressType } = req.body;

    // Validate required fields
    if (!fullName || !phone || !addressLine1 || !city || !state || !pincode || !addressType) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    // Validate address type
    const validTypes = ['Home', 'Work', 'Other'];
    if (!validTypes.includes(addressType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address type'
      });
    }

    // Validate phone number
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number'
      });
    }

    // Validate pincode
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PIN code'
      });
    }

    const user = await User.findById(req.user._id);
    
    // Add new address
    user.addresses.push({
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      addressType,
      isDefault: user.addresses.length === 0 // Make first address default
    });

    await user.save();

    res.json({
      success: true,
      message: 'Address added successfully',
      address: user.addresses[user.addresses.length - 1]
    });
  } catch (error) {
    console.error('Error adding address:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error adding address'
    });
  }
};

const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone, addressLine1, addressLine2, city, state, pincode, addressType } = req.body;

    // Validate required fields
    if (!fullName || !phone || !addressLine1 || !city || !state || !pincode || !addressType) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate address type
    const validTypes = ['Home', 'Work', 'Other'];
    if (!validTypes.includes(addressType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address type'
      });
    }

    // Validate phone number
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number'
      });
    }

    // Validate pincode
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PIN code'
      });
    }

    const user = await User.findById(req.user._id);
    const address = user.addresses.id(id);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Update address fields
    address.fullName = fullName;
    address.phone = phone;
    address.addressLine1 = addressLine1;
    address.addressLine2 = addressLine2 || '';
    address.city = city;
    address.state = state;
    address.pincode = pincode;
    address.addressType = addressType;

    await user.save();

    res.json({
      success: true,
      message: 'Address updated successfully',
      address
    });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating address'
    });
  }
};

const deleteAddress = async (req, res) => {
  try {
    
    const addressId = req.params.id;
    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: 'Address ID is required'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

   
    
    const addressIndex = user.addresses.findIndex(
      addr => addr._id.toString() === addressId
    );

    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Remove address
    user.addresses.splice(addressIndex, 1);
    await user.save();

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting address'
    });
  }
};

const applyOffersToProducts = async (products) => {
  for (const product of products) {
    // Use sales price as base if it exists and is less than regular price
    const basePrice = (product.salesPrice && product.salesPrice < product.regularPrice) 
      ? product.salesPrice 
      : product.regularPrice;

    // Skip if product doesn't have a valid category
    if (!product.category || !product.category._id) {
      continue;
    }

    // Fetch the best product-specific offer
    const productOffer = await Offer.findOne({
      isActive: true,
      type: 'product',
      product: product._id,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    // Fetch the best category-wide offer
    const categoryOffer = await Offer.findOne({
      isActive: true,
      type: 'category',
      category: product.category._id,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    let bestOffer = null;
    let bestDiscount = 0;

    // Determine the best applicable offer
    if (productOffer) {
      bestDiscount = productOffer.calculateDiscount(basePrice);
      bestOffer = productOffer;
    }
    if (categoryOffer) {
      let categoryDiscount = categoryOffer.calculateDiscount(basePrice);
      if (categoryDiscount > bestDiscount) {
        bestDiscount = categoryDiscount;
        bestOffer = categoryOffer;
      }
    }

    // Apply discount only if there's a valid offer
    if (bestOffer) {
      product.offerDetails = {
        hasOffer: true,
        finalPrice: Math.max(0, basePrice - bestDiscount),
        discountPercentage: Math.round((bestDiscount / basePrice) * 100),
        originalPrice: product.regularPrice
      };
    } else {
      product.offerDetails = {
        hasOffer: false,
        finalPrice: basePrice,
        discountPercentage: product.salesPrice && product.salesPrice < product.regularPrice 
          ? Math.round((1 - product.salesPrice/product.regularPrice) * 100)
          : 0,
        originalPrice: product.regularPrice
      };
    }
  }
  return products;
};

const renderLandingPage = async (req, res) => {
  try {
    let cartCount = 0;
    let userWishlist = [];
    
    if (req.user) {
      cartCount = await getCartCount(req.user._id);
    }

    // Get featured products with populated category
    let products = await Product.find({ 
      isListed: true,
      isBlocked: false,
      isAvailable: true 
    })
    .populate('category')
    .populate('ratings')
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

    // Get top-rated products
    let topRatedProducts = await Product.find({
      isListed: true,
      isBlocked: false,
      isAvailable: true,
      'ratings.0': { $exists: true }
    })
    .populate('category')
    .populate('ratings')
    .sort({ 'ratings.rating': -1 })
    .limit(4)
    .lean();

    // Mark wishlist items and ensure price fields
    const processProducts = (prods) => prods.map(product => ({
      ...product,
      price: product.regularPrice || 0,
      salesPrice: product.salesPrice || product.regularPrice || 0
    }));

    products = processProducts(products);
    topRatedProducts = processProducts(topRatedProducts);

    // Get categories
    const categories = await Category.find({ 
      isListed: true 
    })
    .lean();

    res.render('user/home', {
      user: req.user || null,
      products,
      topRatedProducts,
      categories,
      cartCount,
      path: '/'
    });
  } catch (error) {
    console.error('Error in renderLandingPage:', error);
    res.status(500).render('error', {
      message: 'Error loading landing page',
      error: process.env.NODE_ENV === 'development' ? error : {},
      cartCount: 0,
      user: null
    });
  }
};

const renderRegisterPage = (req, res) => {
  try {
    if (req.user) {
      return res.redirect("/");
    }

    // Sanitize query params to avoid HTML injection or format issues
    const sanitizeInput = (value) => {
      if (typeof value !== 'string') return '';
      return value.trim().replace(/[<>"'`]/g, '');
    };

    const name = sanitizeInput(req.query.name || '');
    const email = sanitizeInput(req.query.email || '');
    const phone = sanitizeInput(req.query.phone || '');

    // Optional validation: ensure safe formats
    const nameValid = /^[A-Za-z][A-Za-z\s]*$/.test(name) || name === '';
    const emailValid = /^[A-Za-z][\w.-]*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email) || email === '';
    const phoneValid = /^[0-9]{10}$/.test(phone) || phone === '';

    const formData = {
      name: nameValid ? name : '',
      email: emailValid ? email : '',
      phone: phoneValid ? phone : ''
    };

    res.render("user/register", {
      message: sanitizeInput(req.query.message || ""),
      successMessage: sanitizeInput(req.query.successMessage || ""),
      activePage: "register",
      error: sanitizeInput(req.query.error || null),
      formData,
      path: '/user/register',
      user: null,
      cartCount: 0
    });

  } catch (error) {
    console.error('Error rendering register page:', error);
    res.status(500).render('user/register', {
      message: '',
      successMessage: '',
      activePage: 'register',
      error: 'An error occurred. Please try again.',
      formData: { name: '', email: '', phone: '' },
      path: '/user/register',
      user: null,
      cartCount: 0
    });
  }
};

const resendOTP = async (req, res) => {
  try {
    // Accept otpToken from cookie or request body
    let otpToken = req.cookies.otpToken || req.body.otpToken;
    if (!otpToken) {
      return res.status(400).json({
        success: false,
        message: 'Verification session expired. Please try again.'
      });
    }
    // Verify and decode token
    let decoded;
    try {
      decoded = jwt.verify(otpToken, process.env.JWT_SECRET);
      if (decoded.purpose !== 'otp_verification') throw new Error('Invalid token purpose');
    } catch (error) {
      res.clearCookie('otpToken');
      return res.status(400).json({
        success: false,
        message: 'Verification session expired. Please try again.'
      });
    }

    // Generate and save new OTP
    const otp = await generateAndSaveOtp(decoded.email);

    res.json({
      success: true,
      message: 'New OTP has been sent to your email'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP. Please try again.'
    });
  }
};

const registerUser = async (req, res) => {
  try {
    
    const { name, email, password, phone, referralCode } = req.body;
    
    // Validate required fields
    if (!name || !email || !password || !phone) {
     
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({
          success: false,
          error: 'All fields are required'
        });
      }
      res.setMessage('error', 'All fields are required');
      return res.redirect('/register');
    }

    // Validate phone number format
    if (!/^\d{10}$/.test(phone)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({
          success: false,
          error: 'Please enter a valid 10-digit phone number'
        });
      }
      res.setMessage('error', 'Please enter a valid 10-digit phone number');
      return res.redirect('/register');
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({
          success: false,
          error: 'Please enter a valid email address'
        });
      }
      res.setMessage('error', 'Please enter a valid email address');
      return res.redirect('/register');
    }

    // Validate password strength
    if (password.length < 6) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 6 characters long'
        });
      }
      res.setMessage('error', 'Password must be at least 6 characters long');
      return res.redirect('/register');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { phone: phone }
      ]
    });

    if (existingUser) {
      const errorMessage = existingUser.email === email.toLowerCase() 
        ? 'Email already registered' 
        : 'Phone number already registered';

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({
          success: false,
          error: errorMessage
        });
      }
      res.setMessage('error', errorMessage);
      return res.redirect('/register');
    }

    // Handle referral code if provided
    let referredByUser = null;
    if (referralCode) {
      referredByUser = await User.findOne({ referralCode });
      if (!referredByUser) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
          return res.status(400).json({
            success: false,
            error: 'Invalid referral code'
          });
        }
        res.setMessage('error', 'Invalid referral code');
        return res.redirect('/register');
      }
    }

    // Generate unique referral code for new user
    const userReferralCode = generateReferralCode(new mongoose.Types.ObjectId());

    // Generate and send OTP
    const otp = await generateAndSaveOtp(email);
    // Create JWT for OTP verification (stateless)
    const otpToken = jwt.sign(
      {
        purpose: 'otp_verification',
        name,
        email: email.toLowerCase(),
        phone,
        password: password, // Store plain password, will be hashed by userSchema middleware
        referralCode: userReferralCode,
        referredBy: referredByUser ? referredByUser._id : null
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    // Set the OTP token in a cookie
    res.cookie('otpToken', otpToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/'
    });

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        redirectUrl: '/verify-otp'
      });
    }

    // Redirect to verify OTP page
    res.setMessage('success', 'Please verify your email with the OTP sent');
    return res.redirect('/verify-otp');

  } catch (error) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({
        success: false,
        error: 'An error occurred during registration'
      });
    }
    res.setMessage('error', 'An error occurred during registration');
    return res.redirect('/register');
  }
};

// Render OTP verification page
const renderVerifyOtpPage = async (req, res) => {
  try {
    // Check for OTP token
    const otpToken = req.cookies.otpToken;
    if (!otpToken) {
      res.setMessage('error', 'Verification session expired. Please try again.');
      return res.redirect('/login');
    }
    let email;
    try {
      const decoded = jwt.verify(otpToken, process.env.JWT_SECRET);
      if (decoded.purpose !== 'otp_verification') throw new Error('Invalid token purpose');
      email = decoded.email;
    } catch (error) {
      res.clearCookie('otpToken');
      res.setMessage('error', 'Verification session expired. Please try again.');
      return res.redirect('/login');
    }

    res.render('user/verify-otp', {
      title: 'Verify OTP',
      email: email
    });
  } catch (error) {
    res.setMessage('error', 'Something went wrong. Please try again.');
    res.redirect('/login');
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    
    // Check for OTP token
    const otpToken = req.cookies.otpToken;
    if (!otpToken) {
      return res.status(400).json({
        success: false,
        message: 'Verification session expired. Please try again.'
      });
    }
    let decoded;
    try {
      decoded = jwt.verify(otpToken, process.env.JWT_SECRET);
      if (decoded.purpose !== 'otp_verification') throw new Error('Invalid token purpose');
    } catch (error) {
      res.clearCookie('otpToken');
      return res.status(400).json({
        success: false,
        message: 'Verification session expired. Please try again.'
      });
    }

    // Find OTP record
    const otpRecord = await OTP.findOne({
      email: decoded.email,
      otp: otp,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP. Please try again.'
      });
    }

    // Delete used OTP
    await OTP.deleteOne({ _id: otpRecord._id });

    // This is a registration or login verification
    const userData = decoded;
    if (userData.name) {
      // Registration flow
      const newUser = new User({
        name: userData.name,
        email: userData.email.toLowerCase(),
        phone: userData.phone,
        password: userData.password,
        referralCode: userData.referralCode,
        referredBy: userData.referredBy,
        isVerified: true
      });
      await newUser.save();
      // If user was referred, process referral rewards
      if (userData.referredBy) {
        await processReferralReward(userData.referredBy, newUser._id);
      }
      res.clearCookie('otpToken');
      return res.json({
        success: true,
        message: 'Registration successful. Please login to continue.',
        redirectUrl: '/login'
      });
    } else {
      // Login verification flow
      const user = await User.findOneAndUpdate(
        { email: userData.email },
        { isVerified: true },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      res.clearCookie('otpToken');
      return res.json({
        success: true,
        message: 'Email verified successfully. Please login to continue.',
        redirectUrl: '/login'
      });
    }

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
};


//login page
const renderLoginPage = async (req, res) => {
  try {
    res.render('user/login', {
      title: 'Login',
      path: '/login',
      error: null
    });
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
};

const renderForgotPassword = (req, res) => {
  res.render('user/forgot-password', {
    message: req.query.message || '',
    successMessage: req.query.successMessage || '',
    activePage: 'forgot-password',
    error: null,
    path: '/forgot-password'
  });
};

const handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'No account found with that email address.' });
      }
      return res.render('user/forgot-password', {
        message: 'No account found with that email address.',
        successMessage: '',
        activePage: 'forgot-password',
        error: null,
        path: '/forgot-password'
      });
    }

    // Generate password reset token
    const passwordResetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Save reset token and expiry to user document
    user.resetPasswordToken = passwordResetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <h1>Password Reset Request</h1>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${req.protocol}://${req.get('host')}/reset-password/${passwordResetToken}">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({ success: true, message: 'Password reset link has been sent to your email.' });
    }
    res.render('user/forgot-password', {
      message: '',
      successMessage: 'Password reset link has been sent to your email.',
      activePage: 'forgot-password',
      error: null,
      path: '/forgot-password'
    });

  } catch (error) {
    console.error('Error in handleForgotPassword:', error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: 'An error occurred while processing your request.' });
    }
    res.render('user/forgot-password', {
      message: '',
      successMessage: '',
      activePage: 'forgot-password',
      error: 'An error occurred while processing your request.',
      path: '/forgot-password'
    });
  }
};

const renderResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.render('user/reset-password', {
        message: 'Password reset token is invalid or has expired.',
        validToken: false,
        token: null,
        path: '/reset-password'
      });
    }

    res.render('user/reset-password', {
      message: '',
      validToken: true,
      token,
      path: '/reset-password'
    });
  } catch (error) {
    console.error('Error in renderResetPassword:', error);
    res.render('user/reset-password', {
      message: 'An error occurred. Please try again.',
      validToken: false,
      token: null,
      path: '/reset-password'
    });
  }
};

const handleResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    // Password validation
    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Both password fields are required'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired'
      });
    }

    // Set the new password - the pre-save hook will hash it
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    await user.save(); // This will trigger the pre-save hook to hash the password

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    console.error('Error in handleResetPassword:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while resetting password',
      error: error
    });
  }
};

const renderProfilePage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    let cartCount = 0;
    if (user && user.cart) {
      cartCount = await getCartCount(req.user._id);
    }

    res.render('user/profile', {
      user,
      cartCount,
      activeSection: req.query.section || 'profile',
      error: null,
      path: '/profile'
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).render('error', {
      message: 'Error fetching profile',
      error: process.env.NODE_ENV === 'development' ? error : {},
      cartCount: 0
    });
  }
};

const googleCallback = async (req, res) => {
  try {
    const { id, email, displayName, picture } = req.user;

    if (!email) {
      res.setMessage('error', 'Email access is required for Google login');
      return res.redirect('/login');
    }

    // Check if user exists
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user
      user = new User({
        name: displayName,
        email: email,
        googleId: id,
        profilePicture: picture,
        isVerified: true, // Google users are pre-verified
        password: crypto.randomBytes(20).toString('hex'), // Random password for Google users
        referralCode: generateReferralCode()
      });
      await user.save();
      res.setMessage('success', 'Account created successfully with Google');
    } else {
      // Update existing user's Google ID if not set
      if (!user.googleId) {
        user.googleId = id;
        user.profilePicture = picture;
        await user.save();
      } 
      res.setMessage('success', 'Welcome back!');
    }

    // Get cart count
    const cartCount = await getCartCount(user._id);

    // Generate token with extended expiry for Google users
    const token = generateToken(user, cartCount);

    // Set token in cookie
    res.cookie('userToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Set flash message cookie
    res.cookie('flash', JSON.stringify({ 
      type: 'success', 
      message: user.googleId ? 'Welcome back!' : 'Account created successfully with Google' 
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 5000 // 5 seconds
    });

    // Redirect to home page
    res.redirect('/');
  } catch (error) {
    res.setMessage('error', 'Failed to authenticate with Google');
    res.redirect('/login');
  }
};

// Render product details page
const renderProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId).populate('category');
    
    if (!product) {
      return res.status(404).render('error', {
        message: 'Product not found',
        error: { status: 404 }
      });
    }

    const category = await Category.findById(product.category);
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id }
    }).limit(4);

    let isInCart = false;
    if (req.user) {
      const cart = await Cart.findOne({
        user: req.user._id,
        'items.product': product._id
      });
      isInCart = !!cart;
    }

    const offerDetails = await OfferService.getBestOffer(product);
    product.offerDetails = offerDetails;
    product.finalPrice = offerDetails ? offerDetails.finalPrice : product.regularPrice;

    // Apply offers to related products
    for (let relatedProduct of relatedProducts) {
      const offer = await OfferService.getBestOffer(relatedProduct);
      relatedProduct.offerDetails = offer;
      relatedProduct.finalPrice = offer ? offer.finalPrice : relatedProduct.regularPrice;
    }

    res.render('user/foodDetails', {
      product,
      category,
      relatedProducts,
      isInCart
    });
  } catch (error) {
    res.status(500).render('error', {
      message: 'Error loading product details',
      error: process.env.NODE_ENV === 'development' ? error : {},
      user: req.user,
      cartCount: 0
    });
  }
}

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirm password do not match'
      });
    }

    // Debug: Print raw MongoDB user document
    const userRaw = await User.collection.findOne({ _id: req.user._id });
    // If wallet is not null and not an ObjectId, forcibly set it to null in the database (fix legacy/corrupt field)
    if (userRaw.wallet && typeof userRaw.wallet === 'object' && !(userRaw.wallet instanceof require('bson').ObjectId)) {
      await User.collection.updateOne({ _id: req.user._id }, { $set: { wallet: null } });
    }
    // Get user with password
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

      user.password = newPassword;
    // Ensure all optional fields exist (set to null if missing)
    [
      'wallet',
      'verificationToken',
      'resetPasswordToken',
      'verificationExpires',
      'resetPasswordExpires',
      'googleId'
    ].forEach(field => {
      if (typeof user[field] === 'undefined') user[field] = null;
    });
    // Fix wallet field if it is not null and not a valid ObjectId
    const mongoose = require('mongoose');
    if (
      user.wallet !== null &&
      (typeof user.wallet === 'object' || typeof user.wallet === 'function') &&
      !(user.wallet instanceof mongoose.Types.ObjectId)
    ) {
      user.wallet = null;
    }
     // Save the user with the new password
    await user.save();
    // Double-check the password hash in the database after save
    const userDb = await User.findById(user._id).select('+password');
   

    // Invalidate user session by clearing the auth cookie (userToken)
    res.clearCookie('userToken');
    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again.'
    });
  } catch (error) {
    if (error.name === 'ValidationError' && error.errors && error.errors.password) {
      // Password validation error: show message to user
      return res.status(400).json({
        success: false,
        message: error.errors.password.message
      });
    }
    if (error.message.includes('Cannot read properties of undefined (reading options)')) {
      console.error('Error changing password:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to change password due to internal error. Please contact support.'
      });
    } else {
      console.error('Error changing password:', error);
      if (error && error.stack) {
        console.error('Error stack:', error.stack);
      }
      if (error && error.errors) {
        Object.keys(error.errors).forEach(function(key) {
          console.error('Validation error for', key, ':', error.errors[key]);
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Error changing password',
        error: error && error.message ? error.message : error
      });
    }
  }
};

// Verify referral code
const verifyReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        error: 'Referral code is required'
      });
    }

    const referrer = await User.findOne({ referralCode });

    if (!referrer) {
      return res.status(400).json({
        success: false,
        error: 'Invalid referral code'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Valid referral code',
      rewards: {
        referrer: '₹100',
        newUser: '₹50'
      }
    });

  } catch (error) {
    console.error('Referral code verification error:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while verifying referral code'
    });
  }
};

// Render cart page
const renderCartPage = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/login');
    }

    // Get cart items
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    let cartItems = [];
    let subtotal = 0;
    let total = 0;
    let deliveryCharge = 0;
    let couponDiscount = cart ? cart.couponDiscount || 0 : 0;

    if (cart && cart.items.length > 0) {
      cartItems = await Promise.all(cart.items.map(async item => {
        const product = item.product;
        if (!product) return null;

        // Get offer details for the product
        const offerDetails = await OfferService.getBestOffer(product);
        const finalPrice = offerDetails.hasOffer ? offerDetails.finalPrice : (product.salesPrice || product.regularPrice);
        
        const itemTotal = finalPrice * item.quantity;
        subtotal += itemTotal;

        return {
          ...item.toObject(),
          product: {
            ...product.toObject(),
            offerDetails
          },
          price: finalPrice,
          originalPrice: product.regularPrice,
          total: itemTotal,
          discountPercentage: ((product.regularPrice - finalPrice) / product.regularPrice) * 100
        };
      }));

      // Remove any null items (from deleted products)
      cartItems = cartItems.filter(item => item !== null);

      // Calculate delivery charge and total
      deliveryCharge = subtotal >= 500 ? 0 : 40;
      total = subtotal + deliveryCharge - couponDiscount;
    }

    // Get cart count
    const cartCount = cart ? getUniqueProductCount(cart) : 0;

    res.render('user/cart', {
      cartItems,
      subtotal,
      deliveryCharge,
      total,
      couponDiscount,
      cart,
      user: req.user,
      cartCount,
      messages: res.locals.messages,

    });
  } catch (error) {
    console.error('Error rendering cart page:', error);
    res.setMessage('error', 'Failed to load cart');
    res.redirect('/');
  }
};

// Add to cart
const addToCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;
    const { quantity = 1 } = req.body;

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get or create cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check if product already in cart
    const existingItem = cart.items.find(item => 
      item.productId.toString() === productId
    );

    if (existingItem) {
      existingItem.quantity += parseInt(quantity);
    } else {
      cart.items.push({
        productId,
        quantity: parseInt(quantity)
      });
    }

    await cart.save();

    res.json({
      success: true,
      message: 'Added to cart',
      cartCount: getUniqueProductCount(cart)
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add to cart'
    });
  }
};

// Update cart item
const updateCartItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;
    const { quantity } = req.body;

    // Validate quantity
    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity'
      });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Find and update item
    const cartItem = cart.items.find(item => 
      item.productId.toString() === productId
    );

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    cartItem.quantity = parseInt(quantity);
    await cart.save();

    res.json({
      success: true,
      message: 'Cart updated',
      quantity: cartItem.quantity,
      cartCount: getUniqueProductCount(cart)
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart'
    });
  }
};

// Remove from cart
const removeFromCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Remove item from cart
    cart.items = cart.items.filter(item => 
      item.productId.toString() !== productId
    );

    await cart.save();

    res.json({
      success: true,
      message: 'Item removed from cart',
      cartCount: getUniqueProductCount(cart)
    });
  } catch (error) {
    
    res.status(500).json({
      success: false,
      message: 'Failed to remove item'
    });
  }
};

// Helper function to send OTP email
const sendOTPEmail = async (email, otp) => {
  try {
    // Configure nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Send OTP email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your Email - Derry World',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Derry World!</h2>
          <p>Your verification code is:</p>
          <h1 style="color: #ffbe33; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this code, you can safely ignore this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    
  } catch (error) {
   
    throw error;
  }
};

// Helper function to generate and save OTP
const generateAndSaveOtp = async (email) => {
  try {
    // Delete any existing OTPs for this email
    await OTP.deleteMany({ email });
   

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('\n[DEBUG] ============ OTP DETAILS ============');
    console.log(`[DEBUG] Email: ${email}`);
    console.log(`[DEBUG] OTP: ${otp}`);
    console.log('[DEBUG] ====================================\n');

    // Save OTP to database
    const newOTP = new OTP({
      email,
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry
    });
    await newOTP.save();
    

    // Send OTP email
    await sendOTPEmail(email, otp);

    return { otp };
  } catch (error) {
    
    throw error;
  }
};

// Helper function to get cart count
const getCartCount = async (userId) => {
  try {
    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.items) return 0;
    return cart.items.length;
  } catch (error) {
    console.error('Error getting cart count:', error);
    return 0;
  }
};

const generateReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Password Reset Controllers
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
       
        if (!email) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide your email address'
                });
            }
            res.setMessage('error', 'Please provide your email address');
            return res.redirect('/forgot-password');
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(200).json({
                    success: true,
                    message: 'If an account exists with this email, you will receive password reset instructions.'
                });
            }
            res.setMessage('success', 'If an account exists with this email, you will receive password reset instructions.');
            return res.redirect('/forgot-password');
        }

        // Check if user is blocked
        if (!user.isActive) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(403).json({
                    success: false,
                    message: 'Your account has been blocked. Please contact support.'
                });
            }
            res.setMessage('error', 'Your account has been blocked. Please contact support.');
            return res.redirect('/forgot-password');
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        // Save reset token and expiry to user document
        user.resetPasswordToken = resetTokenHash;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        
        const mailOptions = {
          to: user.email,
          subject: 'Password Reset Request',
          html: `
            <h1>Password Reset Request</h1>
            <p>You requested to reset your password. Click the link below to reset your password:</p>
            <a href="${req.protocol}://${req.get('host')}/reset-password/${resetToken}">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `
        };

       
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(200).json({
                success: true,
                message: 'Password reset instructions have been sent to your email'
            });
        }
        res.setMessage('success', 'Password reset instructions have been sent to your email');
        res.redirect('/forgot-password');

    } catch (error) {
        
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'An error occurred while processing your request'
            });
        }
        res.setMessage('error', 'An error occurred while processing your request');
        res.redirect('/forgot-password');
    }
};

const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        

        if (!password || password.length < 6) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid password (minimum 6 characters)'
                });
            }
            res.setMessage('error', 'Please provide a valid password (minimum 6 characters)');
            return res.redirect(`/reset-password/${token}`);
        }

        // Hash token
        const resetTokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Find user with valid token
        const user = await User.findOne({
            resetPasswordToken: resetTokenHash,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({
                    success: false,
                    message: 'Password reset link is invalid or has expired'
                });
            }
            res.setMessage('error', 'Password reset link is invalid or has expired');
            return res.redirect('/forgot-password');
        }

        // Update password
        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        

        // Send confirmation email
        const mailOptions = {
            to: user.email,
            subject: 'Password Reset Successful - Derry World',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ffbe33;">Password Reset Successful</h2>
                    <p>Hello ${user.name},</p>
                    <p>Your password has been successfully reset.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${req.protocol}://${req.get('host')}/login" style="background-color: #ffbe33; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Login Now</a>
                    </div>
                    <p>If you didn't request this, please contact us immediately.</p>
                    <hr style="border: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #666; font-size: 12px;">
                        This is an automated email from Derry World. Please do not reply to this email.
                    </p>
                </div>
            `
        };

        await sendEmail(mailOptions);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(200).json({
                success: true,
                message: 'Your password has been reset successfully. Please login with your new password.',
                redirectUrl: '/login'
            });
        }
        res.setMessage('success', 'Your password has been reset successfully. Please login with your new password.');
        res.redirect('/login');

    } catch (error) {
      
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'An error occurred while resetting your password'
            });
        }
        res.setMessage('error', 'An error occurred while resetting your password');
        res.redirect('/forgot-password');
    }
};

// Render password reset pages
const renderForgotPasswordPage = (req, res) => {
    res.render('user/forgot-password');
};

const renderResetPasswordPage = (req, res) => {
    res.render('user/reset-password', { token: req.params.token });
};

// Handle contact form submission
const handleContactForm = async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;

        // Validate input
        if (!name || !email || !phone || !message) {
            return res.status(400).json({
                success: false,
                message: 'Please fill in all required fields'
            });
        }

        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        // Validate phone number format
        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 10-digit phone number'
            });
        }

        // Here you would typically save the contact form to database
        // and/or send an email notification
        
       
        res.json({
            success: true,
            message: 'Thank you for your message. We will get back to you soon!'
        });
    } catch (error) {
        console.error('[ERROR] Contact form error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again.'
        });
    }
};

module.exports = {
  getCartCount,
  loginUser,
  logoutUser,
  updateUserProfile,
  renderHomePage,
  renderAboutPage,
  renderContactPage,
  handleContactForm,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  applyOffersToProducts,
  renderLandingPage,
  renderRegisterPage,
  registerUser,
  renderVerifyOtpPage,
  verifyOTP,
  resendOTP,
  renderLoginPage,
  renderForgotPassword,
  handleForgotPassword,
  renderResetPassword,
  handleResetPassword,
  renderProfilePage,
  googleCallback,
  renderProductDetails,
  changePassword,
  verifyReferralCode,
  renderCartPage,
  addToCart,
  updateCartItem,
  removeFromCart,
  forgotPassword,
  resetPassword,
  renderForgotPasswordPage,
  renderResetPasswordPage
};