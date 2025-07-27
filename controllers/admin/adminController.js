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
    console.error("Error loading login page:", error);
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

    if (!user) {
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
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
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
    console.error("Admin login error:", error);
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

    // Basic stats
    const totalOrders = await Order.countDocuments();
    const totalCustomers = await User.countDocuments({
      roles: { $in: ["user", "customer"] },
    });
    const totalProducts = await Product.countDocuments();
    const totalCategories = await Category.countDocuments();

    // Orders by status (filtered by selected period)
    const ordersByStatus = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
    ]);

    // Total income
    const totalIncomeResult = await Order.aggregate([
      { $match: { orderStatus: "Delivered" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const totalIncome = totalIncomeResult[0]?.total || 0;

    // Income for selected period
    const incomeResult = await Order.aggregate([
      {
        $match: {
          orderStatus: "Delivered",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const income = incomeResult[0]?.total || 0;

    // Expense
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

    // Revenue chart
    const revenueData = await Order.aggregate([
      {
        $match: {
          orderStatus: "Delivered",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$createdAt" } },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Top products (popular food)
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

    // Orders per day
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

    
   // Top categories (with name)
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
      _id: "$categoryInfo.name", // ✅ category name, not ID
      totalSold: { $sum: "$items.quantity" },
    },
  },
  { $sort: { totalSold: -1 } },
  { $limit: 10 },
]);


    // ✅ FINAL SINGLE RESPONSE (ONLY ONCE!)
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
    console.error("Error getting dashboard data:", error);
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
    console.error("Error loading customer list:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.blockCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(
      id,
      { 
        isActive: false,
        blockedAt: new Date(),
        blockReason: 'Blocked by administrator'
      },
      { new: true }
    );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Invalidate all active sessions for this user
    await User.findByIdAndUpdate(id, { $inc: { sessionVersion: 1 } });

    res.json({ success: true, message: "User blocked successfully" });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.unblockCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true }
    );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User unblocked successfully" });
  } catch (error) {
    console.error("Error unblocking customer:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.exportCustomerData = async (req, res) => {
  try {
    const customers = await User.find({}, "-password");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customers");

    worksheet.columns = [
      { header: "Name", key: "name" },
      { header: "Email", key: "email" },
      { header: "Phone", key: "phone" },
      { header: "Status", key: "status" },
      { header: "Joined Date", key: "createdAt" },
    ];

    customers.forEach((customer) => {
      worksheet.addRow({
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        createdAt: customer.createdAt.toLocaleDateString(),
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=customers.xlsx");
    await workbook.xlsx.write(res).then(() => {
      console.log("Excel file successfully written and response ended.");
      res.end();
    });
  } catch (error) {
    console.error("Error exporting customer data:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


