const User = require("../../models/userSchema");
const OTP = require("../../models/otpSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const Cart = require("../../models/cartSchema");
require("dotenv").config();

const generateAndSaveOtp = async (email) => {
  try {
    // Delete any existing OTP for this email
    await OTP.deleteOne({ email });

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Create new OTP record with 15 minutes expiry
    const otpRecord = new OTP({
      email,
      otp,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    });

    // Save the OTP record
    await otpRecord.save();

    return otp;
  } catch (error) {
    console.error("Error generating OTP:", error);
    throw new Error("Failed to generate OTP");
  }
};

const generateAndSaveOtpNew = async (email) => {
  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Set expiry time to 15 minutes from now
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15);

  // Create new OTP document
  const newOTP = new OTP({
    email,
    otp,
    expiresAt
  });

  // Save OTP to database
  await newOTP.save();

  return otp;
};

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  },
  timeout: 10000 // 10 seconds timeout
});

// Verify transporter connection
transporter.verify(function(error, success) {
  if (error) {
    console.error('SMTP connection error:', error);
  } else {
    console.log('SMTP server is ready to send emails');
  }
});

const sendOTP = async (email, otp) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Email Verification - Derry World',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007bff; text-align: center;">Welcome to Derry World!</h2>
          <p style="font-size: 16px; line-height: 1.6;">Dear User,</p>
          <p style="font-size: 16px; line-height: 1.6;">Thank you for registering with Derry World. To complete your registration, please use the following OTP:</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p style="font-size: 16px; line-height: 1.6;">This OTP will expire in 15 minutes for security purposes.</p>
          <p style="font-size: 14px; color: #6c757d; margin-top: 30px;">If you didn't request this verification, please ignore this email.</p>
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            <p style="font-size: 14px; color: #6c757d;"> ${new Date().getFullYear()} Derry World. All rights reserved.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send OTP email. Please try again.');
  }
};

const sendOTPNew = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Email Verification - Derry World',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff; text-align: center;">Welcome to Derry World!</h2>
        <p style="font-size: 16px; line-height: 1.6;">Dear User,</p>
        <p style="font-size: 16px; line-height: 1.6;">Thank you for registering with Derry World. To complete your registration, please use the following OTP:</p>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <h1 style="color: #007bff; margin: 0; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p style="font-size: 16px; line-height: 1.6;">This OTP will expire in 15 minutes for security purposes.</p>
        <p style="font-size: 14px; color: #6c757d; margin-top: 30px;">If you didn't request this verification, please ignore this email.</p>
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
          <p style="font-size: 14px; color: #6c757d;"> ${new Date().getFullYear()} Derry World. All rights reserved.</p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

const pendingRegistrations = new Map();

const renderLandingPage = async (req, res) => {
  try {
    const categories = await Category.find();
    const categoryFilter = req.query.category || null;
    const query = categoryFilter ? { "category.name": categoryFilter } : {};

    const products = await Product.find(query).populate("category");

    const activePage = "home";

    res.render("home", { products, categories, activePage });
  } catch (error) {
    console.error("Error fetching menu data:", error);
    res.status(500).send("Internal Server Error");
  }
};

const renderRegisterPage = (req, res) => {
  if (req.user) {
    return res.redirect("/");
  }
  res.render("register", {
    message: req.query.message || "",
    successMessage: req.query.successMessage || "",
    activePage: "register",
  });
};

const resendOTP = async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      return res.status(400).json({
        success: false,
        message: "Email and token are required"
      });
    }

    try {
      // Verify the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded.isOtpVerification || decoded.email !== email) {
        return res.status(400).json({
          success: false,
          message: "Invalid token"
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token"
      });
    }

    // Check if there's a pending registration
    const pendingUser = pendingRegistrations.get(email);
    if (!pendingUser) {
      return res.status(400).json({
        success: false,
        message: "No pending registration found for this email"
      });
    }

    // Delete any existing OTP for this email
    await OTP.deleteOne({ email });

    // Generate and save new OTP
    const otp = await generateAndSaveOtp(email);
    
    // Send the new OTP
    await sendOTP(email, otp);

    // Generate a new token
    const newToken = jwt.sign(
      { email, isOtpVerification: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.status(200).json({
      success: true,
      message: "New OTP has been sent to your email",
      token: newToken
    });
  } catch (error) {
    console.error("Error in resendOTP:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again."
    });
  }
};

const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Basic validation
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }

    // Store registration data temporarily (password will be hashed by schema pre-save hook)
    pendingRegistrations.set(email, {
      name,
      email,
      phone,
      password, // Raw password - will be hashed by schema
      createdAt: new Date()
    });

    // Generate OTP first before storing data
    let otp;
    try {
      // Delete any existing OTP for this email
      await OTP.deleteOne({ email });
      
      // Generate and save new OTP
      otp = await generateAndSaveOtp(email);
    } catch (error) {
      console.error('Error generating OTP:', error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate OTP. Please try again."
      });
    }

    // Try to send OTP email
    try {
      await sendOTP(email, otp);
    } catch (error) {
      // If email fails, clean up the saved OTP
      await OTP.deleteOne({ email });
      console.error('Error sending OTP:', error);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email. Please try again or contact support."
      });
    }

    // Generate a temporary token for OTP verification
    const token = jwt.sign(
      { email, isOtpVerification: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }  // Increased from 15m to 1h
    );

    return res.status(200).json({
      success: true,
      message: "Registration initiated. Please verify your email with OTP.",
      redirectUrl: `/verify-otp?token=${token}`
    });
  } catch (error) {
    console.error("Error in registerUser:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again."
    });
  }
};

const renderVerifyOtp = async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.redirect('/register?error=No verification token provided');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded.isOtpVerification) {
        return res.redirect('/register?error=Invalid verification token');
      }

      res.render('verifyOtp', {
        email: decoded.email,
        message: '',
        successMessage: 'Please enter the OTP sent to your email.',
        activePage: 'register'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        // Generate a new token and OTP
        const email = jwt.decode(token).email;
        const newOtp = await generateAndSaveOtp(email);
        
        // Send new OTP email
        await sendOTP(email, newOtp);
        
        // Generate new token with longer expiration
        const newToken = jwt.sign(
          { email, isOtpVerification: true },
          process.env.JWT_SECRET,
          { expiresIn: '1h' } // Increased to 1 hour
        );
        
        return res.redirect(`/verify-otp?token=${newToken}&message=New OTP has been sent`);
      }
      
      console.error('Token verification failed:', error);
      return res.redirect('/register?error=Token verification failed');
    }
  } catch (error) {
    console.error('Error in renderVerifyOtp:', error);
    res.redirect('/register?error=An error occurred');
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email, otp, token } = req.body;

    if (!email || !otp || !token) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP and token are required"
      });
    }

    // Check if there's a pending registration
    const pendingUser = pendingRegistrations.get(email);
    if (!pendingUser) {
      return res.status(400).json({
        success: false,
        message: "No pending registration found"
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.isOtpVerification || decoded.email !== email) {
      return res.status(400).json({
        success: false,
        message: "Invalid token"
      });
    }

    // Find the OTP record
    const otpRecord = await OTP.findOne({ email });
    
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or has expired. Please request a new one."
      });
    }

    // Check if OTP has expired
    if (otpRecord.expiresAt < Date.now()) {
      await OTP.deleteOne({ email });
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one."
      });
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again."
      });
    }

    // Create the user
    const user = new User(pendingUser);
    await user.save();

    // Clean up
    pendingRegistrations.delete(email);
    await OTP.deleteOne({ email });

    return res.status(200).json({
      success: true,
      message: "Registration successful! Please login.",
      redirectUrl: "/login"
    });
  } catch (error) {
    console.error("Error in verifyOTP:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during verification. Please try again."
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password: candidatePassword } = req.body;

    // Validate input
    if (!email || !candidatePassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    // Find user by email, include password
    const user = await User.findOne({ email }).select("+password");

    // Check if user exists
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    // Check if user is blocked
    if (user.status === "Blocked") {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked"
      });
    }

    // Compare the password
    const isMatch = await user.comparePassword(candidatePassword);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    // Check if the user is an admin
    if (user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: "Admins cannot access the user home page" 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        isAdmin: false,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Set the token as an HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      redirectUrl: "/"
    });
  } catch (err) {
    console.error("Error in loginUser:", err.message);
    return res.status(500).json({ 
      success: false, 
      message: "An error occurred during login" 
    });
  }
};

const renderMenuPage = async (req, res) => {
  try {
    // Fetch all active categories
    const categories = await Category.find({ isActive: true });

    // Default values for cart
    let cartItems = [];
    let cartCount = 0;

    // Fetch user's cart and calculate total quantity if the user has a cart
    const userCart = await Cart.findOne({ user: req.user._id });
    if (userCart) {
      cartItems = userCart.items.map(item => item.product.toString());
      cartCount = userCart.items.reduce((total, item) => total + item.quantity, 0);
    }

    // Get the selected category filter from query parameters
    const categoryFilter = req.query.category || null;

    let query = { isAvailable: true };

    // If a category filter is selected, resolve its ObjectId
    if (categoryFilter) {
      const category = await Category.findOne({ name: categoryFilter, isActive: true });
      if (category) {
        query.category = category._id; // Use the ObjectId for filtering
      } else {
        // Handle case where category does not exist (optional)
        query = { isAvailable: false }; // No products will be found if category doesn't exist
      }
    }

    // Fetch filtered products based on the query
    const products = await Product.find(query).populate('category');

    // Render the menu page with products, categories, cart info, and selected category
    res.render('menu', { 
      products, 
      categories, 
      selectedCategory: categoryFilter,
      cartCount: cartCount,  // Pass cart count to the view
      activePage: 'menu'     // To highlight active menu item
    });

  } catch (error) {
    console.error('Error fetching menu data:', error);
    res.status(500).send('Internal Server Error');
  }
};

const logout = async (req, res) => {
  try {
    // Clear the JWT token cookie
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production"
    });

    // Redirect to login page
    res.redirect("/login");
  } catch (error) {
    console.error("Error during logout:", error);
    res.redirect("/login");
  }
};

const renderForgotPassword = (req, res) => {
  res.render('forgot-password', {
    message: req.query.message || '',
    successMessage: req.query.successMessage || '',
    activePage: 'forgot-password'
  });
};

const handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.render('forgot-password', {
        message: 'No account found with this email address.',
        successMessage: '',
        activePage: 'forgot-password'
      });
    }

    // Generate password reset token
    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Save reset token and expiry to user document
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset password email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <h1>Password Reset Request</h1>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.render('forgot-password', {
      message: '',
      successMessage: 'Password reset link has been sent to your email.',
      activePage: 'forgot-password'
    });

  } catch (error) {
    console.error('Error in handleForgotPassword:', error);
    res.render('forgot-password', {
      message: 'An error occurred. Please try again.',
      successMessage: '',
      activePage: 'forgot-password'
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
      return res.render('reset-password', {
        message: 'Password reset token is invalid or has expired.',
        validToken: false,
        token: null,
        activePage: 'reset-password'
      });
    }

    res.render('reset-password', {
      message: '',
      validToken: true,
      token,
      activePage: 'reset-password'
    });
  } catch (error) {
    console.error('Error in renderResetPassword:', error);
    res.render('reset-password', {
      message: 'An error occurred. Please try again.',
      validToken: false,
      token: null,
      activePage: 'reset-password'
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
      message: 'An error occurred while resetting password'
    });
  }
};

module.exports = {
  renderLandingPage,
  renderRegisterPage,
  resendOTP,
  registerUser,
  renderVerifyOtp,
  verifyOTP,
  loginUser,
  logout,
  renderMenuPage,
  renderForgotPassword,
  handleForgotPassword,
  renderResetPassword,
  handleResetPassword
};