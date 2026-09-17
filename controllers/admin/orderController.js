const mongoose = require('mongoose');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const { processOrderRefund, processItemRefund } = require('../../services/refundService');
const { updateOrderCouponCalculations } = require('../../helpers/couponHelper');
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
            path: '/admin/orders'
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
        const { orderId } = req.params;
        const { status, note } = req.body;

        const order = await Order.findById(orderId)
            .populate('user')
            .populate('items.product');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (
            order.paymentMethod &&
            order.paymentMethod.toLowerCase() !== 'cod' &&
            order.paymentStatus === PAYMENT_STATUS.PENDING &&
            status === ORDER_STATUS.PROCESSING
        ) {
            return res.status(400).json({
                success: false,
                message: 'Payment is still pending'
            });
        }

        const currentStatus = order.orderStatus;
        const allowedStatuses = STATUS_TRANSITIONS[currentStatus] || [];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot change order status from ${currentStatus} to ${status}`
            });
        }

        if (status === ORDER_STATUS.CANCELLED) {
            const result = await exports.handleOrderCancellation(
                order,
                note || 'Cancelled by admin'
            );

            return res.json({
                success: true,
                message: 'Order cancelled successfully',
                refundAmount: result.refundAmount || 0
            });
        }

        if (status === ORDER_STATUS.RETURN_APPROVED) {
            let totalRefundAmount = 0;
            let processedItems = 0;

            await updateOrderCouponCalculations(order);

            for (const item of order.items) {
                if (
                    item.returnStatus === 'Pending' ||
                    item.status === 'Active'
                ) {
                    if (
                        order.paymentMethod &&
                        order.paymentMethod.toLowerCase() !== 'cod'
                    ) {
                        const refundResult = await processItemRefund(
                            order,
                            item,
                            'Return'
                        );

                        if (!refundResult.success) {
                            throw new Error(refundResult.message);
                        }

                        totalRefundAmount += Number(
                            refundResult.refundAmount || 0
                        );
                    } else {
                        item.refundAmount = 0;
                        item.refundStatus = 'Completed';
                        item.refundDate = new Date();
                    }

                    item.status = 'Return Approved';
                    item.returnStatus = 'Approved';
                    item.returnApprovedAt = new Date();

                    if (item.product) {
                        const productId = item.product._id
                            ? item.product._id
                            : item.product;

                        await Product.findByIdAndUpdate(
                            productId,
                            { $inc: { quantity: item.quantity } }
                        );
                    }

                    processedItems++;
                }
            }

            order.orderStatus = ORDER_STATUS.RETURN_APPROVED;

            if (note) {
                order.adminNote = note;
            }

            await updateOrderCouponCalculations(order);

            await order.save();

            return res.json({
                success: true,
                message: 'Return approved and refund processed successfully',
                refundAmount: Number(totalRefundAmount.toFixed(2)),
                itemsProcessed: processedItems
            });
        }

        if (status === ORDER_STATUS.RETURN_REJECTED) {
            order.orderStatus = ORDER_STATUS.RETURN_REJECTED;

            for (const item of order.items) {
                if (item.returnStatus === 'Pending') {
                    item.returnStatus = 'Rejected';
                    item.returnRejectedAt = new Date();
                }
            }

            if (note) {
                order.adminNote = note;
            }

            await order.save();

            return res.json({
                success: true,
                message: 'Return rejected successfully'
            });
        }

        order.orderStatus = status;

        if (note) {
            order.adminNote = note;
        }

        if (status === ORDER_STATUS.DELIVERED) {
            order.deliveryDate = new Date();
        }

        if (status === ORDER_STATUS.RETURN_COMPLETED) {
            await handleReturnCompletion(order);
        }

        await order.save();

        return res.json({
            success: true,
            message: `Order status updated to ${status}`
        });

    } catch (error) {
        console.error('updateOrderStatus error:', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to update order status'
        });
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
        const isOnlinePayment =
            order.paymentMethod &&
            order.paymentMethod.toLowerCase() !== 'cod';

        const isPaid =
            order.paymentStatus === PAYMENT_STATUS.PAID ||
            order.paymentStatus === PAYMENT_STATUS.COMPLETED;

        let refundAmount = 0;

        if (isOnlinePayment && isPaid) {
            await updateOrderCouponCalculations(order);

            const refundResult = await processOrderRefund(
                order,
                'Cancellation'
            );

            if (!refundResult.success && refundResult.refundAmount <= 0) {
                throw new Error(refundResult.message);
            }

            refundAmount = Number(refundResult.refundAmount || 0);

            if (refundAmount > 0) {
                order.refundAmount = refundAmount;
                order.refundStatus = 'Completed';
                order.refundDate = new Date();
                order.paymentStatus = PAYMENT_STATUS.REFUNDED;
            }
        }

        for (const item of order.items) {
            if (
                item.product &&
                item.status !== 'Cancelled' &&
                item.status !== 'Returned' &&
                item.status !== 'Return Approved'
            ) {
                const productId = item.product._id
                    ? item.product._id
                    : item.product;

                await Product.findByIdAndUpdate(
                    productId,
                    { $inc: { quantity: item.quantity } }
                );

                item.status = 'Cancelled';
                item.cancelledAt = new Date();
                item.cancelReason = reason;
            }
        }

        order.orderStatus = ORDER_STATUS.CANCELLED;
        order.cancelReason = reason;
        order.cancelledAt = new Date();

        await order.save();

        return {
            success: true,
            refundAmount
        };

    } catch (error) {
        console.error('handleOrderCancellation error:', error);
        throw error;
    }
};