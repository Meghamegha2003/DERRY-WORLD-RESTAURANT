const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const HttpStatus = require('../../utils/httpStatus')
const generateReferralCode = require('../../utils/generateReferralCode');
const generateOtp = require('../../utils/generateOtp');
const {sendOtpEmail}= require('../../utils/sendOtpEmail');

const cartController = require('./cartController');
const { processReferralReward } = require('./walletController');
const { preventAuthPages } = require('../../middlewares/authMiddleware');
const User = require("../../models/userSchema");
const OTP = require("../../models/otpSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Offer = require("../../models/offerSchema");
const Wishlist = require("../../models/wishlistSchema");
const Cart = require("../../models/cartSchema");
const Rating = require("../../models/ratingSchema");
const OfferService = require('../../services/offerService');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const generateToken = (user, cartCount = 0) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      isAdmin: false,
      cartCount,
      sessionVersion: user.sessionVersion || 0
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const handleLoginError = (req, res, message, redirectUrl = '/login', errorType = 'error') => {
  if (errorType === 'admin_login_attempt') {
    message = 'Invalid email or password';
  }
  
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(HttpStatus.UNAUTHORIZED).json({
      success: false,
      message: message,
      errorType: errorType === 'admin_login_attempt' ? 'error' : errorType
    });
  }
  
  return res.status(HttpStatus.UNAUTHORIZED).render('user/login', {
    title: 'Login',
    path: '/login',
    error: message,
    errorType: errorType === 'admin_login_attempt' ? 'error' : errorType
  });
};

const getCartCount = async (userId) => {
  try {
    const cart = await Cart.findOne({ user: userId });
    return cart?.items ? new Set(
      cart.items
        .filter(item => item && item.product)
        .map(item => item.product.toString())
    ).size : 0;
  } catch (error) {
    return 0;
  }
};

exports.renderLoginPage = async (req, res) => {
  try {
    res.clearCookie('userToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'strict'
    });

    res.render('user/login', {
      title: 'Login',
      path: '/login',
      error: req.query.error || null,
      errorType: req.query.errorType || null
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('error', {
      message: 'Something went wrong',
      error: {},
      path: '/login'
    });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check for admin login attempt
    if (user.roles.includes("admin")) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Admin accounts must use the admin login page.'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      res.clearCookie("userToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/"
      });
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact support.'
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token and prepare response
    const cartCount = await getCartCount(user._id);
    const token = generateToken(user, cartCount);

    // Set the token in cookie
    res.cookie("userToken", token, {
      httpOnly: true,
      secure: false, // Set to false for development
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
      sameSite: 'lax'
    });
    

    // Return success response
    return res.json({
      success: true,
      message: 'Login successful',
      redirect: '/'
    });

  } catch (error) {
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'An error occurred during login. Please try again.'
    });
  }
};

exports.logoutUser = (req, res) => {
  res.clearCookie("userToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/"
  });

  res.redirect("/login");
};

exports.renderRegisterPage = async (req, res) => {
  try {
    if (req.user) {
      return res.redirect("/");
    }

    const sanitizeInput = (value) => {
      if (typeof value !== 'string') return '';
      return value.trim().replace(/[<>"'`]/g, '');
    };

    const name = sanitizeInput(req.query.name || '');
    const email = sanitizeInput(req.query.email || '');
    const phone = sanitizeInput(req.query.phone || '');

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
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('user/register', {
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

exports.registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, referralCode } = req.body;

    // Validate input
    if (!name || !email || !phone || !password) {
      return res.redirect(`/register?error=${encodeURIComponent('All fields are required')}&name=${encodeURIComponent(name || '')}&email=${encodeURIComponent(email || '')}&phone=${encodeURIComponent(phone || '')}`);
    }

    // Validate name format
    const nameRegex = /^[A-Za-z][A-Za-z\s]*$/;
    if (!nameRegex.test(name.trim())) {
      return res.redirect(`/register?error=${encodeURIComponent('Name must start with a letter and contain only letters and spaces')}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
    }

    // Validate email format
    const emailRegex = /^[A-Za-z][\w.-]*@([\w-]+\.)+[a-zA-Z]{2,7}$/;
    if (!emailRegex.test(email.toLowerCase())) {
      return res.redirect(`/register?error=${encodeURIComponent('Please enter a valid email address')}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
    }

    // Validate phone format
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.redirect(`/register?error=${encodeURIComponent('Phone number must be exactly 10 digits')}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.redirect(`/register?error=${encodeURIComponent('Email already registered. Please login instead.')}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
    }

    // Check if phone already exists
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.redirect(`/register?error=${encodeURIComponent('Phone number already registered')}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
    }

    // Verify referral code if provided
    let referredBy = null;
    if (referralCode && referralCode.trim() !== '') {
      // Convert to uppercase for case-insensitive matching
      const cleanReferralCode = referralCode.trim().toUpperCase();
      
      // Check if the referral code matches the format
      const referralCodeRegex = /^[A-Z0-9]{6,10}$/;
      if (!referralCodeRegex.test(cleanReferralCode)) {
        return res.redirect(`/register?error=${encodeURIComponent('Invalid referral code format. Must be 6-10 alphanumeric characters.')}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
      }
      
      // Find the referrer
      const referrer = await User.findOne({ 
        referralCode: { $regex: new RegExp(`^${cleanReferralCode}$`, 'i') } 
      });
      
      if (!referrer) {
        return res.redirect(`/register?error=${encodeURIComponent('Referral code not found. Please check and try again.')}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
      }
      
      // Prevent self-referral
      if (email === referrer.email) {
        return res.redirect(`/register?error=${encodeURIComponent('You cannot use your own referral code')}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
      }
      
      referredBy = referrer._id;
    }

    try {
        // Generate OTP
        const otp = generateOtp();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

        // Delete any existing OTP for this email
        await OTP.deleteMany({ email: email.toLowerCase() });

        // Create new OTP record
        await OTP.create({ 
            email: email.toLowerCase(), 
            otp, 
            expiresAt,
            createdAt: new Date()
        });

        // Generate referral code for new user
        const newReferralCode = generateReferralCode();

        // Create JWT token with user data for verification
        const otpToken = jwt.sign(
            {
                purpose: 'otp_verification',
                name: name.trim(),
                email: email.toLowerCase(),
                phone,
                password, // Will be hashed later during user creation
                referralCode: newReferralCode,
                referredBy,
                timestamp: Date.now()
            },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );

        // Set OTP token in cookie with production-safe configuration
        const isProduction = process.env.NODE_ENV === 'production';
        const isSecure = req.secure || req.get('X-Forwarded-Proto') === 'https';
        
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction ? isSecure : false,
            maxAge: 30 * 60 * 1000, // 30 minutes
            path: '/',
            sameSite: isProduction ? 'none' : 'lax'
        };
        
        res.cookie('otpToken', otpToken, cookieOptions);

        // Also include the token in the redirect URL as a fallback
        const redirectUrl = `/verify-otp?token=${encodeURIComponent(otpToken)}`;
        
        
        // Send OTP email
        await sendOtpEmail(email.toLowerCase(), otp);

        // Redirect with token in URL as fallback
        res.redirect(redirectUrl);
    } catch (error) {
        return res.redirect(`/register?error=${encodeURIComponent('Registration failed. Please try again.')}`);
    }

  } catch (error) {
    return res.redirect(`/register?error=${encodeURIComponent('Registration failed. Please try again.')}`);
  }
};

exports.resendOTP = async (req, res) => {
  try {
    let otpToken = req.body.token || req.query.token || req.cookies.otpToken;
    
    if (!otpToken) {
      const errorMsg = 'Verification session expired. Please register again.';
      if (req.accepts('json')) {
        return res.status(HttpStatus.BAD_REQUEST).json({ 
          success: false, 
          message: errorMsg
        });
      }
      return res.redirect(`/register?error=${encodeURIComponent(errorMsg)}`);
    }

    let decoded;
    try {
      decoded = jwt.verify(otpToken, process.env.JWT_SECRET);
      if (decoded.purpose !== 'otp_verification') throw new Error('Invalid token purpose');
    } catch (error) {
      res.clearCookie('otpToken');
      if (req.accepts('json')) {
        return res.status(HttpStatus.BAD_REQUEST).json({ 
          success: false, 
          message: 'Verification session expired. Please register again.' 
        });
      }
      return res.redirect('/register?error=' + encodeURIComponent('Verification session expired. Please register again.'));
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

    await OTP.deleteMany({ email: decoded.email });
    await OTP.create({ 
      email: decoded.email, 
      otp, 
      expiresAt,
      createdAt: new Date()
    });
    

    await sendOtpEmail(decoded.email, otp);

    const newToken = jwt.sign(
      { 
        name: decoded.name,
        email: decoded.email,
        phone: decoded.phone,
        password: decoded.password,
        referralCode: decoded.referralCode,
        referredBy: decoded.referredBy,
        purpose: 'otp_verification',
        timestamp: Date.now()
      },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );

    // Set cookie with production-safe configuration for resend
    const isProduction = process.env.NODE_ENV === 'production';
    const isSecure = req.secure || req.get('X-Forwarded-Proto') === 'https';
    
    const resendCookieOptions = {
        httpOnly: true,
        secure: isProduction ? isSecure : false,
        maxAge: 30 * 60 * 1000, // 30 minutes
        path: '/',
        sameSite: isProduction ? 'none' : 'lax'
    };
    
    res.cookie('otpToken', newToken, resendCookieOptions);

    const responseData = {
      success: true, 
      message: 'New OTP sent successfully to your email',
      token: newToken 
    };

    if (req.accepts('json')) {
      return res.json(responseData);
    }

    return res.redirect(`/verify-otp?token=${encodeURIComponent(newToken)}&message=${encodeURIComponent('New OTP sent successfully to your email')}`);

  } catch (error) {
    const errorMsg = error.message || 'Failed to resend OTP. Please try again.';
    
    if (req.accepts('json')) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
        success: false, 
        message: errorMsg
      });
    }
    
    const redirectUrl = req.cookies.otpToken || req.body.token || req.query.token
      ? `/verify-otp?token=${encodeURIComponent(req.cookies.otpToken || req.body.token || req.query.token)}&error=${encodeURIComponent(errorMsg)}`
      : `/register?error=${encodeURIComponent(errorMsg)}`;
      
    return res.redirect(redirectUrl);
  }
};

exports.renderVerifyOtpPage = async (req, res) => {
  try {
    const tokenFromUrl = req.query.token;
    const tokenFromCookie = req.cookies.otpToken;
    
    const otpToken = tokenFromUrl || tokenFromCookie;
    
    if (!otpToken) {
      return res.redirect('/register?error=' + encodeURIComponent('Verification session expired. Please register again.'));
    }
    
    let decoded;
    try {
      decoded = jwt.verify(otpToken, process.env.JWT_SECRET);
      
      if (decoded.purpose !== 'otp_verification') throw new Error('Invalid token purpose');
      
      if (tokenFromUrl && !tokenFromCookie) {
        const isProduction = process.env.NODE_ENV === 'production';
        const isSecure = req.secure || req.get('X-Forwarded-Proto') === 'https';
        
        const pageRenderCookieOptions = {
            httpOnly: true,
            secure: isProduction ? isSecure : false,
            maxAge: 30 * 60 * 1000, // 30 minutes
            path: '/',
            sameSite: isProduction ? 'none' : 'lax'
        };
        
        res.cookie('otpToken', otpToken, pageRenderCookieOptions);
      }
    } catch (error) {
      res.clearCookie('otpToken');
      return res.redirect('/register?error=' + encodeURIComponent('Verification session expired. Please register again.'));
    }
    

    res.render('user/verify-otp', {
      title: 'Verify OTP',
      email: decoded.email,
      token: otpToken, 
      error: req.query.error || null,
      message: req.query.message || null
    });
  } catch (error) {
    res.redirect('/register?error=' + encodeURIComponent('Something went wrong. Please try again.'));
  }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { otp, token: tokenFromBody } = req.body;
        
        const otpToken = tokenFromBody || req.query.token || req.cookies.otpToken;
        
        if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
            const errorMsg = 'Please enter a valid 6-digit OTP';
            
            if (req.accepts('json')) {
                return res.status(HttpStatus.BAD_REQUEST).json({ 
                    success: false, 
                    message: errorMsg 
                });
            }
            return res.status(HttpStatus.BAD_REQUEST).render('user/verify-otp', {
                title: 'Verify OTP',
                error: errorMsg,
                token: otpToken
            });
        }
        
        if (!otpToken) {
            const errorMsg = 'Verification session expired. Please register again.';
            
            if (req.accepts('json')) {
                return res.status(HttpStatus.BAD_REQUEST).json({ 
                    success: false, 
                    message: errorMsg 
                });
            }
            return res.redirect(`/register?error=${encodeURIComponent(errorMsg)}`);
        }
        
        let decoded;
        try {
            decoded = jwt.verify(otpToken, process.env.JWT_SECRET, { ignoreExpiration: false });
            
            if (decoded.purpose !== 'otp_verification') {
                const errorMsg = 'Invalid verification request. Please try again.';
                
                if (req.accepts('json')) {
                    return res.status(HttpStatus.BAD_REQUEST).json({ 
                        success: false, 
                        message: errorMsg 
                    });
                }
                return res.status(HttpStatus.BAD_REQUEST).render('user/verify-otp', {
                    title: 'Verify OTP',
                    error: errorMsg,
                    token: otpToken
                });
            }
            
        } catch (error) {
            const errorMsg = 'Verification session expired. Please register again.';
            
            res.clearCookie('otpToken', {
                path: '/',
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
            });
            
            if (req.accepts('json')) {
                return res.status(HttpStatus.BAD_REQUEST).json({ 
                    success: false, 
                    message: errorMsg 
                });
            }
            return res.redirect(`/register?error=${encodeURIComponent(errorMsg)}`);
        }
        
        const otpRecord = await OTP.findOne({
            email: { $regex: new RegExp(`^${decoded.email}$`, 'i') },
            otp: otp,
            expiresAt: { $gt: new Date() }
        });
        
        if (!otpRecord) {
            const errorMsg = 'Invalid or expired OTP. Please try again.';
            
            if (req.accepts('json')) {
                return res.status(HttpStatus.BAD_REQUEST).json({ 
                    success: false, 
                    message: errorMsg 
                });
            }
            
            return res.status(HttpStatus.BAD_REQUEST).render('user/verify-otp', {
                title: 'Verify OTP',
                error: errorMsg,
                token: otpToken,
                email: decoded.email
            });
        }
        
        await OTP.deleteOne({ _id: otpRecord._id });

    const userData = decoded;
    if (userData.name) {
      try {
        const newUser = new User({
          name: userData.name,
          email: userData.email.toLowerCase(),
          phone: userData.phone,
          password: userData.password, 
          referralCode: userData.referralCode,
          referredBy: userData.referredBy,
          isVerified: true,
          isActive: true
        });
        
        await newUser.save();
        
        
        if (userData.referredBy) {
          try {
            await processReferralReward(userData.referredBy, newUser._id);
          } catch (referralError) {
          }
        }
        
        res.clearCookie('otpToken', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
        });
        
        exports.sendWelcomeEmail(userData.email, userData.name)
          .catch(emailError => {
            // Email sending failed, but continue with registration
          });
        
        if (req.accepts('json')) {
          return res.json({ 
            success: true, 
            message: 'Registration successful! You can now log in.',
            redirectUrl: '/login?message=' + encodeURIComponent('Registration successful! Please log in.')
          });
        }
        
        return res.redirect('/login?message=' + encodeURIComponent('Registration successful! Please log in.'));
        
      } catch (error) {
        const errorMsg = 'Failed to create user. Please try again.';
        
        if (req.accepts('json')) {
          return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: errorMsg 
          });
        }
        
        return res.redirect(`/register?error=${encodeURIComponent(errorMsg)}`);
      }
    } else {
      res.clearCookie('otpToken', {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });
      return res.redirect('/login?message=' + encodeURIComponent('Verification successful. Please login to continue.'));
    }

  } catch (error) {
    return res.redirect('/verify-otp?error=' + encodeURIComponent('Verification failed. Please try again.'));
  }
};

exports.renderForgotPassword = async (req, res) => {
  res.render('user/forgot-password', {
    message: req.query.message || '',
    successMessage: req.query.successMessage || '',
    activePage: 'forgot-password',
    error: null,
    path: '/forgot-password'
  });
};

exports.handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'No account found with that email address.' });
      }
      return res.render('user/forgot-password', {
        message: 'No account found with that email address.',
        successMessage: '',
        activePage: 'forgot-password',
        error: null,
        path: '/forgot-password'
      });
    }

    const passwordResetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    user.resetPasswordToken = passwordResetToken;
    user.resetPasswordExpires = Date.now() + 3600000; 
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
      return res.status(HttpStatus.OK).json({ success: true, message: 'Password reset link has been sent to your email.' });
    }
    res.render('user/forgot-password', {
      message: '',
      successMessage: 'Password reset link has been sent to your email.',
      activePage: 'forgot-password',
      error: null,
      path: '/forgot-password'
    });

  } catch (error) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: 'An error occurred while processing your request.' });
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

exports.googleCallback = async (req, res) => {
  try {
    if (!req.user) throw new Error('No user data from Google');

    const { id, email, displayName, picture } = req.user;
    if (!email) {
      res.setMessage('error', 'Email access is required for Google login');
      return res.redirect('/login');
    }

    let user = await User.findOne({ email });
    let newUserCreated = false;

    if (!user) {
      user = new User({
        name: displayName,
        email,
        googleId: id,
        profilePicture: picture,
        isVerified: true,
        password: crypto.randomBytes(20).toString('hex'),
        referralCode: generateReferralCode()
      });
      await user.save();
      newUserCreated = true;
    } else if (!user.googleId) {
      user.googleId = id;
      user.profilePicture = picture;
      await user.save();
    }

    const cartCount = await getCartCount(user._id);
    const token = generateToken(user, cartCount);

    res.cookie('userToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    const flashMessage = newUserCreated ? 'Account created successfully with Google' : 'Welcome back!';
    res.cookie('flash', JSON.stringify({ type: 'success', message: flashMessage }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 5000
    });

    res.redirect('/');
  } catch (error) {
    res.setMessage('error', 'Failed to authenticate with Google');
    res.redirect('/login');
  }
};


// Profile Controllers
exports.updateUserProfile = async (req, res) => {
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
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Render home page
exports.renderHomePage = async (req, res) => {
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
      isBlocked: false,
      quantity: { $gt: 0 } // Only include products with quantity > 0
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
      .sort({ createdAt: -1 }) // Sort by newest first
      .limit(8) // Limit to 8 products
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

    const cartCount = req.user ? await exports.getCartCount(req.user._id) : 0;

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
    res.setMessage('error', 'Failed to load home page');
    res.redirect('/menu');
  }
};


// Render about page
exports.renderAboutPage = async (req, res) => {
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
    res.setMessage('error', 'Failed to load about page');
    res.redirect('/');
  }
};

// Render contact page
exports.renderContactPage = async (req, res) => {
    try {
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
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('error', { 
            message: 'Error loading contact page',
            error: process.env.NODE_ENV === 'development' ? error : {},
            cartCount: 0,
            user: null
        });
    }
};

// Address Controllers
exports.getAddresses = async (req, res) => {
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
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error fetching addresses'
    });
  }
};

exports.addAddress = async (req, res) => {
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
        message: 'Invalid address type. Must be one of: Home, Work, Other'
      });
    }

    // Check if address already exists
    const existingUser = await User.findOne({
      _id: req.user._id,
      'addresses': {
        $elemMatch: {
          addressLine1: addressLine1,
          city: city,
          pincode: pincode
        }
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'This address already exists in your address book'
      });
    }

    // Get current address count to determine if this is the first address
    const user = await User.findById(req.user._id);
    const isFirstAddress = user.addresses.length === 0;

    // Create new address object
    const newAddress = {
      fullName,
      phone,
      addressLine1,
      addressLine2: addressLine2 || '',
      city,
      state,
      pincode,
      addressType,
      isDefault: isFirstAddress
    };

    // Update the user's addresses array directly using findByIdAndUpdate
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { 
        $push: { 
          addresses: newAddress 
        } 
      },
      { new: true, runValidators: true }
    );

    // If this is the first address, make it default
    if (isFirstAddress) {
      await User.updateOne(
        { _id: req.user._id },
        { $set: { 'addresses.0.isDefault': true } }
      );
      newAddress.isDefault = true;
    }

    // Get the newly added address
    const addedAddress = updatedUser.addresses.find(addr => 
      addr.addressLine1 === addressLine1 && 
      addr.city === city && 
      addr.pincode === pincode
    );

    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      address: addedAddress || newAddress
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Error adding address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.updateAddress = async (req, res) => {
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
        message: 'Invalid address type. Must be one of: Home, Work, Other'
      });
    }

    // Validate phone number (10 digits)
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must be 10 digits'
      });
    }

    // Validate pincode (6 digits)
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'PIN code must be 6 digits'
      });
    }

    // Check if the address exists and belongs to the user
    const user = await User.findOne({
      _id: req.user._id,
      'addresses._id': id
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Address not found or does not belong to user'
      });
    }

    // Check for duplicate address (excluding current address)
    const isDuplicate = user.addresses.some(addr => 
      addr._id.toString() !== id &&
      addr.addressLine1 === addressLine1 &&
      addr.city === city &&
      addr.pincode === pincode
    );

    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: 'This address already exists in your address book'
      });
    }

    // Prepare the update object
    const updateObj = {
      'addresses.$.fullName': fullName,
      'addresses.$.phone': phone,
      'addresses.$.addressLine1': addressLine1,
      'addresses.$.addressLine2': addressLine2 || '',
      'addresses.$.city': city,
      'addresses.$.state': state,
      'addresses.$.pincode': pincode,
      'addresses.$.addressType': addressType,
      'addresses.$.updatedAt': new Date()
    };

    // Update the address directly in the database
    const result = await User.findOneAndUpdate(
      { 
        _id: req.user._id,
        'addresses._id': id 
      },
      { $set: updateObj },
      { new: true, runValidators: true }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Failed to update address'
      });
    }

    // Find the updated address to return
    const updatedAddress = result.addresses.find(addr => addr._id.toString() === id);

    res.json({
      success: true,
      message: 'Address updated successfully',
      address: updatedAddress
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Error updating address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: 'Address ID is required'
      });
    }

    // Use findByIdAndUpdate with $pull to remove the address without triggering wishlist validation
    const result = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { addresses: { _id: addressId } } },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'User not found or address not found'
      });
    }

    // Check if the address was actually removed
    const addressExists = result.addresses.some(addr => 
      addr._id.toString() === addressId
    );

    if (addressExists) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Error deleting address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

//handle offer
exports.applyOffersToProducts = async (products) => {
  for (const product of products) {
    const basePrice = (product.salesPrice && product.salesPrice < product.regularPrice) 
      ? product.salesPrice 
      : product.regularPrice;

    if (!product.category || !product.category._id) {
      continue;
    }

    const productOffer = await Offer.findOne({
      isActive: true,
      type: 'product',
      product: product._id,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    const categoryOffer = await Offer.findOne({
      isActive: true,
      type: 'category',
      category: product.category._id,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    let bestOffer = null;
    let bestDiscount = 0;

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




exports.renderResetPassword = async (req, res) => {
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
    res.render('user/reset-password', {
      message: 'An error occurred. Please try again.',
      validToken: false,
      token: null,
      path: '/reset-password'
    });
  }
};

exports.handleResetPassword = async (req, res) => {
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
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'An error occurred while resetting password',
      error: error
    });
  }
};

exports.renderProfilePage = async (req, res) => {
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
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('error', {
      message: 'Error fetching profile',
      error: process.env.NODE_ENV === 'development' ? error : {},
      cartCount: 0
    });
  }
};



exports.changePassword = async (req, res) => {
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
      return res.status(HttpStatus.UNAUTHORIZED).json({
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
      return res.status(400).json({
        success: false,
        message: error.errors.password.message
      });
    }
    if (error.message.includes('Cannot read properties of undefined (reading options)')) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to change password due to internal error. Please contact support.'
      });
    } else {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error changing password',
        error: error && error.message ? error.message : error
      });
    }
  }
};

exports.verifyReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        error: 'Referral code is required'
      });
    }

    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });

    if (!referrer) {
      return res.status(404).json({
        success: false,
        error: 'Invalid referral code'
      });
    }

    res.json({
      success: true,
      message: 'Valid referral code',
      referrer: {
        name: referrer.name
      },
      rewards: {
        newUser: '₹100',
        referrer: '₹50'
      }
    });

  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to verify referral code'
    });
  }
};

exports.sendWelcomeEmail = async (email, name) => {
  try {
    // Create a test account for development
    const testAccount = await nodemailer.createTestAccount();

    // Create reusable transporter object using the default SMTP transport
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user, // generated ethereal user
        pass: testAccount.pass, // generated ethereal password
      },
    });

    // Send mail with defined transport object
    const info = await transporter.sendMail({
      from: '"Derry World" <welcome@derryworld.com>', // sender address
      to: email, // list of receivers
      subject: 'Welcome to Derry World!', // Subject line
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333;">Welcome to Derry World, ${name}!</h2>
          <p>Thank you for registering with us. We're excited to have you on board!</p>
          <p>Start exploring our delicious menu and place your first order today.</p>
          <p>If you have any questions, feel free to contact our support team.</p>
          <p>Best regards,<br>The Derry World Team</p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    return false;
  }
};

exports.sendOTPEmail = async (email, otp) => {
  try {
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

exports.generateAndSaveOtp = async (email) => {
  try {
    await OTP.deleteMany({ email });
   

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
    const newOTP = new OTP({
      email,
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry
    });
    await newOTP.save();
    

    await sendOTPEmail(email, otp);

    return { otp };
  } catch (error) {
    
    throw error;
  }
};

exports.getCartCount = async (userId) => {
  try {
    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.items) return 0;
    // Count unique products, not total quantities
    return new Set(
      cart.items
        .filter(item => item && item.product)
        .map(item => item.product.toString())
    ).size;
  } catch (error) {
    return 0;
  }
};



exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
       
        if (!email) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    message: 'Please provide your email address'
                });
            }
            res.setMessage('error', 'Please provide your email address');
            return res.redirect('/forgot-password');
        }

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

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

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
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'An error occurred while processing your request'
            });
        }
        res.setMessage('error', 'An error occurred while processing your request');
        res.redirect('/forgot-password');
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        

        if (!password || password.length < 6) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    message: 'Please provide a valid password (minimum 6 characters)'
                });
            }
            res.setMessage('error', 'Please provide a valid password (minimum 6 characters)');
            return res.redirect(`/reset-password/${token}`);
        }

        const resetTokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken: resetTokenHash,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    message: 'Password reset link is invalid or has expired'
                });
            }
            res.setMessage('error', 'Password reset link is invalid or has expired');
            return res.redirect('/forgot-password');
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        

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
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'An error occurred while resetting your password'
            });
        }
        res.setMessage('error', 'An error occurred while resetting your password');
        res.redirect('/forgot-password');
    }
};

exports.renderForgotPasswordPage = async (req, res) => {
    res.render('user/forgot-password');
};

exports.renderResetPasswordPage = async (req, res) => {
    res.render('user/reset-password', { token: req.params.token });
};

exports.handleContactForm = async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;

        if (!name || !email || !phone || !message) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Please fill in all required fields'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        if (!/^\d{10}$/.test(phone)) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: 'Please enter a valid 10-digit phone number'
            });
        }
       
        res.json({
            success: true,
            message: 'Thank you for your message. We will get back to you soon!'
        });
    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'An error occurred. Please try again.'
        });
    }
};
