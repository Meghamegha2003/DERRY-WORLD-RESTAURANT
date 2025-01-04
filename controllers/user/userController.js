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
    res.clearCookie("token");

    // Handle Google OAuth logout
    if (req.session) {
      // Destroy the session
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
      });
    }

    // Clear any other auth-related cookies
    res.clearCookie("connect.sid"); // Clear session cookie

    // Redirect to login page
    res.redirect("/login");
  } catch (error) {
    console.error("Error during logout:", error);
    res.redirect("/login");
  }
};


module.exports = {
  renderLandingPage,
  renderRegisterPage,
  resendOTP,
  registerUser,
  verifyOTP,
  loginUser,
  logout,
  renderMenuPage,
};
