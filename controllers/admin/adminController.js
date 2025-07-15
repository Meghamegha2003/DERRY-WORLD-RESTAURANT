const mongoose = require("mongoose");
const { Order, ORDER_STATUS } = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

// Helper function to get badge class based on status
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

// Helper function to get next possible statuses
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

// Helper function to handle login errors
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

// Login page
const loginPage = async (req, res) => {
  try {
    // Clear any existing admin token
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

// Admin login
const loginAdmin = async (req, res) => {
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

const logoutAdmin = async (req, res) => {
  try {
    res.clearCookie("adminToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    if (
      req.xhr ||
      req.headers.accept?.includes("application/json") ||
      req.headers["content-type"] === "application/json" ||
      req.headers.accept === "*/*"
    ) {
      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    }
    return res.redirect("/admin/login");
  } catch (error) {
    console.error("Error during admin logout:", error);
    if (
      req.xhr ||
      req.headers.accept?.includes("application/json") ||
      req.headers["content-type"] === "application/json" ||
      req.headers.accept === "*/*"
    ) {
      return res.status(500).json({
        success: false,
        message: "Error during logout",
      });
    }
    return res.redirect("/admin/login");
  }
};

// Customer list
const customerList = async (req, res) => {
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

// Get return details
const getReturnDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, data: order.returnDetails });
  } catch (error) {
    console.error("Error getting return details:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Update customer status
const updateCustomerStatus = async (req, res) => {
  try {
    const { userId, status } = req.body;
    const user = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "User status updated successfully" });
  } catch (error) {
    console.error("Error updating customer status:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get customer details
const getCustomerDetails = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    console.error("Error getting customer details:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Export customer data
const exportCustomerData = async (req, res) => {
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

// Search customers
const searchCustomers = async (req, res) => {
  try {
    const { query } = req.query;
    const customers = await User.find(
      {
        $or: [
          { name: { $regex: query, $options: "i" } },
          { email: { $regex: query, $options: "i" } },
          { phone: { $regex: query, $options: "i" } },
        ],
      },
      "-password"
    );
    res.json({ success: true, data: customers });
  } catch (error) {
    console.error("Error searching customers:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Search orders
const searchOrders = async (req, res) => {
  try {
    const { query, status } = req.query;
    const searchQuery = {};

    // Add status filter if provided
    if (status && status !== "all") {
      searchQuery.orderStatus = status;
    }

    // Add search criteria
    if (query) {
      const searchRegex = new RegExp(query, "i");
      searchQuery.$or = [
        { _id: { $regex: searchRegex } },
        { "user.name": { $regex: searchRegex } },
        { "user.email": { $regex: searchRegex } },
        { paymentMethod: { $regex: searchRegex } },
      ];
    }

    const orders = await Order.find(searchQuery)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: orders,
      getStatusBadgeClass: (status) => getStatusBadgeClass(status),
    });
  } catch (error) {
    console.error("Error searching orders:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// General search across all entities
// const generalSearch = async (req, res) => {
//     try {
//         const { query, type } = req.query;
//         let results = [];

//         switch (type) {
//             case 'customers':
//                 results = await searchCustomers(req, res);
//                 break;
//             case 'orders':
//                 results = await searchOrders(req, res);
//                 break;
//             default:
//                 const [customers, orders] = await Promise.all([
//                     searchCustomers(req, res),
//                     searchOrders(req, res)
//                 ]);
//                 results = { customers, orders };
//         }

//         res.json({ success: true, data: results });
//     } catch (error) {
//         console.error('Error in general search:', error);
//         res.status(500).json({ success: false, message: 'Internal server error' });
//     }
// };

// Check order statuses
const checkOrderStatuses = async (req, res) => {
  try {
    const orders = await Order.find({
      orderStatus: { $in: ["Processing", "Shipped"] },
    }).populate("user", "name email");

    res.json({ success: true, data: orders });
  } catch (error) {
    console.error("Error checking order statuses:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Edit customer
const editCustomer = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    delete updates.password;
    delete updates.roles;

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error("Error editing customer:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Update order status
const updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status, reason } = req.body;

    console.log("Updating order status:", { orderId, status, reason });

    if (!orderId || !status) {
      return res.status(400).json({
        success: false,
        message: "Order ID and status are required",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const allowedTransitions = {
      Pending: ["Processing", "Cancelled"],
      Processing: ["Shipped", "Cancelled"],
      Shipped: ["Delivered"],
      Delivered: ["Return Requested"],
      "Return Requested": ["Return Approved", "Return Rejected"],
      "Return Approved": [],
      "Return Rejected": [],
      Cancelled: [],
    };

    const allowedNextStatuses = allowedTransitions[order.orderStatus] || [];
    if (!allowedNextStatuses.includes(status) && status !== order.orderStatus) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${order.orderStatus} to ${status}`,
      });
    }

    order.orderStatus = status;

    order.items.forEach((item) => {
      if (!item.regularPrice) {
        item.regularPrice = item.price;
      }

      switch (status) {
        case "Cancelled":
          item.status = "Cancelled";
          break;
        case "Return Approved":
          item.status = "Returned";
          break;
        default:
          item.status = "Active";
      }
    });

    if (reason) {
      switch (status) {
        case "Cancelled":
          order.cancelReason = reason;
          break;
        case "Return Requested":
          order.returnReason = reason;
          break;
        case "Return Rejected":
          order.returnRejectionReason = reason;
          break;
      }
    }

    if (status === "Delivered") {
      if (order.paymentMethod === "cod") {
        order.paymentStatus = "Paid";
      }
    } else if (status === "Return Approved") {
      order.paymentStatus = "Refunded";
    }

    await order.save();
    console.log("Order status updated successfully:", order);

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      order: {
        id: order._id,
        status: order.orderStatus,
        paymentStatus: order.paymentStatus,
        cancelReason: order.cancelReason,
        returnReason: order.returnReason,
        returnRejectionReason: order.returnRejectionReason,
        statusHistory: order.statusHistory,
      },
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update order status",
      error: error.message,
    });
  }
};

// Get orders list with pagination
const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchQuery = req.query.search || "";
    const searchType = req.query.searchType || "orderId";
    const filterStatus = req.query.status || "";

    let query = {};
    if (searchQuery) {
      if (searchType === "orderId") {
        const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9]/g, "");
        query._id = {
          $in: await Order.find()
            .select("_id")
            .then((orders) =>
              orders
                .filter((order) =>
                  order._id
                    .toString()
                    .toLowerCase()
                    .includes(cleanQuery.toLowerCase())
                )
                .map((order) => order._id)
            ),
        };
      } else if (searchType === "email") {
        const users = await User.find({
          email: { $regex: searchQuery, $options: "i" },
        });
        query.user = { $in: users.map((user) => user._id) };
      }
    }

    if (filterStatus) {
      query.orderStatus = filterStatus;
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find(query)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const queryParams = new URLSearchParams();
    if (searchQuery) queryParams.set("search", searchQuery);
    if (searchType) queryParams.set("searchType", searchType);
    if (filterStatus !== "all") queryParams.set("status", filterStatus);
    if (limit !== 10) queryParams.set("limit", limit);

    queryParams.delete("page");

    const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
    const endPage = Math.min(totalPages, Math.max(page + 2, 5));

    res.render("admin/orders", {
      orders,
      currentPage: page,
      totalPages,
      limit,
      totalOrders,
      startPage,
      endPage,
      queryString: queryParams.toString(),
      filters: {
        searchQuery,
        searchType,
        filterStatus,
      },
      admin: req.user,
      getStatusBadgeClass,
      getNextStatuses,
    });
  } catch (error) {
    console.error("Error in getOrders:", error);
    res.status(500).render("error", {
      error: "Error fetching orders. Please try again.",
    });
  }
};

// Get order details
const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId)
      .populate("user", "name email phone")
      .populate("items.product", "name price images");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error("Error getting order details:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Delete order
const deleteOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.orderStatus !== "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Only cancelled orders can be deleted",
      });
    }

    await order.remove();
    res.json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Block customer
const blockCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const io = req.app.get("io");
    const activeUsers = req.app.get("activeUsers");

    const socketId = activeUsers.get(id);

    if (socketId) {
      io.to(socketId).emit("userBlocked", {
        message: "Your account has been blocked. Please contact support.",
      });
      io.emit("userBlocked", {
        userId: id,
        message: "Your account has been blocked. Please contact support.",
      });

      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    }

    res.json({ success: true, message: "User blocked successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Unblock customer
const unblockCustomer = async (req, res) => {
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

// Load dashboard
const loadDashboard = async (req, res) => {
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

// Get dashboard data
const getDashboardData = async (req, res) => {
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


//Sales Report PDF
const exportSalesReportPDF = async (req, res) => {
  try {
    let {
      startDate,
      endDate,
      paymentMethod = "all",
      orderStatus = "all",
    } = req.query;
    if (!startDate || !endDate) {
      const now = new Date();
      endDate = now.toISOString().split("T")[0];
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
    }
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const query = {
      createdAt: { $gte: start, $lte: end },
      orderStatus: { $in: ["Delivered", "Return Rejected"] },
    };
    if (orderStatus !== "all") query.orderStatus = orderStatus;
    if (paymentMethod !== "all") query.paymentMethod = paymentMethod;
    const orders = await Order.find(query)
      .populate("user", "name email")
      .populate("items.product", "name price");
    console.log("ORDERS COUNT:", orders.length);
    orders.forEach((order, i) => {
      console.log(`Order ${i}:`, {
        createdAt: order.createdAt,
        user: order.user ? order.user.name : "N/A",
        items: order.items
          .map((i) => (i.product ? i.product.name : "N/A"))
          .join(", "),
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
      });
    });
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="sales_report.pdf"'
    );
    doc.pipe(res);
    const tableTop = 140;
    const rowHeight = 24;
    const pageWidth = 595;
    const leftMargin = 20;
    const rightMargin = 20;
    const usableWidth = pageWidth - leftMargin - rightMargin;
    const colWidths = [65, 120, 120, 50, 80, 70, 90];
    const totalColWidth = colWidths.reduce((a, b) => a + b, 0);
    const scale = usableWidth / totalColWidth;
    const scaledColWidths = colWidths.map((w) => Math.round(w * scale));
    // Compute column X positions
    const colX = [leftMargin];
    for (let i = 1; i < scaledColWidths.length; i++) {
      colX.push(colX[i - 1] + scaledColWidths[i - 1]);
    }
    const companyName = "Derry World Restaurant";
    const companyEmail = "contact@derryworld.com";
    const companyAddress = "123 Main Street, City, Country";
    const companyPhone = "+91-12345-67890";
    const headerGradient = doc.linearGradient(0, 40, 595, 80);
    headerGradient.stop(0, "#ffe082").stop(1, "#ffc107"); // very light to #ffc107
    doc.rect(0, 40, 595, 40).fill(headerGradient);
    doc
      .fontSize(18)
      .fillColor("#222")
      .text(companyName, 40, 48, { align: "left", width: 400 });
    doc
      .fontSize(10)
      .fillColor("#222")
      .text(`Email: ${companyEmail} | Phone: ${companyPhone}`, 40, 68, {
        align: "left",
        width: 400,
      });
    doc
      .fontSize(22)
      .fillColor("#222")
      .text("SALES REPORT", 40, 90, { align: "left", width: 400 });
    doc.fillColor("black");
    doc
      .fontSize(10)
      .text(`Generated: ${new Date().toLocaleDateString()}`, 420, 55, {
        align: "right",
        width: 140,
      });
    const tableHeaderGradient = doc.linearGradient(
      colX[0],
      tableTop,
      colX[0] + scaledColWidths.reduce((a, b) => a + b),
      tableTop + rowHeight
    );
    tableHeaderGradient.stop(0, "#ffc107").stop(1, "#fffde7"); // #ffc107 to very light yellow
    doc
      .rect(
        colX[0],
        tableTop,
        scaledColWidths.reduce((a, b) => a + b),
        rowHeight
      )
      .fill(tableHeaderGradient)
      .stroke();
    doc.fillColor("#222").fontSize(12);
    doc.text("Date", colX[0], tableTop + 7, {
      width: scaledColWidths[0],
      align: "center",
      ellipsis: true,
    });
    doc.text("Customer", colX[1], tableTop + 7, {
      width: scaledColWidths[1],
      align: "center",
      ellipsis: true,
    });
    doc.text("Products", colX[2], tableTop + 7, {
      width: scaledColWidths[2],
      align: "center",
      ellipsis: true,
    });
    doc.text("Qty", colX[3], tableTop + 7, {
      width: scaledColWidths[3],
      align: "center",
      ellipsis: true,
    });
    doc.text("Payment", colX[4], tableTop + 7, {
      width: scaledColWidths[4],
      align: "center",
      ellipsis: true,
    });
    doc.text("Total", colX[5], tableTop + 7, {
      width: scaledColWidths[5],
      align: "center",
      ellipsis: true,
    });
    doc.text("Status", colX[6], tableTop + 7, {
      width: scaledColWidths[6],
      align: "center",
      ellipsis: true,
    });
    doc.strokeColor("#b6d7a8").lineWidth(0.7);
    for (let i = 0; i <= scaledColWidths.length; i++) {
      doc
        .moveTo(
          colX[0] +
            (i === 0
              ? 0
              : scaledColWidths.slice(0, i).reduce((a, b) => a + b, 0)),
          tableTop
        )
        .lineTo(
          colX[0] +
            (i === 0
              ? 0
              : scaledColWidths.slice(0, i).reduce((a, b) => a + b, 0)),
          tableTop + rowHeight + orders.length * rowHeight
        )
        .stroke();
    }
    let y = tableTop + rowHeight;
    const filteredOrders = orders;
    filteredOrders.forEach((order, idx) => {
      if (idx % 2 === 1) {
        doc
          .rect(
            colX[0],
            y,
            scaledColWidths.reduce((a, b) => a + b),
            rowHeight
          )
          .fill("#fffde7")
          .stroke();
      }
      doc.fillColor("#222").fontSize(10);
      const date = order.createdAt
        ? order.createdAt.toISOString().split("T")[0]
        : "";
      const customer = order.user ? order.user.name : "N/A";
      const products =
        order.items && order.items.length > 0
          ? order.items
              .map((i) => (i.product ? i.product.name : "N/A"))
              .join(", ")
          : "N/A";
      const quantity =
        order.items && order.items.length > 0
          ? order.items.reduce((sum, i) => sum + (i.quantity || 0), 0)
          : 0;
      const payment = order.paymentMethod || "";
      const total = order.totalAmount ? order.totalAmount.toFixed(2) : "0.00";
      const status = order.orderStatus || "";
      for (let i = 0; i <= scaledColWidths.length; i++) {
        doc
          .moveTo(
            colX[0] +
              (i === 0
                ? 0
                : scaledColWidths.slice(0, i).reduce((a, b) => a + b, 0)),
            y
          )
          .lineTo(
            colX[0] +
              (i === 0
                ? 0
                : scaledColWidths.slice(0, i).reduce((a, b) => a + b, 0)),
            y + rowHeight
          )
          .stroke();
      }
      doc.text(date, colX[0], y + 7, {
        width: scaledColWidths[0],
        align: "center",
        ellipsis: true,
      });
      doc.text(customer, colX[1], y + 7, {
        width: scaledColWidths[1],
        align: "center",
        ellipsis: true,
      });
      doc.text(products, colX[2], y + 7, {
        width: scaledColWidths[2],
        align: "center",
        ellipsis: true,
      });
      doc.text(quantity.toString(), colX[3], y + 7, {
        width: scaledColWidths[3],
        align: "center",
        ellipsis: true,
      });
      doc.text(payment, colX[4], y + 7, {
        width: scaledColWidths[4],
        align: "center",
        ellipsis: true,
      });
      doc.text(`Rs${parseInt(total)}`, colX[5], y + 7, {
        width: scaledColWidths[5],
        align: "center",
        ellipsis: true,
      });
      doc.text(status, colX[6], y + 7, {
        width: scaledColWidths[6],
        align: "center",
        ellipsis: true,
      });
      doc
        .moveTo(colX[0], y + rowHeight)
        .lineTo(
          colX[0] + scaledColWidths.reduce((a, b) => a + b),
          y + rowHeight
        )
        .stroke();
      y += rowHeight;
    });
    doc
      .moveTo(colX[0], y)
      .lineTo(colX[0] + scaledColWidths.reduce((a, b) => a + b), y)
      .stroke();
    doc.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PDF" });
    } else {
      res.destroy && res.destroy();
    }
    console.error("Error exporting PDF:", error);
  }
};

//Sales Report Excel
const exportSalesReportExcel = async (req, res) => {
  try {
    let {
      startDate,
      endDate,
      paymentMethod = "all",
      orderStatus = "all",
    } = req.query;
    const today = new Date();
    if (!startDate || isNaN(new Date(startDate).getTime())) {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split("T")[0];
    }
    if (!endDate || isNaN(new Date(endDate).getTime())) {
      endDate = today.toISOString().split("T")[0];
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const query = {
      createdAt: { $gte: start, $lte: end },
    };
    if (orderStatus !== "all") query.orderStatus = orderStatus;
    if (paymentMethod !== "all") query.paymentMethod = paymentMethod;

    const orders = await Order.find(query)
      .populate("user", "name email phone")
      .populate("items.product", "name price")
      .sort({ createdAt: -1 });

    if (orders.length === 0) {
      return res
        .status(404)
        .json({ error: "No orders found for the selected filters." });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");
    worksheet.columns = [
      { header: "Order ID", key: "orderId", width: 15 },
      { header: "Date", key: "date", width: 15 },
      { header: "Customer Name", key: "customerName", width: 25 },
      { header: "Customer Email", key: "customerEmail", width: 30 },
      { header: "Customer Phone", key: "customerPhone", width: 18 },
      { header: "Items", key: "items", width: 40 },
      { header: "Payment Method", key: "paymentMethod", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Amount", key: "amount", width: 15 },
    ];

    const allowedStatuses = ["Delivered", "Return Rejected"];
    const filteredOrders = orders.filter((order) =>
      allowedStatuses.includes(order.orderStatus)
    );
    if (filteredOrders.length === 0) {
      return res
        .status(404)
        .json({
          error:
            "No delivered or return rejected orders found for the selected filters.",
        });
    }

    filteredOrders.forEach((order) => {
      worksheet.addRow({
        orderId: "#" + order._id.toString().slice(-8).toUpperCase(),
        date: order.createdAt.toLocaleDateString("en-IN"),
        customerName: order.user?.name || "N/A",
        customerEmail: order.user?.email || "N/A",
        customerPhone: order.user?.phone || "N/A",
        items: order.items
          .map(
            (item) =>
              `${item.product?.name || "Unknown Product"} x ${item.quantity}`
          )
          .join(", "),
        paymentMethod: order.paymentMethod,
        status: order.orderStatus,
        amount: order.totalAmount?.toFixed(2) || "0.00",
      });
    });

    worksheet.addRow({});
    worksheet.addRow({
      orderId: "Total",
      amount: filteredOrders
        .reduce((sum, order) => sum + (order.totalAmount || 0), 0)
        .toFixed(2),
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales-report.xlsx"
    );
    await workbook.xlsx.write(res).then(() => {
      res.end();
    });
  } catch (error) {
    console.error("Error exporting Excel:", error);
    res.status(500).json({ error: "Failed to generate Excel file" });
  }
};

// Get sales report (for web view)
const getSalesReport = async (req, res) => {
  try {
    let {
      startDate,
      endDate,
      paymentMethod = "all",
      orderStatus = "all",
      page = 1,
      limit = 10,
    } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.max(1, Math.min(parseInt(limit) || 10, 100));
    if (!startDate || !endDate) {
      const now = new Date();
      endDate = now.toISOString().split("T")[0];
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
    }
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const query = {
      createdAt: { $gte: start, $lte: end },
      orderStatus: { $in: ["Delivered", "Return Rejected"] },
    };
    if (orderStatus !== "all") query.orderStatus = orderStatus;
    if (paymentMethod !== "all") query.paymentMethod = paymentMethod;
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);
    if (page > totalPages) page = totalPages || 1;
    const orders = await Order.find(query)
      .populate("user", "name email")
      .populate("items.product", "name price")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const allOrders = await Order.find(query);
    const totalSales = allOrders.reduce(
      (sum, order) => sum + (order.totalAmount || 0),
      0
    );
    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const allOrdersInDateRange = await Order.find({
      createdAt: { $gte: start, $lte: end },
      orderStatus: { $in: ["Delivered", "Return Rejected", "Return Approved"] },
    });
    const returnedOrders = allOrdersInDateRange.filter(
      (order) => order.orderStatus === "Return Approved"
    );
    const returnRate =
      allOrdersInDateRange.length > 0
        ? ((returnedOrders.length / allOrdersInDateRange.length) * 100).toFixed(
            1
          )
        : 0;
    const returnedOrdersCount = returnedOrders.length;
    const processedOrders = orders.map((order) => {
      const processedOrder = order.toObject();
      processedOrder.totalAmount = processedOrder.totalAmount || 0;
      processedOrder.items = processedOrder.items || [];
      processedOrder.user = processedOrder.user || {
        name: "N/A",
        email: "N/A",
      };
      return processedOrder;
    });
    const baseUrl = "/admin/sales-report";
    const queryParams = new URLSearchParams({
      startDate,
      endDate,
      paymentMethod,
      orderStatus,
    });
    const queryString = queryParams.toString();
    const paginationBaseUrl = `${baseUrl}?`;
    const maxVisiblePages = 5;
    let startPage = Math.max(
      1,
      Math.min(page - Math.floor(maxVisiblePages / 2), totalPages - 4)
    );
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    const showStartEllipsis = startPage > 1;
    const showEndEllipsis = endPage < totalPages;
    res.render("admin/sales-report", {
      title: "Sales Report",
      orders: processedOrders,
      totalSales,
      totalOrders,
      averageOrderValue,
      returnRate,
      returnedOrdersCount,
      startDate,
      endDate,
      currentPage: page,
      totalPages,
      filters: {
        paymentMethod,
        orderStatus,
      },
      admin: req.user,
      paginationBaseUrl,
      queryString,
      startPage,
      endPage,
      showStartEllipsis,
      showEndEllipsis,
      path: "/admin/sales-report",
    });
  } catch (error) {
    console.error("Error generating sales report:", error);
    res
      .status(500)
      .render("error", { message: "Error generating sales report", error });
  }
};

module.exports = {
  loginPage,
  loginAdmin,
  logoutAdmin,
  loadDashboard,
  getDashboardData,
  // generalSearch,
  customerList,
  getReturnDetails,
  updateCustomerStatus,
  getCustomerDetails,
  exportCustomerData,
  searchCustomers,
  searchOrders,
  checkOrderStatuses,
  editCustomer,
  updateOrderStatus,
  getOrders,
  getOrderDetails,
  deleteOrder,
  blockCustomer,
  unblockCustomer,
  getSalesReport,
  exportSalesReportPDF,
  exportSalesReportExcel,
};
