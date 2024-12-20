const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const User= require('../../models/userSchema');
const OTP = require('../../models/otpSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Temporary storage for pending registrations
const pendingRegistrations = new Map();

const sendOtpEmail = async (email, otp) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP code is: ${otp}. It will expire in 15 minutes.`,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new Error('Failed to send OTP email. Please try again.');
  }
};

const generateAndSaveOtp = async (email) => {
  try {
    // Delete any existing OTP for this email
    await OTP.deleteOne({ email });

    const otp = Math.floor(100000 + Math.random() * 900000); 
    const otpRecord = new OTP({
      email,
      otp: otp.toString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), 
    });

    await otpRecord.save();
    return otp;
  } catch (error) {
    console.error('Error generating OTP:', error);
    throw new Error('Failed to generate OTP');
  }
};


const renderLandingPage = async (req, res) => {
  try {
    const categories = await Category.find();  
    const categoryFilter = req.query.category || null;
    const query = categoryFilter ? { 'category.name': categoryFilter } : {};

    const products = await Product.find(query).populate('category');

    const activePage = 'home';

    res.render('home', { products, categories, activePage });
  } catch (error) {
    console.error('Error fetching menu data:', error);
    res.status(500).send('Internal Server Error');
  }
};


const renderRegisterPage = (req, res) => {
  if (req.user) {
    return res.redirect('/');
  }
  res.render('register', {
    message: req.query.message || '',
    successMessage: req.query.successMessage || '',
    activePage: 'register'
  });
};

const renderMenuPage = async (req, res) => {
  try {
    // Fetch all active categories
    const categories = await Category.find({ isActive: true });

    // Get the selected category filter
    const categoryFilter = req.query.category || null;

    let query = { isAvailable: true };

    // If a category filter is selected, resolve its ObjectId
    if (categoryFilter) {
      const category = await Category.findOne({ name: categoryFilter, isActive: true });
      if (category) {
        query.category = category._id; // Use the ObjectId
      } else {
        // Handle case where category does not exist (optional)
        query = { isAvailable: false }; // No products will be found
      }
    }

    // Fetch filtered products
    const products = await Product.find(query).populate('category');

    // Render the menu page with products and categories
    res.render('menu', { products, categories, selectedCategory: categoryFilter });
  } catch (error) {
    console.error('Error fetching menu data:', error);
    res.status(500).send('Internal Server Error');
  }
};


const registerUser = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone } = req.body;

    if (!name || !email || !password || !confirmPassword || !phone) {
      return res.render('register', {
        message: 'All fields are required',
        successMessage: '',
        activePage: 'register'
      });
    }

    if (password !== confirmPassword) {
      return res.render('register', {
        message: 'Passwords do not match',
        successMessage: '',
        activePage: 'register'
      });
    }

    if (password.length < 6) {
      return res.render('register', {
        message: 'Password must be at least 6 characters long',
        successMessage: '',
        activePage: 'register'
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('register', {
        message: 'Email is already registered',
        successMessage: '',
        activePage: 'register'
      });
    }

    // Store user data in temporary storage
    pendingRegistrations.set(email, {
      name,
      email,
      phone,
      password, // Will be hashed by the pre-save middleware
      roles: ['user'],
      status: 'Active'
    });

    const otp = await generateAndSaveOtp(email);
    await sendOtpEmail(email, otp);
    console.log(otp);

    res.render('verifyOtp', {
      message: '',
      successMessage: 'Please verify your email to complete registration.',
      email,
      activePage: 'register'
    });
  } catch (error) {
    console.error('Error in registerUser:', error);
    const errorMessage = error.message || 'An error occurred during registration';
    res.render('register', {
      message: errorMessage,
      successMessage: '',
      activePage: 'register'
    });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp, email } = req.body;
    console.log('Verifying OTP for email:', email);

    const otpRecord = await OTP.findOne({ 
      email, 
      otp,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      console.log('Invalid or expired OTP for:', email);
      return res.render('verifyOtp', { 
        message: 'Invalid or expired OTP',
        successMessage: '',
        email,
        activePage: 'register'
      });
    }

    // Get pending registration data
    const pendingUser = pendingRegistrations.get(email);
    console.log('Pending registration found:', pendingUser ? 'Yes' : 'No');

    if (!pendingUser) {
      console.log('No pending registration found for:', email);
      return res.render('verifyOtp', { 
        message: 'Registration data not found. Please register again.',
        successMessage: '',
        email,
        activePage: 'register'
      });
    }

    try {
      // Create and save the user
      const newUser = new User({
        name: pendingUser.name,
        email: pendingUser.email,
        password: pendingUser.password,
        phone: pendingUser.phone,
        roles: ['user'],
        status: 'Active',
        isVerified: true
      });

      console.log('Attempting to save new user:', newUser.email);
      await newUser.save();
      console.log('User saved successfully');

      // Clear temporary data
      pendingRegistrations.delete(email);
      await OTP.deleteOne({ email });

      // Double check if user was actually saved
      const savedUser = await User.findOne({ email });
      console.log('Verification - User exists in DB:', savedUser ? 'Yes' : 'No');

      if (!savedUser) {
        console.log('Error: User was not saved properly');
        throw new Error('Failed to save user');
      }

      // Redirect to login page with success message
      return res.redirect('/login?successMessage=' + encodeURIComponent('Registration completed successfully! Please login to continue.'));
    } catch (saveError) {
      console.error('Error saving user:', saveError);
      return res.render('verifyOtp', { 
        message: 'Error creating user account. Please try again.',
        successMessage: '',
        email,
        activePage: 'register'
      });
    }
  } catch (error) {
    console.error('Error in verifyOtp:', error);
    res.render('verifyOtp', { 
      message: 'An error occurred during verification',
      successMessage: '',
      email: req.body.email,
      activePage: 'register'
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    // Check if user exists
    const user = await User.findOne({ email });
    console.log('User found in database:', user ? 'Yes' : 'No');

    if (!user) {
      return res.render('login', { 
        errorMessage: 'Invalid email or password',
        successMessage: '',
        activePage: 'login'
      });
    }

    // Prevent admin users from logging in through user login
    if (user.isAdmin) {
      return res.render('login', {
        errorMessage: 'Please use admin login page',
        successMessage: '',
        activePage: 'login'
      });
    }

    // Log user details for debugging
    console.log('User details:', {
      email: user.email,
      isVerified: user.isVerified,
      status: user.status
    });

    if (user.status === 'Blocked') {
      return res.render('login', { 
        errorMessage: 'Your account has been blocked',
        successMessage: '',
        activePage: 'login'
      });
    }

    if (!user.isVerified) {
      const otp = await generateAndSaveOtp(email);
      await sendOtpEmail(email, otp);
      return res.render('verifyOtp', {
        message: 'Please verify your email first',
        successMessage: '',
        email,
        activePage: 'login'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    console.log('Password match:', isMatch);

    if (!isMatch) {
      return res.render('login', { 
        errorMessage: 'Invalid email or password',
        successMessage: '',
        activePage: 'login'
      });
    }

    // Create user token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        isAdmin: false
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.redirect('/');
  } catch (error) {
    console.error('Error in loginUser:', error);
    res.render('login', { 
      errorMessage: 'An error occurred during login',
      successMessage: '',
      activePage: 'login'
    });
  }
};


const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.render('password-reset', {
        message: 'No account found with this email',
        successMessage: '',
        activePage: 'password-reset'
      });
    }

    const otp = await generateAndSaveOtp(email);
    await sendOtpEmail(email, otp);

    res.render('verify-reset-otp', {
      message: '',
      successMessage: 'Password reset OTP sent to your email',
      email,
      activePage: 'password-reset'
    });
  } catch (error) {
    console.error('Error in requestPasswordReset:', error);
    res.render('password-reset', {
      message: 'An error occurred. Please try again',
      successMessage: '',
      activePage: 'password-reset'
    });
  }
};

const verifyPasswordResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const otpRecord = await OTP.findOne({ 
      email, 
      otp,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      return res.render('verify-reset-otp', {
        message: 'Invalid or expired OTP',
        successMessage: '',
        email,
        activePage: 'password-reset'
      });
    }

    await OTP.deleteOne({ email });

    res.render('reset-password', {
      message: '',
      successMessage: 'OTP verified successfully. Please enter your new password',
      email,
      activePage: 'password-reset'
    });
  } catch (error) {
    console.error('Error in verifyPasswordResetOtp:', error);
    res.render('verify-reset-otp', {
      message: 'An error occurred. Please try again',
      successMessage: '',
      email: req.body.email,
      activePage: 'password-reset'
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.render('reset-password', {
        message: 'Passwords do not match',
        successMessage: '',
        email,
        activePage: 'password-reset'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.render('reset-password', {
        message: 'User not found',
        successMessage: '',
        email,
        activePage: 'password-reset'
      });
    }

    user.password = password; 
    await user.save();

    res.render('login', {
      errorMessage: null,
      successMessage: 'Password reset successful. Please login with your new password',
      activePage: 'login'
    });
  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.render('user/reset-password', {
      message: 'An error occurred. Please try again',
      successMessage: '',
      email: req.body.email,
      activePage: 'password-reset'
    });
  }
};

const filterProductsByType = async (req, res) => {
  try {
    const { type } = req.query;
    const validTypes = ['veg', 'non-veg', 'vegan'];

    // Normalize the type to lowercase and check for validity
    const normalizedType = type ? type.toLowerCase() : null;

    if (!normalizedType || !validTypes.includes(normalizedType)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or missing type parameter'
      });
    }

    // Fetch products based on the type and availability
    const products = await Product.find({ 
      type: normalizedType, 
      isAvailable: true 
    }).populate('category');

    // Optionally, fetch categories to send in the response
    const categories = await Category.find();

    res.status(200).json({
      success: true,
      products,
      categories // Include categories if needed for the frontend
    });
  } catch (error) {
    console.error('Error in filterProductsByType:', error);
    res.status(500).json({
      success: false,
      message: 'Error filtering products'
    });
  }
};



const logout = async (req, res) => {
    try {
        // Clear the JWT token cookie
        res.clearCookie('token');
        
        // Handle Google OAuth logout
        if (req.session) {
            // Destroy the session
            req.session.destroy((err) => {
                if (err) {
                    console.error('Error destroying session:', err);
                }
            });
        }

        // Clear any other auth-related cookies
        res.clearCookie('connect.sid'); // Clear session cookie
        
        // Redirect to login page
        res.redirect('/login');
    } catch (error) {
        console.error('Error during logout:', error);
        res.redirect('/login');
    }
};


const getFoodDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId).populate('category');

    if (!product) {
      return res.status(404).send('Product not found');
    }

    // Fetch the user's rating for the product if authenticated
    let userRating = null;
    if (req.user) {
      const rating = product.ratings.find(r => r.user.toString() === req.user._id.toString());
      if (rating) {
        userRating = rating;  // Store the user's rating if exists
      }
    }

    // Render the product details page with the product and userRating
    res.render('foodDetails', { product, userRating });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.status(500).send('Internal Server Error');
  }
};

const rateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { rating, review } = req.body; // Get rating and optional review from the request body
    const userId = req.user._id; // Assuming `req.user` is populated by authentication middleware

    // Find the product
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).send('Product not found');
    }

    // Find if the user has already rated the product
    const existingRating = product.ratings.find(rating => rating.user.toString() === userId.toString());

    if (existingRating) {
      // Update the existing rating
      existingRating.score = parseInt(rating, 10);
      if (review) existingRating.review = review;
    } else {
      // Add a new rating
      product.ratings.push({ user: userId, score: parseInt(rating, 10), review });
      product.totalRatings += 1; // Increment the total number of ratings
    }

    // Recalculate the average rating
    const totalScore = product.ratings.reduce((sum, r) => sum + r.score, 0);
    product.averageRating = totalScore / product.ratings.length;

    // Save the updated product
    await product.save();

    // Redirect back to the product's details page
    res.redirect(`/food/${productId}`);
  } catch (error) {
    console.error('Error rating product:', error);
    res.status(500).send('Internal Server Error');
  }
};


module.exports = {
  renderLandingPage,
  renderRegisterPage,
  renderMenuPage,
  registerUser,
  verifyOtp,
  loginUser,
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPassword,
  filterProductsByType,
  getFoodDetails,
  rateProduct,
  logout
};
