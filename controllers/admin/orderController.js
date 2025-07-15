const mongoose = require('mongoose');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');

// Define status transitions map
const STATUS_TRANSITIONS = {
    'Pending': ['Processing', 'Cancelled'],
    'Processing': ['Shipped', 'Cancelled'],
    'Shipped': ['Delivered'],
    'Delivered': ['Return Requested'],
    'Return Requested': ['Return Approved', 'Return Rejected'],
    'Return Approved': ['Return Completed'],
    'Return Rejected': [], 
    'Return Completed': [], 
    'Cancelled': [] 
};

// Helper functions
const isStatusUpdateAllowed = (currentStatus) => {
    return STATUS_TRANSITIONS[currentStatus]?.length > 0;
};

const getAvailableStatuses = (currentStatus) => {
    return STATUS_TRANSITIONS[currentStatus] || [];
};

const getNextStatuses = (currentStatus) => {
    switch (currentStatus) {
        case ORDER_STATUS.PENDING:
            return [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED];
        case ORDER_STATUS.PROCESSING:
            return [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED];
        case ORDER_STATUS.SHIPPED:
            return [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED];
        case ORDER_STATUS.DELIVERED:
            return [ORDER_STATUS.RETURN_REQUESTED];
        case ORDER_STATUS.RETURN_REQUESTED:
            return [ORDER_STATUS.RETURN_APPROVED, ORDER_STATUS.RETURN_REJECTED];
        case ORDER_STATUS.RETURN_APPROVED:
            return [ORDER_STATUS.CANCELLED];
        case ORDER_STATUS.RETURN_REJECTED:
            return [];
        case ORDER_STATUS.CANCELLED:
            return [];
        default:
            return [];
    }
};

const getStatusBadgeClass = (status) => {
    switch (status) {
        case 'Pending':
            return 'bg-warning';
        case 'Processing':
            return 'bg-info';
        case 'Shipped':
            return 'bg-primary';
        case 'Out for Delivery':
            return 'bg-info';
        case 'Delivery Attempted':
            return 'bg-warning';
        case 'Delivered':
            return 'bg-success';
        case 'Return Requested':
            return 'bg-secondary';
        case 'Return Approved':
            return 'bg-info';
        case 'Return Picked Up':
            return 'bg-info';
        case 'Return Completed':
            return 'bg-success';
        case 'Cancelled':
            return 'bg-danger';
        default:
            return 'bg-secondary';
    }
};

const getStatusColor = (status) => {
    switch (status) {
        case 'Pending':
            return 'warning';
        case 'Processing':
            return 'info';
        case 'Shipped':
            return 'primary';
        case 'Out for Delivery':
            return 'info';
        case 'Delivery Attempted':
            return 'warning';
        case 'Delivered':
            return 'success';
        case 'Return Requested':
            return 'warning';
        case 'Return Approved':
            return 'info';
        case 'Return Picked Up':
            return 'info';
        case 'Return Completed':
            return 'success';
        case 'Cancelled':
            return 'danger';
        default:
            return 'secondary';
    }
};

const getPaymentStatusColor = (status) => {
    switch (status) {
        case PAYMENT_STATUS.PENDING:
            return 'text-warning';
        case PAYMENT_STATUS.COMPLETED:
            return 'text-success';
        case PAYMENT_STATUS.FAILED:
            return 'text-danger';
        case PAYMENT_STATUS.REFUNDED:
            return 'text-info';
        default:
            return 'text-secondary';
    }
};

const formatPaymentMethod = (method) => {
    switch (method) {
        case 'CREDIT_CARD':
            return 'Credit Card';
        case 'DEBIT_CARD':
            return 'Debit Card';
        case 'UPI':
            return 'UPI';
        case 'WALLET':
            return 'Wallet';
        default:
            return method;
    }
};

// Get all orders with filtering
const getOrders = async (req, res) => {
    try {
        // Parse query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const filter = {};

        // Apply status filter (show all if 'all' or not set)
        if (req.query.status && req.query.status !== 'all' && Object.values(ORDER_STATUS).includes(req.query.status)) {
            filter.orderStatus = req.query.status;
        }

        // Apply payment status filter
        if (req.query.paymentStatus && Object.values(PAYMENT_STATUS).includes(req.query.paymentStatus)) {
            filter.paymentStatus = req.query.paymentStatus;
        }

        // Apply date range filter
        if (req.query.startDate && req.query.endDate) {
            filter.createdAt = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate)
            };
        }

        // Robust search logic based on searchType
        const { search, searchType } = req.query;
        if (search && search.trim()) {
            const searchValue = search.trim();
            if (searchType === 'orderId') {
                // Support search by last 8 chars (displayed ID), with or without #
                // Remove leading # if present
                let idPart = searchValue.replace(/^#/, '').toUpperCase();
                // Find orders where last 8 of _id matches (case-insensitive)
                const allOrders = await Order.find({}, '_id');
                const matchedOrderIds = allOrders
                  .filter(o => o._id.toString().slice(-8).toUpperCase() === idPart)
                  .map(o => o._id);
                // If found, filter by _id
                if (matchedOrderIds.length > 0) {
                  filter._id = { $in: matchedOrderIds };
                } else {
                  // No matches, force empty result
                  filter._id = { $in: [] };
                }
            } else if (searchType === 'customer') {
                // Find users by email or name
                const userRegex = new RegExp(searchValue, 'i');
                const users = await User.find({
                  $or: [
                    { email: userRegex },
                    { name: userRegex }
                  ]
                }).select('_id');
                if (users.length > 0) {
                  filter.user = { $in: users.map(u => u._id) };
                } else {
                  // No users found, force empty result
                  filter.user = null;
                }
            } else if (searchType === 'status') {
                filter.orderStatus = { $regex: searchValue, $options: 'i' };
            } else if (searchType === 'payment') {
                filter.paymentMethod = { $regex: searchValue, $options: 'i' };
            }
        }

        // Get total count for pagination
        const totalOrders = await Order.countDocuments(filter);

        // Get orders with pagination and sorting
        const orders = await Order.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('user', 'name email')
            .lean();

        // Format orders for response
        const formattedOrders = orders.map(order => {
            // Fallback for cancelReason and returnReason if missing at order level
            let cancelReason = order.cancelReason;
            let returnReason = order.returnReason;
            if (!cancelReason && order.items && order.items.length > 0) {
                cancelReason = order.items[0].cancelReason;
            }
            if (!returnReason && order.items && order.items.length > 0) {
                returnReason = order.items[0].returnReason;
            }
            return {
                ...order,
                cancelReason,
                returnReason,
                userName: order.user?.name || 'N/A',
                userEmail: order.user?.email || 'N/A',
                statusBadgeClass: getStatusBadgeClass(order.orderStatus),
                paymentStatusColor: getPaymentStatusColor(order.paymentStatus),
                formattedPaymentMethod: formatPaymentMethod(order.paymentMethod),
                nextStatuses: getNextStatuses(order.orderStatus)
            };
        });

        // Check if it's an API request
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                orders: formattedOrders,
                pagination: {
                    page,
                    limit,
                    totalOrders,
                    totalPages: Math.ceil(totalOrders / limit)
                }
            });
        }

        // Render the orders page
        res.render('admin/orders', {
            title: 'Order Management',
            orders: formattedOrders,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            totalOrders,
            query: req.query,
            orderStatuses: ORDER_STATUS,
            paymentStatuses: PAYMENT_STATUS,
            getStatusBadgeClass,
            getPaymentStatusColor,
            formatPaymentMethod,
            getNextStatuses,
            ORDER_STATUS,
            path : '/admin/orders'
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch orders',
                error: error.message
            });
        }
        res.status(500).render('error', {
            message: 'Failed to fetch orders',
            error
        });
    }
};

// Update order status
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;

        // Validate order exists
        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Validate status transition is allowed
        const allowedStatuses = getAvailableStatuses(order.orderStatus);
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status transition'
            });
        }

        // Update order status
        order.orderStatus = status;
        if (note) {
            order.notes.push({
                content: note,
                addedBy: req.admin._id
            });
        }

        // Handle special status transitions
        if (status === 'Cancelled') {
            // Handle cancellation logic (e.g., refund, inventory update)
            await handleOrderCancellation(order);
        } else if (status === 'Return Completed') {
            // Handle return completion logic
            await handleReturnCompletion(order);
        } else if (status === ORDER_STATUS.DELIVERED) {
            // Set deliveryDate to current time if delivered
            order.deliveryDate = new Date();
        }

        await order.save();

        // If return approved via status update, refund full order and emit wallet update
        if (status === ORDER_STATUS.RETURN_APPROVED) {
            // Re-add returned items to inventory
            for (const item of order.items) {
                if (item.product) {
                    await Product.findByIdAndUpdate(item.product, { $inc: { quantity: item.quantity } });
                    console.log('[ADMIN] Inventory restored for product', item.product.toString(), 'quantity', item.quantity);
                }
            }
            console.log('[ADMIN] Processing Return Approved for order', order._id);
            console.log('[ADMIN] User ID:', order.user.toString());
            // Refund user wallet
            let wallet = await Wallet.findOne({ user: order.user });
            if (!wallet) {
                console.log('[ADMIN] No wallet found, initializing new wallet');
                wallet = new Wallet({ user: order.user, balance: 0, transactions: [] });
            }
            const refundAmount = order.totalAmount || order.total;
            console.log('[ADMIN] Calculated refundAmount:', refundAmount);
            wallet.balance += refundAmount;
            wallet.transactions.push({ type: 'credit', amount: refundAmount, description: `Refund for order ${order._id}`, date: new Date(), orderId: order._id.toString(), status: 'completed' });
            await wallet.save();
            await User.findByIdAndUpdate(order.user, { wallet: wallet._id });
            // Emit real-time wallet update
            const io = req.app.get('io');
            const activeUsers = req.app.get('activeUsers');
            console.log('[ADMIN] ActiveUsers map:', Array.from(activeUsers.entries()));
            const socketId = activeUsers.get(order.user.toString());
            console.log('[ADMIN] socketId found:', socketId);
            if (socketId) {
                console.log('[ADMIN] Emitting walletUpdated event');
                io.to(socketId).emit('walletUpdated', { userId: order.user.toString(), balance: wallet.balance });
            } else {
                console.log('[ADMIN] No active socket for user, event not sent');
            }
        }

        // Return response based on request type
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: 'Order status updated successfully',
                order: {
                    ...order.toObject(),
                    statusBadgeClass: getStatusBadgeClass(status),
                    nextStatuses: getNextStatuses(status)
                }
            });
        }

        res.redirect('/admin/orders/' + id);
    } catch (error) {
        console.error('Error in updateOrderStatus:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update order status'
            });
        }
        res.status(500).render('error', {
            message: 'Failed to update order status',
            error
        });
    }
};

// Get order details
const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email phone')
            .populate('items.product', 'name price images')
            .lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const formattedOrder = {
            ...order,
            statusBadgeClass: getStatusBadgeClass(order.orderStatus),
            paymentStatusColor: getPaymentStatusColor(order.paymentStatus),
            formattedPaymentMethod: formatPaymentMethod(order.paymentMethod),
            nextStatuses: getNextStatuses(order.orderStatus)
        };

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                order: formattedOrder
            });
        }

        res.render('admin/orderDetails', {
            title: `Order #${order.orderId}`,
            order: formattedOrder
        });
    } catch (error) {
        console.error('Error in getOrderDetails:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch order details'
            });
        }
        res.status(500).render('error', {
            message: 'Failed to fetch order details',
            error
        });
    }
}; // <--- Added closing brace and semicolon

const handleRefund = async (order, item) => {
    try {
        console.log('[REFUND][DEBUG] Attempting refund for order:', order._id, 'item:', item._id);
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
            console.log('[REFUND][DEBUG] No wallet found, creating new wallet for user:', order.user);
            wallet = new Wallet({ user: order.user, balance: 0, transactions: [] });
        }

        // Calculate refund based on unit price and quantity
        const unitPrice = item.offerPrice != null ? item.offerPrice : item.price;
        const refundAmount = unitPrice * (item.quantity || 1);

        if (refundAmount > 0) {
            console.log('[REFUND][DEBUG] Wallet before save:', JSON.stringify(wallet));
            // Debit return price instead of credit
            wallet.balance -= refundAmount;
            wallet.transactions.push({
                type: 'debit',
                amount: refundAmount,
                description: `Debit for returned item (${item.product ? item.product.toString() : ''})`,
                date: new Date(),
                orderId: order._id.toString(),
                status: 'completed'
            });
            await wallet.save();
            console.log('[REFUND][DEBUG] Wallet after save:', JSON.stringify(wallet));
            await User.findByIdAndUpdate(order.user, { wallet: wallet._id });

            // Update item refund fields
            item.refundAmount = refundAmount;
            item.refundStatus = 'Completed';
            item.refundDate = new Date();
            // CRITICAL: Save the order so item changes persist!
            await order.save();
            console.log('[REFUND][DEBUG] Refund processed and wallet/order saved:', {
                user: order.user,
                refundAmount,
                walletBalance: wallet.balance,
                walletId: wallet._id
            });
        } else {
            console.log('[REFUND][DEBUG] Refund amount is 0, skipping wallet update.');
        }
    } catch (err) {
        console.error('[REFUND][DEBUG] Error processing refund:', err);
        throw err;
    }
};

// Handle return request
const handleReturnAction = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { action } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Order item not found'
            });
        }

        if (action === 'approve') {
            item.returnStatus = 'Approved';
            await handleRefund(order, item);
            // Re-add returned item to inventory
            try {
                const prodId = item.product._id ? item.product._id : item.product;
                await Product.findByIdAndUpdate(prodId, { $inc: { quantity: item.quantity } });
                console.log('[ADMIN RETURN] Inventory restored for product', prodId, 'quantity', item.quantity);
            } catch (err) {
                console.error('[ADMIN RETURN] Error restoring inventory:', err);
            }
        } else if (action === 'reject') {
            item.returnStatus = 'Rejected';
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid action'
            });
        }

        await order.save();
        // Emit real-time wallet update to user when return approved
        if (action === 'approve') {
            const wallet = await Wallet.findOne({ user: order.user });
            const io = req.app.get('io');
            const activeUsers = req.app.get('activeUsers');
            const socketId = activeUsers.get(order.user.toString());
            if (socketId) {
                io.to(socketId).emit('walletUpdated', { userId: order.user.toString(), balance: wallet.balance });
            }
        }

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: `Return request ${action}ed successfully`,
                item
            });
        }

        res.redirect('/admin/orders/' + orderId);
    } catch (error) {
        console.error('Error in handleReturnAction:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Failed to process return request'
            });
        }
        res.status(500).render('error', {
            message: 'Failed to process return request',
            error
        });
    }
};

const handleOrderCancellation = async (order, reason = 'Cancelled by admin') => {
    try {
        // Mark order as cancelled
        order.orderStatus = ORDER_STATUS.CANCELLED;
        order.cancelReason = reason;
        order.cancelledAt = new Date();

        // Restore product quantities
        for (const item of order.items) {
            if (item.product) {
                await Product.findByIdAndUpdate(item.product, { $inc: { quantity: item.quantity } });
            }
        }

        // Refund the user if prepaid
        if (order.paymentStatus === PAYMENT_STATUS.COMPLETED && order.paymentMethod !== 'COD') {
            let wallet = await Wallet.findOne({ user: order.user });
            if (!wallet) {
                wallet = new Wallet({ user: order.user, balance: 0, transactions: [] });
            }

            const refundAmount = order.totalAmount || order.total;
            wallet.balance += refundAmount;
            wallet.transactions.push({
                type: 'credit',
                amount: refundAmount,
                description: `Refund for cancelled order ${order._id}`,
                date: new Date(),
                orderId: order._id.toString(),
                status: 'completed'
            });

            await wallet.save();
            await User.findByIdAndUpdate(order.user, { wallet: wallet._id });

            // Emit real-time wallet update
            const io = req.app.get('io');
            const activeUsers = req.app.get('activeUsers');
            const socketId = activeUsers.get(order.user.toString());
            if (socketId) {
                io.to(socketId).emit('walletUpdated', {
                    userId: order.user.toString(),
                    balance: wallet.balance
                });
            }
        }

        await order.save();
    } catch (error) {
        console.error('[ADMIN][CANCEL_ORDER] Error cancelling order:', error);
        throw error;
    }
};


module.exports = {
    getOrders,
    updateOrderStatus,
    getOrderDetails,
    handleReturnAction,
    handleRefund,
    handleOrderCancellation
};