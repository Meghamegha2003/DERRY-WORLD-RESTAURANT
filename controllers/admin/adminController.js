const { Order, ORDER_STATUS } = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");

const getStatusBadgeClass = (status) => {
  switch (status) {
    case "Pending":
      return "bg-warning text-dark";
    case "Processing":
      return "bg-info text-dark";
    case "Shipped":
      return "bg-primary";
    case "Delivered":
      return "bg-success";
    case "Cancelled":
      return "bg-danger";
    case "Return Requested":
      return "bg-warning text-dark";
    case "Return Approved":
      return "bg-success";
    case "Return Rejected":
      return "bg-danger";
    default:
      return "bg-secondary";
  }
};

const getNextStatuses = (currentStatus) => {
  switch (currentStatus) {
    case "Pending":
      return ["Processing", "Cancelled"];
    case "Processing":
      return ["Shipped", "Cancelled"];
    case "Shipped":
      return ["Delivered"];
    case "Delivered":
      return ["Return Requested"];
    case "Return Requested":
      return ["Return Approved", "Return Rejected"];
    case "Return Approved":
    case "Return Rejected":
      return [];
    default:
      return [];
  }
};

const handleLoginError = (req, res, message) => {
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.status(401).json({
      success: false,
      message: message,
    });
  }
  return res.status(401).render("admin/login", {
    title: "Admin Login",
    path: "/admin/login",
    error: message,
  });
};

exports.loginPage = async (req, res) => {
  try {
    res.clearCookie("adminToken");

    res.render("admin/login", {
      title: "Admin Login",
      path: "/admin/login",
      error: null,
    });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return handleLoginError(req, res, "Email and password are required");
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      roles: { $in: ["admin"] },
    });

    const regularUser = await User.findOne({ email: email.toLowerCase() });
    
    if (!user && regularUser) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Please use the user login page."
        });
      }
      return res.redirect('/admin/login?error=' + encodeURIComponent('Access denied. Please use the user login page.'));
    } else if (!user) {
      return handleLoginError(req, res, "Invalid credentials");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return handleLoginError(req, res, "Invalid credentials");
    }

    res.clearCookie("userToken");
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        isAdmin: true,
        sessionVersion: user.sessionVersion || 0
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "strict",
    });

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(200).json({
        success: true,
        message: "Login successful",
        redirectUrl: "/admin",
      });
    }

    return res.redirect("/admin");
  } catch (error) {
    return handleLoginError(req, res, "An error occurred during login");
  }
};

exports.adminLogout = (req, res) => {
  try {
    res.clearCookie("adminToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    return res.status(200).json({ success: true, message: "Admin logged out" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Logout failed", error: error.message });
  }
};



exports.loadDashboard = async (req, res) => {
  try {
    res.render("admin/dashboard", {
      title: "Dashboard",
      admin: req.user,
      path: "/admin/dashboard",
    });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

exports.getDashboardData = async (req, res) => {
  try {
    const period = req.query.period || "weekly";
    const endDate = new Date();
    let startDate = new Date();
    let groupFormat = "%Y-%m-%d";

    switch (period) {
      case "daily":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        groupFormat = "%H:%M";
        break;

      case "weekly":
        const day = endDate.getDay();
        const diffToMonday = (day === 0 ? -6 : 1) - day;
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() + diffToMonday);
        startDate.setHours(0, 0, 0, 0);
        groupFormat = "%Y-%m-%d";
        break;

      case "monthly":
        const currMonth = endDate.getMonth();
        const currYear = endDate.getFullYear();
        startDate = new Date(currYear, currMonth - 2, 1);
        groupFormat = "%Y-%m";
        break;

      case "yearly":
        startDate = new Date(endDate.getFullYear() - 2, 0, 1);
        groupFormat = "%Y";
        break;

      default:
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        groupFormat = "%Y-%m-%d";
    }

    
    const totalOrders = await Order.countDocuments();
    const totalCustomers = await User.countDocuments({
      roles: { $in: ["user", "customer"] },
    });
    const totalProducts = await Product.countDocuments();
    const totalCategories = await Category.countDocuments();

    const ordersByStatus = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
    ]);

    const totalIncomeResult = await Order.aggregate([
      { $match: { orderStatus: { $in: ["Delivered", "Return Requested", "Return Rejected"] } } },
      { $unwind: "$items" },
      {
        $match: {
          "items.status": { $nin: ["Cancelled", "Returned", "Return Approved"] }
        }
      },
      {
        $group: {
          _id: "$_id",
          itemsTotal: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          couponDiscount: { $first: "$couponDiscount" },
          deliveryCharge: { $first: "$deliveryCharge" }
        }
      },
      {
        $project: {
          currentBalance: {
            $add: [
              { $subtract: ["$itemsTotal", { $ifNull: ["$couponDiscount", 0] }] },
              { $ifNull: ["$deliveryCharge", 0] }
            ]
          }
        }
      },
      { $group: { _id: null, total: { $sum: "$currentBalance" } } }
    ]);
    const totalIncome = totalIncomeResult[0]?.total || 0;

    const incomeResult = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: ["Delivered", "Return Requested", "Return Rejected"] },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $unwind: "$items" },
      {
        $match: {
          "items.status": { $nin: ["Cancelled", "Returned", "Return Approved"] }
        }
      },
      {
        $group: {
          _id: "$_id",
          itemsTotal: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          couponDiscount: { $first: "$couponDiscount" },
          deliveryCharge: { $first: "$deliveryCharge" }
        }
      },
      {
        $project: {
          currentBalance: {
            $add: [
              { $subtract: ["$itemsTotal", { $ifNull: ["$couponDiscount", 0] }] },
              { $ifNull: ["$deliveryCharge", 0] }
            ]
          }
        }
      },
      { $group: { _id: null, total: { $sum: "$currentBalance" } } }
    ]);
    const income = incomeResult[0]?.total || 0;

    const expenseResult = await Order.aggregate([
      {
        $match: {
          orderStatus: "Return Approved",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const expense = expenseResult[0]?.total || 0;

    const revenueData = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: ["Delivered", "Return Requested", "Return Rejected"] },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $unwind: "$items" },
      {
        $match: {
          "items.status": { $nin: ["Cancelled", "Returned", "Return Approved"] }
        }
      },
      {
        $group: {
          _id: {
            orderId: "$_id",
            date: { $dateToString: { format: groupFormat, date: "$createdAt" } }
          },
          itemsTotal: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          couponDiscount: { $first: "$couponDiscount" },
          deliveryCharge: { $first: "$deliveryCharge" }
        }
      },
      {
        $project: {
          date: "$_id.date",
          currentBalance: {
            $add: [
              { $subtract: ["$itemsTotal", { $ifNull: ["$couponDiscount", 0] }] },
              { $ifNull: ["$deliveryCharge", 0] }
            ]
          }
        }
      },
      {
        $group: {
          _id: "$date",
          revenue: { $sum: "$currentBalance" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const topProducts = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
    ]);

    const popularFood = topProducts.map((p) => ({
      name: p.product.name,
      quantity: p.totalQuantity,
    }));

    const ordersPerDay = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    
const topCategories = await Order.aggregate([
  { $unwind: "$items" },
  {
    $lookup: {
      from: "products",
      localField: "items.product",
      foreignField: "_id",
      as: "productInfo",
    },
  },
  { $unwind: "$productInfo" },
  {
    $lookup: {
      from: "categories",
      localField: "productInfo.category",
      foreignField: "_id",
      as: "categoryInfo",
    },
  },
  { $unwind: "$categoryInfo" },
  {
    $group: {
      _id: "$categoryInfo.name", 
      totalSold: { $sum: "$items.quantity" },
    },
  },
  { $sort: { totalSold: -1 } },
  { $limit: 10 },
]);


    return res.json({
      success: true,
      data: {
        stats: {
          totalOrders,
          totalCustomers,
          totalProducts,
          totalCategories,
          totalIncome,
          income,
          expense,
          popularFood,
          topCategories,
        },
        ordersByStatus,
        revenueData,
        topProducts,
        ordersPerDay,
      },
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to get dashboard data",
      });
    }
  }
};


exports.customerList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = { roles: { $in: ["user", "customer"] } };
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      const searchType = req.query.searchType || "name";

      switch (searchType) {
        case "name":
          query.name = searchRegex;
          break;
        case "email":
          query.email = searchRegex;
          break;
        case "phone":
          query.phone = searchRegex;
          break;
      }
    }

    const [customers, total] = await Promise.all([
      User.find(query)
        .select("name email phone status createdAt isActive")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      User.countDocuments(query),
    ]);

    res.render("admin/customers", {
      title: "Customers",
      path: "/admin/customers",
      customers,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalCustomers: total,
      searchQuery: req.query.search || "",
      searchType: req.query.searchType || "name",
    });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

exports.toggleCustomerStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }
    
    user.isActive = !user.isActive;
    
    if (user.isActive) {
      user.blockedAt = undefined;
      user.blockReason = undefined;
    } else {
      user.blockedAt = new Date();
      user.blockReason = 'Blocked by administrator';
    }
    
    user.sessionVersion += 1;
    
    await user.save();
    
    res.json({ 
      success: true, 
      message: `User ${user.isActive ? 'unblocked' : 'blocked'} successfully`,
      isActive: user.isActive
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user status' 
    });
  }
};
