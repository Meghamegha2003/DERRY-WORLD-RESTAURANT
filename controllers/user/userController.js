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

    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpRecord = new OTP({
      email,
      otp: otp.toString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await otpRecord.save();
    return otp;
  } catch (error) {
    console.error("Error generating OTP:", error);
    throw new Error("Failed to generate OTP");
  }
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const pendingRegistrations = new Map();

const sendOTP = async (email, otp) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is: ${otp}. It will expire in 15 minutes.`,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw new Error("Failed to send OTP email. Please try again.");
  }
};

const renderLandingPage = async (req, res) => {
  try {
    console.log('Product Model:', Product); // Debug log
    
    const categories = await Category.find();
    const categoryFilter = req.query.category || null;
    
    let query = {};
    if (categoryFilter) {
      query.category = categoryFilter;
    }

    const products = await Product.find(query)
      .populate('category')
      .sort({ createdAt: -1 })
      .lean();

    console.log('Products found:', products); // Debug log

    const activePage = "home";
    res.render("home", { 
      products, 
      categories, 
      activePage,
      user: req.user || null 
    });
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
  const { email } = req.body;

  // Check if an OTP was already generated and if it has expired
  const otpRecord = await OTP.findOne({ email });

  // If the OTP exists and it hasn't expired, resend the same OTP
  if (otpRecord && otpRecord.expiresAt > Date.now()) {
    return res
      .status(200)
      .json({ message: "OTP is still valid. Please check your email." });
  }

  // If OTP is expired or doesn't exist, generate a new OTP
  const otp = generateAndSaveOtp();
  const newOtpRecord = new OTP({
    email,
    otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Set new expiration time
  });

  await newOtpRecord.save();
  await sendOTP(email, otp); // Send new OTP

  res.status(200).json({ message: "OTP sent successfully!" });
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone } = req.body;

    if (!name || !email || !password || !confirmPassword || !phone) {
      return res.render("register", {
        message: "All fields are required",
        successMessage: "",
        activePage: "register",
      });
    }

    if (password !== confirmPassword) {
      return res.render("register", {
        message: "Passwords do not match",
        successMessage: "",
        activePage: "register",
      });
    }

    if (password.length < 6) {
      return res.render("register", {
        message: "Password must be at least 6 characters long",
        successMessage: "",
        activePage: "register",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("register", {
        message: "Email is already registered",
        successMessage: "",
        activePage: "register",
      });
    }

    // Store user data in temporary storage
    pendingRegistrations.set(email, {
      name,
      email,
      phone,
      password, // Will be hashed by the pre-save middleware
      roles: ["user"],
      status: "Active",
    });

    const otp = await generateAndSaveOtp(email);
    await sendOTP(email, otp);
    console.log(otp);

    res.render("verifyOtp", {
      message: "",
      successMessage: "Please verify your email to complete registration.",
      email,
      activePage: "register",
    });
  } catch (error) {
    console.error("Error in registerUser:", error);
    const errorMessage =
      error.message || "An error occurred during registration";
    res.render("register", {
      message: errorMessage,
      successMessage: "",
      activePage: "register",
    });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { otp, email } = req.body;
    console.log("Verifying OTP for email:", email);

    const otpRecord = await OTP.findOne({
      email,
      otp,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      console.log("Invalid or expired OTP for:", email);
      return res.render("verifyOtp", {
        message: "Invalid or expired OTP",
        successMessage: "",
        email,
        activePage: "register",
      });
    }

    // Get pending registration data
    const pendingUser = pendingRegistrations.get(email);
    console.log("Pending registration found:", pendingUser ? "Yes" : "No");

    if (!pendingUser) {
      console.log("No pending registration found for:", email);
      return res.render("verifyOtp", {
        message: "Registration data not found. Please register again.",
        successMessage: "",
        email,
        activePage: "register",
      });
    }

    try {
      // Create and save the user
      const newUser = new User({
        name: pendingUser.name,
        email: pendingUser.email,
        password: pendingUser.password,
        phone: pendingUser.phone,
        roles: ["user"],
        status: "Active",
        isVerified: true,
      });

      console.log("Attempting to save new user:", newUser.email);
      await newUser.save();
      console.log("User saved successfully");

      // Clear temporary data
      pendingRegistrations.delete(email);
      await OTP.deleteOne({ email });

      // Double check if user was actually saved
      const savedUser = await User.findOne({ email });
      console.log(
        "Verification - User exists in DB:",
        savedUser ? "Yes" : "No"
      );

      if (!savedUser) {
        console.log("Error: User was not saved properly");
        throw new Error("Failed to save user");
      }

      // Redirect to login page with success message
      return res.redirect(
        "/login?successMessage=" +
          encodeURIComponent(
            "Registration completed successfully! Please login to continue."
          )
      );
    } catch (saveError) {
      console.error("Error saving user:", saveError);
      return res.render("verifyOtp", {
        message: "Error creating user account. Please try again.",
        successMessage: "",
        email,
        activePage: "register",
      });
    }
  } catch (error) {
    console.error("Error in verifyOtp:", error);
    res.render("verifyOtp", {
      message: "An error occurred during verification",
      successMessage: "",
      email: req.body.email,
      activePage: "register",
    });
  }
};


const loginUser = async (req, res) => {
  try {
    const { email, password: candidatePassword } = req.body;

    // Validate input
    if (!email || !candidatePassword) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user by email, include password
    const user = await User.findOne({ email }).select("+password");

    // Check if user exists
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user is blocked
    if (user.status === "Blocked") {
      return res.render("login", {
        errorMessage: "Your account has been blocked",
        successMessage: "",
        activePage: "login",
      });
    }

    // Compare the password
    const isMatch = await user.comparePassword(candidatePassword);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if the user is an admin
    if (user.isAdmin) {
      return res
        .status(403)
        .json({ error: "Admins cannot access the user home page" });
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

    // User login successful, redirect to home page
    res.redirect("/");
  } catch (err) {
    console.error("Error in loginUser:", err.message);
    return res.status(500).json({ error: "An error occurred during login" });
  }
};

const renderMenuPage = async (req, res) => {
  try {
    // Get the category filter from query params
    const categoryName = req.query.category;
    
    // Fetch all active categories
    const categories = await Category.find({ isActive: true }).lean();

    // Build the product query
    let productQuery = { isAvailable: true };
    
    // If category is specified, find the category and add it to the query
    if (categoryName) {
      const category = await Category.findOne({ name: categoryName });
      if (category) {
        productQuery.category = category._id;
      }
    }

    // Fetch products with populated category
    const products = await Product.find(productQuery)
      .populate('category')
      .sort({ createdAt: -1 })
      .lean();

    // Get cart count if user is logged in
    let cartCount = 0;
    if (req.user) {
      const cart = await Cart.findOne({ user: req.user._id });
      if (cart) {
        cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
      }
    }

    // Render the menu page with data
    res.render('menu', {
      products,
      categories,
      selectedCategory: categoryName,
      cartCount,
      user: req.user,
      title: 'Menu - Derry World'
    });

  } catch (error) {
    console.error('Error in renderMenuPage:', error);
    res.status(500).send('Internal Server Error');
  }
};



const logout = async (req, res) => {
  try {
    res.clearCookie('jwt');
    req.logout(() => {
      res.redirect('/login');
    });
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({ message: 'Error during logout' });
  }
};

const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.user._id;

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    const existingItem = cart.items.find(item => item.product.toString() === productId);
    if (existingItem) {
      existingItem.quantity = quantity;
    } else {
      cart.items.push({ product: productId, quantity });
    }

    await cart.save();
    res.status(200).json({ message: 'Product added to cart successfully' });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ message: 'Error adding product to cart' });
  }
};

module.exports = {
  renderLandingPage,
  renderRegisterPage,
  resendOTP,
  registerUser,
  verifyOTP,
  loginUser,
  renderMenuPage,
  logout,
  addToCart
};
