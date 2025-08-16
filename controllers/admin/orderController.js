const mongoose = require('mongoose');
const { Order, ORDER_STATUS, PAYMENT_STATUS, ORDER_TO_ITEM_STATUS } = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');



// Define valid status transitions
const STATUS_TRANSITIONS = {
    'Pending': ['Processing', 'Cancelled'],
    'Processing': ['Shipped', 'Cancelled'],
    'Shipped': ['Delivered'],
    'Delivered': [],
    'Cancelled': [],
    'Return Requested': ['Return Approved', 'Return Rejected'],
    'Return Approved': ['Return Completed'],
    'Return Rejected': [],
    'Return Completed': []
};

// Get next available statuses for an order item
exports.getNextStatuses = (currentStatus) => {
    const statusMap = {
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered'],
        'Delivered': [],
        'Cancelled': [],
        'Return Requested': ['Return Approved', 'Return Rejected'],
        'Return Approved': ['Return Completed'],
        'Return Rejected': [],
        'Return Completed': []
    };
    
    return statusMap[currentStatus] || [];
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
// Format payment status for display
exports.getPaymentStatusColor = (status) => {
    const statusColors = {
        [PAYMENT_STATUS.PENDING]: 'text-warning',
        [PAYMENT_STATUS.COMPLETED]: 'text-success',
        [PAYMENT_STATUS.FAILED]: 'text-danger',
        [PAYMENT_STATUS.REFUNDED]: 'text-info'
    };
    return statusColors[status] || 'text-secondary';
};

// Format payment method for display
exports.formatPaymentMethod = (method) => {
    const methodNames = {
        'CREDIT_CARD': 'Credit Card',
        'DEBIT_CARD': 'Debit Card',
        'UPI': 'UPI',
        'WALLET': 'Wallet'
    };
    return methodNames[method] || method;
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
                  .filter(o => o._id.toString().slice(-6).toUpperCase() === idPart)
                  .map(o => o._id);
                if (matchedOrderIds.length > 0) {
                  filter._id = { $in: matchedOrderIds };
                } else {
                  // No matches found, return empty result
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
                // Don't filter by orderStatus here, we'll handle it in the post-processing
                delete filter.orderStatus;
                // We'll handle status filtering in the post-processing
            } else if (searchType === 'payment') {
                filter.paymentMethod = { $regex: searchValue, $options: 'i' };
            }
        }

        // First, get all matching orders without pagination to properly filter by item status
        let orders = await Order.find(filter)
            .sort({ createdAt: -1 })
            .populate('user', 'name email')
            .populate('items.product', 'name image')
            .lean();
            
        // Process orders and filter items based on status if searching by status
        const processedOrders = [];
        
        orders.forEach(order => {
            if (order.items && order.items.length > 0) {
                // Create a copy of the order to avoid modifying the original
                const orderCopy = JSON.parse(JSON.stringify(order));
                
                // If searching by status, filter items to only include matching status
                if (searchType === 'status' && search && search.trim()) {
                    const searchTerm = search.trim().toLowerCase();
                    
                    // First check if any item matches the status
                    const hasMatchingItem = orderCopy.items.some(item => 
                        item.status && item.status.toLowerCase().includes(searchTerm)
                    );
                    
                    if (hasMatchingItem) {
                        // Filter items to only show matching status
                        orderCopy.items = orderCopy.items.filter(item => 
                            item.status && item.status.toLowerCase().includes(searchTerm)
                        );
                        
                        // Map product details to each matching item
                        orderCopy.items = orderCopy.items.map(item => {
                            if (item.product && typeof item.product === 'object') {
                                item.productDetails = {
                                    name: item.product.name,
                                    image: item.product.image
                                };
                            }
                            return item;
                        });
                        
                        processedOrders.push(orderCopy);
                    }
                } else {
                    // If not searching by status, include all items
                    orderCopy.items = orderCopy.items.map(item => {
                        if (item.product && typeof item.product === 'object') {
                            item.productDetails = {
                                name: item.product.name,
                                image: item.product.image
                            };
                        }
                        return item;
                    });
                    processedOrders.push(orderCopy);
                }
            } else if (!searchType || searchType !== 'status' || !search || !search.trim()) {
                // Include orders without items only if not searching by status
                processedOrders.push(order);
            }
        });
        
        // Handle pagination after filtering
        const totalOrders = processedOrders.length;
        const paginatedOrders = processedOrders.slice(skip, skip + limit);

        const formattedOrders = paginatedOrders.map(order => ({
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
                totalOrders: totalOrders,
                totalPages: Math.ceil(totalOrders / limit)
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
    try {
        const { itemId } = req.params;
        const { status, note } = req.body;

        // Find the order that contains this item
        const order = await Order.findOne({ 'items._id': itemId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order item not found'
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
    } catch (error) {
        console.error('Error in refundToWallet:', error);
        throw error; // Re-throw to be caught by the caller
    }
};

exports.getOrderItemDetails = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    // Fetch full order
    const order = await Order.findOne(
      { _id: orderId },
      { 
        items: 1,
        orderNumber: 1,
        orderDate: 1,
        orderStatus: 1,
        paymentStatus: 1,
        paymentMethod: 1,
        user: 1,
        shippingAddress: 1,
        totalAmount: 1,
        deliveryCharge: 1,
        appliedCoupon: 1,
        couponDiscount: 1
      }
    )
    .populate('user', 'name email phone')
    .populate('items.product', 'name price regularPrice productImage description category')
    .lean();

    if (!order) {
      return res.status(404).render('admin/error', {
        message: 'Order not found',
        layout: 'admin/layout'
      });
    }

    // Find the specific item
    const item = order.items.find(i => i._id.toString() === itemId);
    if (!item) {
      return res.status(404).render('admin/error', {
        message: 'Order item not found',
        layout: 'admin/layout'
      });
    }

    const product = item.product || {};
    const itemSubtotal = (item.price || 0) * (item.quantity || 1);

    // ====== Coupon Handling (Proportional Allocation) ======
    let itemCouponDiscount = 0;
    let couponRatio = 0;

    if (order.couponDiscount && order.couponDiscount > 0) {
      // Compute subtotal of ALL items in order (not just the selected one)
      const orderSubtotal = order.items.reduce((sum, i) => {
        return sum + ((i.price || 0) * (i.quantity || 1));
      }, 0);

      if (orderSubtotal > 0) {
        couponRatio = itemSubtotal / orderSubtotal;
        itemCouponDiscount = Math.round(order.couponDiscount * couponRatio * 100) / 100;
        itemCouponDiscount = Math.min(itemCouponDiscount, itemSubtotal);
      }
    }

    // Format item for rendering
    const formattedItem = {
      _id: item._id,
      product: {
        _id: product._id,
        name: product.name || 'Product not found',
        price: item.price || product.price || 0,
        regularPrice: product.regularPrice || (item.price || 0),
        image: product.productImage || '/images/default-product.png',
        description: product.description || '',
        category: product.category || 'Uncategorized'
      },
      quantity: item.quantity || 1,
      regularPrice: product.regularPrice || (item.price || 0),
      price: item.price || 0,
      status: item.status || 'Pending',
      createdAt: item.createdAt || order.orderDate,
      updatedAt: item.updatedAt || new Date()
    };

    const itemStatus = item.status || 'Pending';
    const statusBadgeClass = this.getStatusBadgeClass(itemStatus);
    const nextStatuses = this.getNextStatuses(itemStatus);

    // Payment method formatting
    let formattedPaymentMethod = 'Unknown';
    if (order.paymentMethod === 'cod') formattedPaymentMethod = 'Cash on Delivery';
    else if (order.paymentMethod === 'online') formattedPaymentMethod = 'Online Payment';
    else if (order.paymentMethod === 'wallet') formattedPaymentMethod = 'Wallet';

    res.render('admin/order-item-details', {
      item: {
        ...formattedItem,
        orderId: order._id,
        status: itemStatus,
        statusBadgeClass,
        nextStatuses,
        couponDiscount: itemCouponDiscount,
        couponRatio: (couponRatio * 100).toFixed(2),
        user: order.user,
        shippingAddress: order.shippingAddress,
        orderDate: order.orderDate,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        appliedCoupon: order.appliedCoupon
      },
      itemSubtotal,
      deliveryCharge: order.deliveryCharge || 0,
      finalTotal: itemSubtotal - itemCouponDiscount + (order.deliveryCharge || 0),
      paymentStatusColor: this.getPaymentStatusColor(order.paymentStatus || 'pending'),
      formattedPaymentMethod,
      getStatusBadgeClass: this.getStatusBadgeClass.bind(this),
      getNextStatuses: this.getNextStatuses.bind(this),
      layout: false,
      user: order.user,
      shippingAddress: order.shippingAddress
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
            .populate({
                path: 'appliedCoupon.couponId',
                select: 'code discountType discountValue minPurchase maxDiscount',
                model: 'Coupon'
            })
            .lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        // Process applied coupon data and calculate discount ratio
        if (order.appliedCoupon?.couponId) {
            const coupon = order.appliedCoupon.couponId;
            order.appliedCoupon = {
                ...order.appliedCoupon,
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                minPurchase: coupon.minPurchase,
                maxDiscount: coupon.maxDiscount,
                actualDiscount: order.couponDiscount || 0
            };
            
            // Calculate the ratio of discount to order subtotal (before discount)
            const subtotalBeforeDiscount = (order.totalAmount || 0) + (order.couponDiscount || 0);
            if (subtotalBeforeDiscount > 0) {
                order.appliedCoupon.discountRatio = (order.appliedCoupon.actualDiscount / subtotalBeforeDiscount) * 100;
            } else {
                order.appliedCoupon.discountRatio = 0;
            }
        }

        // Format items with product details and calculate item-level coupon discount
        if (order.items && order.items.length > 0) {
            // Calculate total subtotal for proportional distribution
            const orderSubtotal = order.items.reduce((sum, item) => {
                const itemPrice = item.price || (item.product?.price || 0);
                return sum + (itemPrice * (item.quantity || 1));
            }, 0);
            
            order.items = order.items.map(item => {
                const itemPrice = item.price || (item.product?.price || 0);
                const itemSubtotal = itemPrice * (item.quantity || 1);
                
                // Calculate item's share of coupon discount
                let itemCouponDiscount = 0;
                if (order.couponDiscount && orderSubtotal > 0) {
                    itemCouponDiscount = parseFloat(((itemSubtotal / orderSubtotal) * order.couponDiscount).toFixed(2));
                }
                
                // Add coupon information to item
                if (order.appliedCoupon?.code) {
                    item.couponCode = order.appliedCoupon.code;
                    item.couponDiscount = itemCouponDiscount;
                    item.finalPrice = Math.max(0, itemSubtotal - itemCouponDiscount);
                }
                
                // Format other item details
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
                    couponDiscount: 0,
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

