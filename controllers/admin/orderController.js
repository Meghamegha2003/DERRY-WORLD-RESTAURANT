const mongoose = require('mongoose');
const { Order, ORDER_STATUS, PAYMENT_STATUS, ORDER_TO_ITEM_STATUS } = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');

// Delete an order by ID
exports.deleteOrder = async (req, res) => {
    const orderId = req.params.orderId;
    console.log(`[DEBUG] Attempting to delete order: ${orderId}`);
    
    try {
        // Validate order ID
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            console.error(`[ERROR] Invalid order ID format: ${orderId}`);
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid order ID format' 
            });
        }

        // Find and delete the order
        const deletedOrder = await Order.findByIdAndDelete(orderId);
        
        if (!deletedOrder) {
            console.error(`[ERROR] Order not found: ${orderId}`);
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        console.log(`[INFO] Successfully deleted order: ${orderId}`);
        
        // Return success response
        return res.status(200).json({ 
            success: true, 
            message: 'Order deleted successfully',
            orderId: orderId,
            deletedAt: new Date()
        });

    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete order',
            error: error.message 
        });
    }
};

// Define valid status transitions
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

// Map item status to order status (reverse mapping)
const ITEM_TO_ORDER_STATUS = {
    'Active': 'Pending',
    'Pending': 'Pending',
    'Processing': 'Processing',
    'Shipped': 'Shipped',
    'Delivered': 'Delivered',
    'Return Requested': 'Return Requested',
    'Return Approved': 'Return Approved',
    'Return Rejected': 'Return Rejected',
    'Returned': 'Return Completed',
    'Cancelled': 'Cancelled'
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

// Controller methods are defined below with direct exports
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

        // Handle both order status and item status filtering
        if (req.query.status && req.query.status !== 'all') {
            if (req.query.status.startsWith('item_')) {
                // This is an item status filter
                const itemStatus = req.query.status.replace('item_', '');
                filter['items.status'] = itemStatus;
            } else if (Object.values(ORDER_STATUS).includes(req.query.status)) {
                // This is a regular order status filter
                filter.orderStatus = req.query.status;
            }
        }

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
                  // No users found, force empty result
                  filter.user = null;
                }
            } else if (searchType === 'status') {
                filter.orderStatus = { $regex: searchValue, $options: 'i' };
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
            .populate('items.product', 'name image')
            .lean();
            
        // Map product details to each item
        orders.forEach(order => {
            if (order.items && order.items.length > 0) {
                order.items = order.items.map(item => {
                    if (item.product && typeof item.product === 'object') {
                        item.productDetails = {
                            name: item.product.name,
                            image: item.product.image
                        };
                    }
                    return item;
                });
            }
        });

        const formattedOrders = orders.map(order => ({
            ...order,
            cancelReason: order.cancelReason || (order.items?.[0]?.cancelReason),
            returnReason: order.returnReason || (order.items?.[0]?.returnReason),
            userName: order.user?.name || 'N/A',
            userEmail: order.user?.email || 'N/A',
            statusBadgeClass: exports.getStatusBadgeClass(order.orderStatus),
            paymentStatusColor: exports.getPaymentStatusColor(order.paymentStatus),
            formattedPaymentMethod: exports.formatPaymentMethod(order.paymentMethod),
            nextStatuses: exports.getNextStatuses(order.orderStatus)
        }));

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
            orderStatuses: ORDER_STATUS,
            paymentStatuses: PAYMENT_STATUS,
            getStatusBadgeClass: exports.getStatusBadgeClass,
            getPaymentStatusColor: exports.getPaymentStatusColor,
            formatPaymentMethod: exports.formatPaymentMethod,
            getNextStatuses: exports.getNextStatuses,
            ORDER_STATUS,
            path: '/admin/orders'
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

// Update status for an individual item in an order
exports.updateOrderItemStatus = async (req, res) => {
    let order; // Declare order as let to allow reassignment
    try {
        const { orderId, itemId } = req.params;
        const { status, note } = req.body;

        // First, verify the order exists
        order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify the item exists in the order
        let item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Order item not found'
            });
        }

        // Map order status to item status if needed
        // Only use statuses that are defined in the schema
        const statusMap = {
            'Pending': 'Pending',
            'Processing': 'Processing',
            'Shipped': 'Shipped',
            'Delivered': 'Delivered',
            'Cancelled': 'Cancelled',
            'Return Requested': 'Return Requested',
            'Return Approved': 'Returned',
            'Return Rejected': 'Pending', // Changed from 'Active' to 'Pending' as 'Active' is not a valid status
            'Returned': 'Returned'
        };

        // Get the mapped status or use the original status
        const itemStatus = statusMap[status] || status;

        // Validate status against schema's allowed values
        const allowedItemStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Return Approved', 'Return Rejected', 'Returned'];
        if (!allowedItemStatuses.includes(itemStatus)) {
            console.error(`[ERROR] Invalid status '${status}' (mapped to '${itemStatus}') for item. Allowed values: ${allowedItemStatuses.join(', ')}`);
            return res.status(400).json({
                success: false,
                message: `Invalid status '${status}' for item. Allowed values: ${allowedItemStatuses.join(', ')}`
            });
        }

        console.log(`[DEBUG] Status '${status}' mapped to '${itemStatus}' for item update`);

        // Special handling for return approvals
        if (status === 'Return Approved') {
            // Restore product quantity
            if (item.product) {
                await Product.findByIdAndUpdate(item.product, { $inc: { quantity: item.quantity } });
                console.log(`[ADMIN] Restored ${item.quantity} items for product ${item.product}`);
            }
            
            // Process refund if applicable
            const refundAmount = item.total || (item.price * item.quantity);
            if (refundAmount > 0 && order.paymentMethod === 'online') {
                let wallet = await Wallet.findOne({ user: order.user });
                if (!wallet) {
                    wallet = new Wallet({ user: order.user, balance: 0, transactions: [] });
                }
                wallet.balance += refundAmount;
                wallet.transactions.push({
                    type: 'credit',
                    amount: refundAmount,
                    description: `Refund for item in order ${order._id}`,
                    date: new Date(),
                    orderId: order._id.toString(),
                    status: 'completed'
                });
                await wallet.save();
                console.log(`[ADMIN] Processed refund of ${refundAmount} for user ${order.user}`);
            }
        }

        // Update item status with the mapped status
        const previousStatus = item.status;
        item.status = itemStatus;
        item.updatedAt = new Date();
        
        console.log(`[DEBUG] Updated item ${item._id} status from '${previousStatus}' to '${itemStatus}'`);

        // Add note if provided
        if (note) {
            order.notes = order.notes || [];
            order.notes.push({
                content: note,
                addedBy: req.admin?._id || 'system',
                addedAt: new Date()
            });
        }

        // Update the overall order status based on all items' statuses
        updateOrderStatusBasedOnItems(order);
        console.log(`[DEBUG] Order status updated to '${order.orderStatus}' after item update`);

        // Mark the item and order as modified to ensure Mongoose tracks the changes
        order.markModified('items');
        order.markModified('orderStatus');
        
        // Save the order with validation
        await order.save({ validateBeforeSave: true });
        
        // Explicitly update the order status and item status to ensure they're saved
        await Order.updateOne(
            { _id: order._id, 'items._id': itemId },
            { 
                $set: { 
                    orderStatus: order.orderStatus,
                    'items.$.status': itemStatus,
                    updatedAt: new Date() 
                } 
            }
        );
        
        // Alternative approach if the above still has issues
        // Find the order again to ensure we have the latest data
        const freshOrder = await Order.findById(order._id);
        if (freshOrder) {
            const freshItem = freshOrder.items.id(itemId);
            if (freshItem) {
                freshItem.status = itemStatus;
                freshOrder.orderStatus = order.orderStatus;
                freshOrder.updatedAt = new Date();
                await freshOrder.save();
            }
        }
        
        // Refresh the order to ensure we have the latest data
        const updatedOrder = await Order.findById(order._id)
            .populate('user', 'name email')
            .populate('items.product', 'name price');
            
        if (updatedOrder) {
            order = updatedOrder;
            // Re-find the item in the updated order
            item = order.items.id(itemId);
        }
        
        // Verify the status was actually updated
        console.log(`[DEBUG] After save - Item status: ${item?.status}, Order status: ${order?.orderStatus}`);
        console.log(`[DEBUG] Full order after save:`, JSON.stringify(order, null, 2));

        // Prepare response with updated status information
        const responseData = {
            success: true,
            message: 'Item status updated successfully',
            data: {
                status: itemStatus,
                statusText: status,
                statusBadgeClass: exports.getStatusBadgeClass(status),
                updatedAt: item.updatedAt,
                orderStatus: order.orderStatus,
                orderStatusText: order.orderStatus,
                orderStatusBadgeClass: exports.getStatusBadgeClass(order.orderStatus),
                nextStatuses: exports.getNextStatuses(itemStatus)
            },
            item: {
                id: item._id,
                status: itemStatus,
                statusText: status,
                statusBadgeClass: exports.getStatusBadgeClass(status)
            },
            orderStatus: order.orderStatus,
            orderStatusBadgeClass: exports.getStatusBadgeClass(order.orderStatus),
            newStatus: status
        };
        
        console.log('[DEBUG] Sending response with status mapping:', {
            itemStatus: itemStatus,
            displayStatus: status,
            orderStatus: order.orderStatus
        });
        
        console.log('[DEBUG] Sending response:', responseData); // Debug log
        return res.json(responseData);

    } catch (error) {
        console.error('Error updating item status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update item status',
            error: error.message
        });
    }
};

// Helper function to update the overall order status based on item statuses
const updateOrderStatusBasedOnItems = (order) => {
    const statusCounts = {};
    const allStatuses = order.items.map(item => item.status);
    const totalItems = order.items.length;
    
    // Count occurrences of each status
    allStatuses.forEach(status => {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    // If all items have the same status, use that as the order status
    if (Object.keys(statusCounts).length === 1) {
        order.orderStatus = Object.keys(statusCounts)[0];
    }
    // Handle specific status priorities
    else if (statusCounts['Cancelled'] === totalItems) {
        order.orderStatus = 'Cancelled';
    }
    else if (statusCounts['Returned'] > 0) {
        order.orderStatus = 'Returned';
    }
    else if (statusCounts['Return Requested'] > 0) {
        order.orderStatus = 'Return Requested';
    }
    // Handle delivered items - if any item is delivered, the order should be at least 'Shipped'
    else if (statusCounts['Delivered'] > 0) {
        if (statusCounts['Delivered'] === totalItems) {
            // All items are delivered
            order.orderStatus = 'Delivered';
            // Set the delivery date if not already set
            if (!order.deliveryDate) {
                order.deliveryDate = new Date();
                console.log(`[DEBUG] Delivery date set to: ${order.deliveryDate}`);
            }
            console.log(`[DEBUG] All items delivered, setting order status to 'Delivered'`);
        } else if (statusCounts['Shipped'] > 0 || statusCounts['Processing'] > 0) {
            // Some items delivered, others shipped or processing
            order.orderStatus = 'Shipped';
            console.log(`[DEBUG] Some items delivered, others in progress, setting status to 'Shipped'`);
        } else {
            // This should theoretically never happen, but just in case
            order.orderStatus = 'Shipped';
            console.log(`[DEBUG] Some items delivered, setting status to 'Shipped'`);
        }
    }
    // If any items are shipped, set order status to Shipped
    else if (statusCounts['Shipped'] > 0 || statusCounts['Delivered'] > 0) {
        if (statusCounts['Delivered'] > 0 && statusCounts['Delivered'] < totalItems) {
            // If some items are delivered but not all, still show as 'Shipped' but with a note
            console.log(`[DEBUG] Some items delivered (${statusCounts['Delivered']}/${totalItems}), showing as 'Shipped'`);
        } else if (statusCounts['Shipped'] > 0) {
            console.log(`[DEBUG] Order has shipped items, setting status to 'Shipped'`);
        }
        order.orderStatus = 'Shipped';
    }
    // If any items are still processing
    else if (statusCounts['Processing'] > 0) {
        order.orderStatus = 'Processing';
        console.log(`[DEBUG] Order has processing items, setting status to 'Processing'`);
    }
    // If we have a mix of statuses, use the most advanced status
    else {
        const statusPriority = [
            'Cancelled',
            'Returned',
            'Return Requested',
            'Delivered',
            'Shipped',
            'Processing'
        ];
        
        // Find the highest priority status present in the order
        for (const status of statusPriority) {
            if (statusCounts[status] > 0) {
                order.orderStatus = status;
                console.log(`[DEBUG] Setting order status to '${status}' based on priority`);
                break;
            }
        }
    }
    
    order.updatedAt = new Date();
    console.log(`[DEBUG] Updated order status to '${order.orderStatus}' based on item statuses`);
};

// This handles both order-level and item-level status updates
exports.updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status, note, itemId } = req.body; // Add itemId to handle individual items
    
    try {
        console.log(`[DEBUG] Starting status update for order=${id}, newStatus=${status}`);

        // Validate status is provided and is a string
        if (!status || typeof status !== 'string') {
            console.error('[ERROR] Invalid status value:', status);
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }
        
        // Clean and normalize the status
        const cleanStatus = status.trim();
        
        // Find the order
        const order = await Order.findById(id)
            .populate('user', 'name email')
            .populate('items.product', 'name price');
            
        if (!order) {
            console.error('[ERROR] Order not found:', id);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        // Normalize 'Active' to 'Pending' for backward compatibility
        const normalizedStatus = cleanStatus === 'Active' ? 'Pending' : cleanStatus;
        
        // We already have the order from the population above, no need to find it again

        // Check payment status for online payments
        if (order.paymentMethod === 'online' && order.paymentStatus !== PAYMENT_STATUS.PAID) {
            const message = 'Cannot update status: payment not completed';
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({
                    success: false,
                    message: message
                });
            }
            
            return res.redirect('back');
        }

        // Validate status is a valid order status
        if (!Object.values(ORDER_STATUS).includes(cleanStatus)) {
            console.error('[ERROR] Invalid status value:', cleanStatus);
            return res.status(400).json({
                success: false,
                message: `Invalid status: '${cleanStatus}'. Must be one of: ${Object.values(ORDER_STATUS).join(', ')}`
            });
        }

        // For admin, allow any valid status transition but ensure it's a valid status
        if (!Object.values(ORDER_STATUS).includes(cleanStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status: '${cleanStatus}'. Must be one of: ${Object.values(ORDER_STATUS).join(', ')}`
            });
        }
        
        // Get allowed next statuses for the current order status
        const allowedStatuses = exports.getNextStatuses(order.orderStatus);
        
        // For admin, allow any valid status transition, but log if it's not a standard transition
        if (allowedStatuses.length > 0 && !allowedStatuses.includes(cleanStatus)) {
            console.log(`[INFO] Admin is making a non-standard status transition from '${order.orderStatus}' to '${cleanStatus}'`);
        }

        console.log(`[DEBUG] Updating order status from '${order.orderStatus}' to '${cleanStatus}'`);
        console.log(`[DEBUG] Current order items:`, order.items.map(i => ({
            _id: i._id,
            status: i.status,
            product: i.product
        })));
        
        // If itemId is provided, update only that specific item
        if (itemId) {
            const itemToUpdate = order.items.id(itemId);
            if (!itemToUpdate) {
                console.error(`[ERROR] Item ${itemId} not found in order ${id}`);
                return res.status(404).json({
                    success: false,
                    message: 'Item not found in this order'
                });
            }

            // Map frontend status to backend status values
            const statusMap = {
                'Pending': 'Pending',
                'Processing': 'Processing',
                'Shipped': 'Shipped',
                'Delivered': 'Delivered',
                'Cancelled': 'Cancelled',
                'Return Requested': 'Return Requested',
                'Return Approved': 'Returned',
                'Return Rejected': 'Active',
                'Active': 'Active',
                'Returned': 'Returned',
                // Add any additional status mappings here
                'Process': 'Processing',
                'Shipping': 'Shipped',
                'Delivery': 'Delivered'
            };

            // Normalize the status value from the frontend
            const normalizedStatus = status.trim();
            const itemStatus = statusMap[normalizedStatus] || normalizedStatus;

            // Validate status against schema's allowed values
            const allowedItemStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Return Approved', 'Return Rejected', 'Active', 'Returned'];
            if (!allowedItemStatuses.includes(itemStatus)) {
                console.error(`[ERROR] Invalid status '${status}' (mapped to '${itemStatus}') for item. Allowed values: ${allowedItemStatuses.join(', ')}`);
                return res.status(400).json({
                    success: false,
                    message: `Invalid status '${status}'. Allowed values: ${allowedItemStatuses.join(', ')}`
                });
            }

            // Check if the item's current status allows this transition
            const currentItemStatus = itemToUpdate.status;
            const finalStatuses = ['Cancelled', 'Returned', 'Return Rejected'];
            
            if (finalStatuses.includes(currentItemStatus) && itemStatus !== currentItemStatus) {
                console.log(`[ERROR] Cannot update item ${itemId} - already in final status: ${currentItemStatus}`);
                return res.status(400).json({
                    success: false,
                    message: `Cannot update item - already in final status: ${currentItemStatus}`
                });
            }

            console.log(`[DEBUG] Updating item ${itemId} from '${currentItemStatus}' to '${itemStatus}'`);
            
            // Get the current item to check its current state
            const currentItem = order.items.id(itemId);
            if (!currentItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found in this order'
                });
            }

            // Prepare the update data
            const updateData = {
                'items.$.status': itemStatus,
                'items.$.updatedAt': new Date(),
                'updatedAt': new Date()
            };

            // Only set the returnRequestDate if this is a new return request
            if (itemStatus === 'Return Requested' && !currentItem.returnRequestDate) {
                updateData['items.$.returnRequestDate'] = new Date();
            }

            // Special handling for return approved status
            if (itemStatus === 'Return Approved') {
                updateData['items.$.returnStatus'] = 'Approved';
                updateData['items.$.returnProcessedDate'] = new Date();
            }

            // Update only the specific item in the database
            const result = await Order.updateOne(
                { 
                    _id: id,
                    'items._id': itemId
                },
                { $set: updateData }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Order item not found or not updated'
                });
            }

            // Get the updated order to calculate the new order status
            const updatedOrder = await Order.findById(orderId);
            let updatedItem = updatedOrder.items.id(itemId);

            // Update the overall order status based on all items
            const orderStatusUpdated = updateOrderStatusBasedOnItems(updatedOrder);
            
            // Save the updated order
            await updatedOrder.save();
            
            console.log(`[DEBUG] Successfully updated item ${itemId} status to ${itemStatus}`);
            
            // Get the latest order data after all updates
            const latestOrder = await Order.findById(orderId).populate('user', 'name email');
            updatedItem = latestOrder.items.id(itemId);
            
            // Format status text for display with more descriptive text for order status
            const formatStatusText = (status, order = null) => {
                // For items, just format the status normally
                if (!order) {
                    return status
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                }
                
                // For order status, provide more context
                const deliveredCount = order.items.filter(i => i.status === 'Delivered').length;
                const totalItems = order.items.length;
                
                if (status === 'Shipped' && deliveredCount > 0) {
                    return `In Progress (${deliveredCount}/${totalItems} Delivered)`;
                }
                
                return status
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
            };

            // Get the latest status after all updates
            const latestStatus = updatedItem.status;
            const statusText = formatStatusText(latestStatus);
            const statusBadgeClass = exports.getStatusBadgeClass(latestStatus);
            const orderStatusText = formatStatusText(latestOrder.orderStatus, latestOrder);
            const orderStatusBadgeClass = exports.getStatusBadgeClass(latestOrder.orderStatus);

            console.log(`[DEBUG] Sending response with status: ${latestStatus}, order status: ${latestOrder.orderStatus}`);

            return res.json({
                success: true,
                message: 'Order item status updated successfully',
                data: {
                    status: latestStatus,
                    statusText: statusText,
                    statusBadgeClass: statusBadgeClass,
                    updatedAt: updatedItem.updatedAt,
                    orderStatus: latestOrder.orderStatus,
                    orderStatusText: orderStatusText,
                    orderStatusBadgeClass: orderStatusBadgeClass
                }
            });
        } 
        
        // If we reach here, this is an order-level status update
        console.log(`[DEBUG] Processing order-level status update to: ${cleanStatus}`);
        
        // Update the order status - ensure it's a valid status
        if (Object.values(ORDER_STATUS).includes(cleanStatus)) {
            console.log(`[DEBUG] Updating order status from '${order.orderStatus}' to '${cleanStatus}'`);
            order.orderStatus = cleanStatus;
            order.updatedAt = new Date();
            
            // Update all items to have a valid status
            console.log(`[DEBUG] Updating items status for order ${order._id}`);
            for (const item of order.items) {
                // Map 'Active' to 'Pending' for items to maintain compatibility
                if (item.status === 'Active' || item.status === 'Pending') {
                    console.log(`[DEBUG] Updating item ${item._id} status from '${item.status}' to '${cleanStatus}'`);
                    item.status = cleanStatus; // Update item status to match the order status
                    item.updatedAt = new Date();
                }
            }
            
            // Save the order after updating status
            try {
                await order.save({ validateBeforeSave: true });
                console.log(`[DEBUG] Successfully saved order ${order._id} with status ${cleanStatus}`);
                
                // Refresh the order to get the latest data
                const updatedOrder = await Order.findById(order._id)
                    .populate('user', 'name email')
                    .populate('items.product', 'name price');
                    
                if (updatedOrder) {
                    order = updatedOrder;
                }
            } catch (saveError) {
                console.error(`[ERROR] Failed to save order ${order._id}:`, saveError);
                throw saveError;
            }
            } else {
                console.error(`[ERROR] Invalid order status: ${cleanStatus}`);
                return res.status(400).json({
                    success: false,
                    message: `Invalid order status: ${cleanStatus}`
                });
            }
        
        // Update all items if this is an order-level status update
        if (ORDER_TO_ITEM_STATUS[cleanStatus]) {
            const itemStatus = ORDER_TO_ITEM_STATUS[cleanStatus];
            console.log(`[DEBUG] Updating all items to status: ${itemStatus}`);
            
            order.items.forEach((item, index) => {
                // Normalize current status (convert 'Active' to 'Pending')
                const currentStatus = item.status === 'Active' ? 'Pending' : item.status;
                
                // Only update status if current status is not a final status
                const finalStatuses = ['Cancelled', 'Returned', 'Return Rejected'];
                
                if (!finalStatuses.includes(currentStatus)) {
                    console.log(`[DEBUG] Updating item ${index} from '${currentStatus}' to '${itemStatus}'`);
                    
                    // Make sure we're not setting an invalid status
                    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Return Approved', 'Return Rejected', 'Returned'];
                    const newStatus = validStatuses.includes(itemStatus) ? itemStatus : 'Pending';
                    
                    item.status = newStatus;
                    item.updatedAt = new Date();
                    
                    // Special handling for return approved status
                    if (cleanStatus === 'Return Approved') {
                        item.returnStatus = 'Approved';
                        item.returnProcessedDate = new Date();
                    }
                }

            }); // End of forEach

            // Save the order with validation
            try {
                await order.validate();
                await order.save();
                console.log(`[DEBUG] Order ${order._id} status updated to ${cleanStatus}`);

                // Handle return approval specific logic
                if (cleanStatus === 'Return Approved') {
                    await handleReturnApproval(order);
                    
                    // Update payment status to refunded if payment was made
                    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
                        order.paymentStatus = PAYMENT_STATUS.REFUNDED;
                        order.refundDate = new Date();
                        await order.save();
                    }
                }
            } catch (saveError) {
                console.error('[ERROR] Validation/save error:', saveError);
                throw new Error(`Failed to save order: ${saveError.message}`);
            }
        }

        // Prepare consistent response format
        const response = {
            success: true,
            message: 'Order status updated successfully',
            data: {
                status: cleanStatus,
                statusText: cleanStatus,
                statusBadgeClass: exports.getStatusBadgeClass(cleanStatus),
                nextStatuses: exports.getNextStatuses(cleanStatus),
                updatedAt: order.updatedAt,
                orderStatus: order.orderStatus,
                orderStatusText: order.orderStatus,
                orderStatusBadgeClass: exports.getStatusBadgeClass(order.orderStatus)
            }
        };

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json(response);
        }

        // For non-AJAX requests, redirect with success message
        return res.redirect(`/admin/orders/${id}?success=Order status updated successfully`);

    } catch (error) {
        console.error('[ERROR] Error in updateOrderStatus:', error);
        
        const errorMessage = error.message || 'Failed to update order status';
        console.error(`[ERROR] Failed to update order status: ${errorMessage}`, error.stack);
        
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(500).json({
                success: false,
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
        
        // For non-AJAX requests, redirect back with error message in query string
        return res.redirect(`/admin/orders/${id}?error=${encodeURIComponent(errorMessage)}`);
    }
};

// Handle return approval specific logic
async function handleReturnApproval(order) {
    try {
        console.log('[ADMIN] Processing Return Approved for order', order._id);
        
        // Restore inventory for each item
        for (const item of order.items) {
            if (item.product) {
                await Product.findByIdAndUpdate(item.product, { 
                    $inc: { quantity: item.quantity } 
                });
                console.log('[ADMIN] Inventory restored for product', item.product.toString(), 'quantity', item.quantity);
            }
        }

        // Process refund
        console.log('[ADMIN] User ID:', order.user.toString());
        let wallet = await Wallet.findOne({ user: order.user });
        
        if (!wallet) {
            console.log('[ADMIN] No wallet found, initializing new wallet');
            wallet = new Wallet({ 
                user: order.user, 
                balance: 0, 
                transactions: [] 
            });
        }
        
        const refundAmount = order.totalAmount || order.total;
        console.log('[ADMIN] Calculated refundAmount:', refundAmount);
        
        wallet.balance += refundAmount;
        wallet.transactions.push({ 
            type: 'credit', 
            amount: refundAmount, 
            description: `Refund for order ${order._id}`, 
            date: new Date(), 
            orderId: order._id.toString(), 
            status: 'completed' 
        });
        
        await wallet.save();
        await User.findByIdAndUpdate(order.user, { wallet: wallet._id });
        console.log('[ADMIN] Refund processed successfully for user:', order.user.toString());
        
    } catch (error) {
        console.error('[ERROR] Error in handleReturnApproval:', error);
        throw error; // Re-throw to be handled by the calling function
    }
}

// Get details for a specific item in an order
exports.getOrderItemDetails = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        
        const order = await Order.findOne(
            { _id: orderId, 'items._id': itemId },
            { 
                'items.$': 1, 
                orderNumber: 1, 
                orderDate: 1, 
                orderStatus: 1, 
                paymentStatus: 1, 
                paymentMethod: 1, 
                user: 1, 
                shippingAddress: 1, 
                totalAmount: 1,
                couponDiscount: 1,
                deliveryCharge: 1,
                totalSavings: 1,
                appliedCoupon: 1
            }
        )
        .populate('user', 'name email phone')
        .populate('items.product', 'name price productImage description category')
        .populate('appliedCoupon.couponId', 'code discountType discountValue minPurchase maxDiscount')
        .lean();

        if (!order) {
            return res.status(404).render('admin/error', {
                message: 'Order item not found',
                layout: 'admin/layout'
            });
        }

        // Extract the specific item
        const item = order.items[0];
        const product = item.product || {};
        
        // Format the item data
        const formattedItem = {
            ...item,
            _id: item._id.toString(),
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            orderDate: order.orderDate,
            orderStatus: order.orderStatus,
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod,
            shippingAddress: order.shippingAddress,
            totalAmount: order.totalAmount,
            user: order.user ? {
                _id: order.user._id?.toString(),
                name: order.user.name,
                email: order.user.email,
                phone: order.user.phone
            } : null,
            productDetails: {
                name: product.name || 'Product not found',
                price: product.price || 0,
                productImage: Array.isArray(product.productImage) && product.productImage.length > 0 
                    ? product.productImage
                    : ['/images/default-product.png'],
                description: product.description || '',
                category: product.category || 'Uncategorized'
            },
            totalPrice: (item.price || 0) * (item.quantity || 1),
            status: item.status || 'Pending',
            statusBadgeClass: this.getStatusBadgeClass(item.status || 'Pending'),
            nextStatuses: this.getNextStatuses(item.status || 'Pending'),
            couponDiscount: order.couponDiscount || 0,
            deliveryCharge: order.deliveryCharge || 0,
            totalSavings: order.totalSavings || 0,
            appliedCoupon: order.appliedCoupon || null
        };

        // Format payment method with icon and text
        const formattedPaymentMethod = this.formatPaymentMethod(order.paymentMethod);
        
        // Add payment ID if available
        if (order.paymentId) {
            formattedItem.paymentId = order.paymentId;
        }

        // Get the status and calculate badge class
        const itemStatus = item.status || order.orderStatus || 'Pending';
        const statusBadgeClass = this.getStatusBadgeClass(itemStatus);
        
        // Get next available statuses
        const nextStatuses = this.getNextStatuses(itemStatus);

        // Render the view with the data
        res.render('admin/order-item-details', {
            item: {
                ...formattedItem,
                status: itemStatus,
                statusBadgeClass: statusBadgeClass,
                nextStatuses: nextStatuses
            },
            paymentStatusColor: this.getPaymentStatusColor(order.paymentStatus || 'pending'),
            formattedPaymentMethod: formattedPaymentMethod,
            getStatusBadgeClass: this.getStatusBadgeClass.bind(this),
            getNextStatuses: this.getNextStatuses.bind(this),
            layout: false  // We're using a complete HTML template with header/footer included
        });

    } catch (error) {
        console.error('Error fetching order item details:', error);
        res.status(500).render('admin/error', {
            message: 'Failed to fetch order item details',
            error: { message: error.message },
            layout: 'admin/layout'
        });
    }
};

exports.getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email phone')
            .populate('items.product', 'name price images description category')
            .lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Format items with product details
        if (order.items && order.items.length > 0) {
            order.items = order.items.map(item => {
                const product = item.product || {};
                return {
                    ...item,
                    productDetails: {
                        name: product.name || 'Product not found',
                        price: product.price || 0,
                        image: product.images?.[0] || '/images/default-product.png',
                        description: product.description || '',
                        category: product.category || 'Uncategorized'
                    },
                    totalPrice: (item.price || 0) * (item.quantity || 1),
                    status: item.status || 'Pending',
                    statusBadgeClass: this.getStatusBadgeClass(item.status || 'Pending')
                };
            });
        }

        const formattedOrder = {
            ...order,
            statusBadgeClass: this.getStatusBadgeClass(order.orderStatus),
            paymentStatusColor: this.getPaymentStatusColor(order.paymentStatus),
            formattedPaymentMethod: this.formatPaymentMethod(order.paymentMethod),
            nextStatuses: this.getNextStatuses(order.orderStatus),
            itemStatuses: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Return Approved', 'Return Rejected']
        };

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                order: formattedOrder
            });
        }

        res.render('admin/order-details', {
            title: `Order #${order._id.toString().slice(-6).toUpperCase()}`,
            order: formattedOrder,
            getStatusBadgeClass: this.getStatusBadgeClass,
            getNextStatuses: this.getNextStatuses,
            getPaymentStatusColor: this.getPaymentStatusColor,
            formatPaymentMethod: this.formatPaymentMethod
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
}; 

exports.handleRefund = async (order, item) => {
    try {
        console.log('[REFUND][DEBUG] Attempting refund for order:', order._id, 'item:', item._id);
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
            console.log('[REFUND][DEBUG] No wallet found, creating new wallet for user:', order.user);
            wallet = new Wallet({ user: order.user, balance: 0, transactions: [] });
        }

        const unitPrice = item.offerPrice != null ? item.offerPrice : item.price;
        const refundAmount = unitPrice * (item.quantity || 1);

        if (refundAmount > 0) {
            console.log('[REFUND][DEBUG] Wallet before save:', JSON.stringify(wallet));
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

            item.refundAmount = refundAmount;
            item.refundStatus = 'Completed';
            item.refundDate = new Date();
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

exports.handleReturnAction = async (req, res) => {
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


