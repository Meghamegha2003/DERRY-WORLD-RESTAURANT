const mongoose = require('mongoose');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');
const { approveReturn, rejectReturn } = require('../user/orderController');

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



exports.getAvailableStatuses = (currentStatus) => {
    return STATUS_TRANSITIONS[currentStatus] || [];
};


exports.getNextStatuses = (currentStatus) => {
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
            return [];
        case ORDER_STATUS.RETURN_REJECTED:
            return [];
        case ORDER_STATUS.CANCELLED:
            return [];
        default:
            return [];
    }
};

exports.getStatusBadgeClass = (status) => {
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


exports.getPaymentStatusColor = (status) => {
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

exports.formatPaymentMethod = (method) => {
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

exports.getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const filter = {};

        if (req.query.paymentStatus && Object.values(PAYMENT_STATUS).includes(req.query.paymentStatus)) {
            filter.paymentStatus = req.query.paymentStatus;
        }

        if (req.query.startDate && req.query.endDate) {
            filter.createdAt = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate)
            };
        }

        const { search, searchType } = req.query;
        if (search && search.trim()) {
            const searchValue = search.trim();
            if (searchType === 'orderId') {
                let idPart = searchValue.replace(/^#/, '').toUpperCase();
                const allOrders = await Order.find({}, '_id');
                const matchedOrderIds = allOrders
                  .filter(o => o._id.toString().slice(-8).toUpperCase() === idPart)
                  .map(o => o._id);
                if (matchedOrderIds.length > 0) {
                  filter._id = { $in: matchedOrderIds };
                } else {
                  filter._id = { $in: [] };
                }
            } else if (searchType === 'customer') {
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
                  filter.user = null;
                }
            } else if (searchType === 'payment') {
                filter.paymentMethod = { $regex: searchValue, $options: 'i' };
            }
        }

        const totalOrders = await Order.countDocuments(filter);

        const orders = await Order.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('user', 'name email')
            .lean();

        const formattedOrders = orders.map(order => {
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
                paymentStatusColor: exports.getPaymentStatusColor(order.paymentStatus),
                formattedPaymentMethod: exports.formatPaymentMethod(order.paymentMethod)
            };
        });

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

        res.render('admin/orders', {
            title: 'Order Management',
            orders: formattedOrders,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            totalOrders,
            query: req.query,
            paymentStatuses: PAYMENT_STATUS,
            getPaymentStatusColor: exports.getPaymentStatusColor,
            formatPaymentMethod: exports.formatPaymentMethod,
            getStatusBadgeClass: exports.getStatusBadgeClass,
            getNextStatuses: exports.getNextStatuses,
            path : '/admin/orders'
        });
    } catch (error) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch orders',
                error: error.message
            });
        }
        res.status(500).render('admin/error', {
            message: 'Failed to fetch orders',
            error
        });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

       
        const hasItemActions = order.items && order.items.some(item => 
            item.status === 'Cancelled' || 
            item.status === 'Returned' || 
            item.status === 'Return Requested' || 
            item.status === 'Return Approved'
        );
        const isRetryPaymentScenario = (
            order.paymentMethod === 'online' && 
            order.paymentStatus !== PAYMENT_STATUS.PAID && 
            order.orderStatus === 'Pending' &&
            !hasItemActions
        );

        if (isRetryPaymentScenario) {
            return res.status(400).json({
                success: false,
                message: 'Cannot update status: payment not completed'
            });
        }

        const allowedStatuses = exports.getAvailableStatuses(order.orderStatus);
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status transition'
            });
        }

        order.orderStatus = status;
        if (note) {
            order.notes.push({
                content: note,
                addedBy: req.admin._id
            });
        }

        if (status === 'Cancelled') {
            await exports.handleOrderCancellation(order);
        } else if (status === 'Return Completed') {
            await exports.handleReturnCompletion(order);
        } else if (status === ORDER_STATUS.DELIVERED) {
            order.deliveryDate = new Date();
        }

        await order.save();

        if (status === ORDER_STATUS.RETURN_APPROVED) {
            const { processItemRefund } = require('../../services/refundService');
            const { updateOrderCouponCalculations } = require('../../helpers/couponHelper');
            
            for (const item of order.items) {
                item.status = "Return Approved";
                item.returnStatus = "Approved";
                item.returnApprovedDate = new Date();
                
                if (item.product) {
                    await Product.findByIdAndUpdate(item.product, { $inc: { quantity: item.quantity } });
                }
                
               if (order.paymentMethod && order.paymentMethod.toLowerCase() !== "cod") {
                    try {
                        await processItemRefund(order, item, 'Return');
                    } catch (error) {}
                } else {
                    item.refundStatus = "Completed";
                    item.refundDate = new Date();
                }
            }
            
            await updateOrderCouponCalculations(order);
            
        }

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: 'Order status updated successfully',
                order: {
                    ...order.toObject(),
                    statusBadgeClass: exports.getStatusBadgeClass(status),
                    nextStatuses: exports.getNextStatuses(status)
                }
            });
        }

        res.redirect('/admin/orders/' + id);
    } catch (error) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Failed to update order status' });
        }
        res.status(500).render('admin/error', { message: 'Failed to update order status', error });
    }
};

exports.getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email phone')
            .populate({
                path: 'items.product',
                select: 'name price productImage',
                model: 'Product'
            })
            .lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const itemsWithImages = order.items.map(item => ({
            ...item,
            imageUrl: item.product?.productImage?.[0] || '/images/placeholder.jpg'
        }));

        const subtotal = order.items.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);

        const formattedOrder = {
            ...order,
            items: itemsWithImages,
            subtotal: subtotal,
            tax: order.tax || 0,
            shipping: order.shipping || 0,
            discount: order.discount || 0,
            total: order.total || subtotal + (order.tax || 0) + (order.shipping || 0) - (order.discount || 0),
            statusBadgeClass: exports.getStatusBadgeClass(order.orderStatus),
            paymentStatusColor: exports.getPaymentStatusColor(order.paymentStatus),
            formattedPaymentMethod: exports.formatPaymentMethod(order.paymentMethod),
            nextStatuses: exports.getNextStatuses(order.orderStatus)
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
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch order details'
            });
        }
        res.status(500).render('admin/error', {
            message: 'Failed to fetch order details',
            error
        });
    }
}; 

exports.handleRefund = async (order, item) => {
    try {
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
            wallet = new Wallet({ user: order.user, balance: 0, transactions: [] });
        }

        const unitPrice = item.offerPrice != null ? item.offerPrice : item.price;
        const refundAmount = unitPrice * (item.quantity || 1);

        if (refundAmount > 0) {
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
            await User.findByIdAndUpdate(order.user, { wallet: wallet._id });

            item.refundAmount = refundAmount;
            item.refundStatus = 'Completed';
            item.refundDate = new Date();
            await order.save();
          
        } 
    } catch (err) {
        throw err;
    }
};

exports.handleReturnAction = async (req, res) => {
    const { orderId, itemId, action } = req.params;

    const simulatedReq = { params: { orderId, itemId } };

    if (action === 'approve') {
        return approveReturn(simulatedReq, res);
    } else if (action === 'reject') {
        return rejectReturn(simulatedReq, res);
    } else {
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }
};

exports.handleOrderCancellation = async (order, reason = 'Cancelled by admin') => {
    try {
        order.orderStatus = ORDER_STATUS.CANCELLED;
        order.cancelReason = reason;
        order.cancelledAt = new Date();

        for (const item of order.items) {
            if (item.product) {
                await Product.findByIdAndUpdate(item.product, { $inc: { quantity: item.quantity } });
            }
        }

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

        }

        await order.save();
    } catch (error) {
        throw error;
    }
};
