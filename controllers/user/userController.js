const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const User= require('../../models/userSchema');
const OTP = require('../../models/otpSchema');
const Product = require('../../models/productSchema');


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
    const products = await Product.find({ isAvailable: true })
      .populate('category')
      .sort('-createdAt')
      .limit(6);
    
    res.render('home', { 
      user: req.user || null,
      products,
      message: req.query.message || '',
      successMessage: req.query.successMessage || '',
      activePage: 'home'
    });
  } catch (error) {
    console.error('Error in renderLandingPage:', error);
    res.render('home', { 
      user: null,
      products: [],
      message: 'Error loading products',
      successMessage: '',
      activePage: 'home'
    });
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
    const products = await Product.find({ isAvailable: true }).populate('category');
    res.render('menu', { 
      user: req.user || null,
      products,
      message: req.query.message || '',
      successMessage: req.query.successMessage || '',
      activePage: 'menu'
    });
  } catch (error) {
    console.error('Error in renderMenuPage:', error);
    res.render('menu', { 
      user: req.user || null,
      products: [],
      message: 'Error loading menu items',
      successMessage: '',
      activePage: 'menu'
    });
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

    // Create token and login
    const token = jwt.sign(
      { userId: user._id, email: user.email },
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
    
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or missing type parameter'
      });
    }

    const products = await Product.find({ 
      type, 
      isAvailable: true 
    }).populate('category');

    res.status(200).json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Error in filterProductsByType:', error);
    res.status(500).json({
      success: false,
      message: 'Error filtering products'
    });
  }
};



const logout = (req, res) => {
  // Clear the token cookie
  res.clearCookie('token');
  // Redirect to the landing page
  res.redirect('/');
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
  logout
};
