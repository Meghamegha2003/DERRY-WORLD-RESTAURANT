const mongoose = require('mongoose');
const { Order } = require('../models/orderSchema');

async function fixOrderNumberIndex() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/DERRY_WORLD', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');
        
        // Drop the unique index on orderNumber
        await mongoose.connection.db.collection('orders').dropIndex('orderNumber_1');
        console.log('Dropped unique index on orderNumber');
        
        // Create a non-unique index instead
        await Order.collection.createIndex({ orderNumber: 1 }, { unique: false });
        console.log('Created non-unique index on orderNumber');
        
        console.log('Index fix completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error fixing orderNumber index:', error);
        process.exit(1);
    }
}

fixOrderNumberIndex();
