const Order = require('../../models/orderSchema');  // Assuming you have an Order model
const User=require('../../models/userSchema')
// Get all orders with pagination
exports.getOrders = async (req, res) => {
  const currentPage = parseInt(req.query.page) || 1;
  const ordersPerPage = 10;

  try {
    // Fetch orders with pagination and populate user data
    const orders = await Order.find()
      .populate('user', 'name') 
      .skip((currentPage - 1) * ordersPerPage)
      .limit(ordersPerPage)
      .sort({ createdAt: -1 })
      .lean(); 
      console.log("ORDER STATUS:",orders)

    // Get total order count
    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / ordersPerPage);

    // Add 'userName' property to each order
    const ordersWithUserName = orders.map((order) => ({
      ...order,
      userName: order.user ? order.user.name : 'Unknown', // Safely handle missing user data
    }));

    // Render orders with user names to the view
    res.render('order', { 
      orders: ordersWithUserName, 
      currentPage, 
      totalPages 
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const newStatus = req.body.status;

    // Valid statuses
    const validStatuses = ['Pending', 'Shipped', 'Completed', 'Cancelled'];

    // Validate the new status
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).send('Invalid status value');
    }

    // Find and update the order
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).send('Order not found');
    }

    order.status = newStatus;
    await order.save();

    res.redirect('/admin/orders');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};
