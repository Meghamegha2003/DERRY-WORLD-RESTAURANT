const mongoose = require('mongoose');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../../models/orderSchema');

// Date formatting helper function
const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const ITEMS_PER_PAGE = 10;

// Get sales report page
exports.getSalesReport = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const searchQuery = req.query.search || '';
        const searchType = req.query.searchType || 'orderId';
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';

        // Base query - will apply filters as needed
        let query = {};

        // Apply search filters
        if (searchQuery) {
            if (searchType === 'orderId') {
                // For ObjectId search, we'll use a direct match instead of regex
                if (mongoose.Types.ObjectId.isValid(searchQuery)) {
                    query._id = new mongoose.Types.ObjectId(searchQuery);
                } else {
                    // If not a valid ObjectId, try partial match with the end of the ID
                    query._id = { $regex: searchQuery + '$', $options: 'i' };
                }
            } else if (searchType === 'customer') {
                // Will be handled in the aggregation pipeline after user lookup
                query['userDetails.name'] = { $regex: searchQuery, $options: 'i' };
            } else if (searchType === 'payment') {
                query.paymentMethod = { $regex: searchQuery, $options: 'i' };
            }
            // Product search is handled separately in the pipeline
        }

        // Apply date range filter
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
            };
        }

        // Get total count of delivered items for pagination
        const countPipeline = [
            { $match: query },
            { $unwind: '$items' },
            { $match: { 'items.status': 'Delivered' } }
        ];
        
        // Apply search filters for product name if needed
        if (searchQuery && searchType === 'product') {
            const productSearch = { $regex: searchQuery, $options: 'i' };
            countPipeline.push({
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            });
            countPipeline.push({
                $match: { 'productDetails.name': productSearch }
            });
        }
        
        countPipeline.push({ $count: 'total' });
        
        const totalItemsResult = await Order.aggregate(countPipeline);
        const totalItems = totalItemsResult[0]?.total || 0;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        // Get paginated orders with delivered items only
        const pipeline = [
            // Match orders with status 'Delivered' and apply base filters
            { $match: query },
            // Lookup user details first
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
            // Apply customer name filter if searching by customer
            ...(searchQuery && searchType === 'customer' ? [{
                $match: {
                    'userDetails.name': { $regex: searchQuery, $options: 'i' }
                }
            }] : []),
            // Filter out non-delivered items while preserving the original order items
            {
                $addFields: {
                    filteredItems: {
                        $filter: {
                            input: '$items',
                            as: 'item',
                            cond: { $eq: ['$$item.status', 'Delivered'] }
                        }
                    }
                }
            },
            // Only proceed with orders that have delivered items
            { $match: { 'filteredItems.0': { $exists: true } } },
            // Replace items with filtered items
            {
                $addFields: {
                    items: '$filteredItems'
                }
            },
            { $project: { filteredItems: 0 } },
            // Lookup product details only for delivered items
            {
                $lookup: {
                    from: 'products',
                    let: { items: '$items' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: ['$_id', '$$items.product']
                                }
                            }
                        }
                    ],
                    as: 'productDetails'
                }
            },
            // Calculate the number of items before unwinding
            {
                $addFields: {
                    itemsCount: { $size: '$items' },
                    // Calculate total order amount
                    orderTotal: {
                        $reduce: {
                            input: '$items',
                            initialValue: 0,
                            in: { $add: ['$$value', { $multiply: ['$$this.price', '$$this.quantity'] }] }
                        }
                    },
                    // Calculate coupon discount per item based on price ratio
                    items: {
                        $map: {
                            input: '$items',
                            as: 'item',
                            in: {
                                $mergeObjects: [
                                    '$$item',
                                    {
                                        itemTotal: { $multiply: ['$$item.price', '$$item.quantity'] },
                                        hasCoupon: { $gt: [{ $ifNull: ['$couponDiscount', 0] }, 0] }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            // Calculate total before discount
            {
                $addFields: {
                    totalBeforeDiscount: {
                        $reduce: {
                            input: '$items',
                            initialValue: 0,
                            in: { $add: ['$$value', '$$this.itemTotal'] }
                        }
                    }
                }
            },
            // Distribute coupon discount proportionally
            {
                $addFields: {
                    items: {
                        $map: {
                            input: '$items',
                            as: 'item',
                            in: {
                                $mergeObjects: [
                                    '$$item',
                                    {
                                        itemCouponDiscount: {
                                            $cond: [
                                                { $and: [
                                                    '$$item.hasCoupon',
                                                    { $gt: ['$totalBeforeDiscount', 0] }
                                                ]},
                                                {
                                                    $min: [
                                                        {
                                                            $multiply: [
                                                                { $divide: ['$$item.itemTotal', '$totalBeforeDiscount'] },
                                                                '$couponDiscount'
                                                            ]
                                                        },
                                                        '$$item.itemTotal'
                                                    ]
                                                },
                                                0
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            // Unwind items to process each one
            { $unwind: '$items' },
            // Match the product details with the items
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'items.productDetails'
                }
            },
            { $unwind: { path: '$items.productDetails', preserveNullAndEmptyArrays: true } },
            // Apply product name filter if searching by product
            ...(searchQuery && searchType === 'product' ? [{
                $match: {
                    'items.productDetails.name': { $regex: searchQuery, $options: 'i' }
                }
            }] : []),
            // Group by order and collect all items
            {
                $group: {
                    _id: '$_id',
                    // Preserve order details
                    orderNumber: { $first: '$orderNumber' },
                    user: { $first: '$userDetails' },
                    paymentMethod: { $first: '$paymentMethod' },
                    orderStatus: { $first: '$orderStatus' },
                    createdAt: { $first: '$createdAt' },
                    updatedAt: { $first: '$updatedAt' },
                    totalAmount: { $first: '$totalAmount' },
                    appliedCoupon: { $first: '$appliedCoupon' },
                    couponDiscount: { $first: '$couponDiscount' },
                    deliveryCharge: { $first: '$deliveryCharge' },
                    // Collect all items
                    items: {
                        $push: {
                            _id: '$items._id',
                            product: {
                                _id: '$items.product',
                                name: '$items.productDetails.name',
                                images: '$items.productDetails.images',
                                category: '$items.productDetails.category',
                                price: '$items.price'
                            },
                            quantity: '$items.quantity',
                            price: '$items.price',
                            status: 'Delivered', // Only showing delivered items
                            total: { 
                                $subtract: [
                                    { $multiply: ['$items.price', '$items.quantity'] },
                                    { $ifNull: ['$items.itemCouponDiscount', 0] }
                                ]
                            },
                            // Item coupon discount (already calculated at order level)
                            itemCouponDiscount: { $ifNull: ['$items.itemCouponDiscount', 0] },
                            subtotal: { $multiply: ['$items.price', '$items.quantity'] }
                        }
                    }
                }
            },
            // Ensure we only return orders with items
            { $match: { 'items.0': { $exists: true } } },
            // Sort by creation date
            { $sort: { createdAt: -1 } },
            // Pagination
            { $skip: (page - 1) * ITEMS_PER_PAGE },
            { $limit: ITEMS_PER_PAGE }
        ];
        
        console.log('Aggregation Pipeline:', JSON.stringify(pipeline, null, 2));
        const orders = await Order.aggregate(pipeline);
        console.log('Found orders:', orders.length);
        
        // Debug: Log the first order's items to check status
        if (orders.length > 0) {
            console.log('First order items:', JSON.stringify(orders[0].items, null, 2));
        } else {
            console.log('No orders found with the current filters');
        }

        // Calculate total sales from delivered items in delivered orders
        const totalSales = await Order.aggregate([
            { $match: { orderStatus: 'Delivered' } },
            { $unwind: '$items' },
            { $match: { 'items.status': 'Delivered' } },
            {
                $group: {
                    _id: null,
                    total: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Render the sales report view
        res.render('admin/sales-report', {
            title: 'Sales Report',
            orders: orders,
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalItems,
            searchQuery: searchQuery,
            searchType: searchType,
            startDate: startDate,
            endDate: endDate,
            totalSales: totalSales[0]?.total || 0,
            totalOrders: totalSales[0]?.count || 0,
            formatDate: formatDate,
            formatCurrency: (amount) => {
                return new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR'
                }).format(amount);
            }
        });
    } catch (error) {
        console.error('Error fetching sales report:', error);
        req.flash('error', 'Error fetching sales report. Please try again.');
        res.redirect('/admin/dashboard');
    }
}

// Export sales report
exports.exportSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, search, searchType } = req.query;
        
        // Base query to match only delivered orders
        let query = { orderStatus: 'Delivered' };

        // Apply search filters if provided
        if (search) {
            if (searchType === 'orderId') {
                if (mongoose.Types.ObjectId.isValid(search)) {
                    query._id = new mongoose.Types.ObjectId(search);
                } else {
                    query._id = { $regex: search + '$', $options: 'i' };
                }
            } else if (searchType === 'payment') {
                query.paymentMethod = { $regex: search, $options: 'i' };
            }
        }

        // Apply date range filter if provided
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
            };
        }

        // Get all delivered orders with their delivered items for export
        const orders = await Order.aggregate([
            { $match: query },
            // Lookup product details
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: { path: '$productDetails', preserveNullAndEmptyArrays: true } },
            // Lookup user details
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
            // Group and format the data
            {
                $group: {
                    _id: '$_id',
                    user: { $first: '$userDetails' },
                    items: {
                        $push: {
                            _id: '$items._id',
                            product: {
                                _id: '$productDetails._id',
                                name: '$productDetails.name',
                                price: '$items.price' // Use the price at time of order
                            },
                            quantity: '$items.quantity',
                            price: '$items.price',
                            status: '$items.status',
                            total: { $multiply: ['$items.price', '$items.quantity'] }
                        }
                    },
                    paymentMethod: { $first: '$paymentMethod' },
                    orderStatus: { $first: '$orderStatus' },
                    createdAt: { $first: '$createdAt' },
                    updatedAt: { $first: '$updatedAt' },
                    totalAmount: { $first: '$totalAmount' }
                }
            },
            { $sort: { createdAt: -1 } }
        ]);

        // Format data for CSV - only includes delivered items from delivered orders
        let csv = 'Order ID,Date,Customer,Product,Quantity,Price,Total,Payment Method\n';

        orders.forEach(order => {
            // Since we've already filtered in the aggregation, all items here are delivered
            order.items.forEach(item => {
                const orderDate = new Date(order.createdAt).toLocaleDateString();
                const total = item.price * item.quantity;

                csv += `"${order._id.toString()}",`;
                csv += `"${orderDate}",`;
                csv += `"${order.user?.name || 'Guest'}",`;
                csv += `"${item.product?.name || 'N/A'}",`;
                csv += `"${item.quantity}",`;
                csv += `"${item.price.toFixed(2)}",`;
                csv += `"${total.toFixed(2)}",`;
                csv += `"${order.paymentMethod || 'N/A'}"\n`;
            });
        });

        // Set headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.csv');
        res.send(csv);
    } catch (error) {
        console.error('Error exporting sales report:', error);
        if (req.session) {
            req.session.error = 'Error exporting sales report';
        }
        res.redirect('/admin/sales-report');
    }
};
