const mongoose = require('mongoose');
const { Order } = require('../models/orderSchema');
const config = require('../config/config');

async function updateOrderIdStrings() {
    try {
        // Connect to MongoDB
        await mongoose.connect(config.database.connectionString, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Find all orders that don't have idString set
        const orders = await Order.find({ idString: { $exists: false } });
        console.log(`Found ${orders.length} orders to update`);

        // Update each order with idString
        for (const order of orders) {
            order.idString = order._id.toString();
            await order.save();
        }

        console.log('Successfully updated all orders with idString');
        process.exit(0);
    } catch (error) {
        console.error('Error updating orders:', error);
        process.exit(1);
    }
}

updateOrderIdStrings();
