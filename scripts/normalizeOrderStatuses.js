const mongoose = require('mongoose');
require('dotenv').config();
const { Order } = require('../models/orderSchema');

async function normalizeStatuses() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/derry', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Find all orders with 'Active' status or items with 'Active' status
        const orders = await Order.find({
            $or: [
                { orderStatus: 'Active' },
                { 'items.status': 'Active' }
            ]
        });

        console.log(`Found ${orders.length} orders with 'Active' status`);

        let updatedCount = 0;
        let itemUpdatedCount = 0;

        // Update each order
        for (const order of orders) {
            let needsUpdate = false;

            // Update order status if it's 'Active'
            if (order.orderStatus === 'Active') {
                order.orderStatus = 'Pending';
                needsUpdate = true;
                updatedCount++;
            }

            // Update item statuses
            for (const item of order.items) {
                if (item.status === 'Active') {
                    item.status = 'Pending';
                    needsUpdate = true;
                    itemUpdatedCount++;
                }
            }

            // Save the order if it was modified
            if (needsUpdate) {
                await order.save();
            }
        }

        console.log('\n--- Update Summary ---');
        console.log(`Orders updated: ${updatedCount}`);
        console.log(`Order items updated: ${itemUpdatedCount}`);
        console.log('Status normalization completed successfully!');

    } catch (error) {
        console.error('Error normalizing order statuses:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
    }
}

// Run the migration
normalizeStatuses();
