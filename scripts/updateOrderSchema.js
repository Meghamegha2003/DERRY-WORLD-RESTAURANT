const mongoose = require('mongoose');
const { Order } = require('../models/orderSchema');

async function updateOrderSchema() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/DERRY_WORLD');
        console.log('Connected to MongoDB');

        // Update the schema to include orderNumber with a default value
        const result = await Order.updateMany(
            { orderNumber: { $exists: false } },
            [{
                $set: {
                    orderNumber: {
                        $concat: [
                            'ORD-',
                            { $toString: { $toLong: '$createdAt' } },
                            '-',
                            { $toString: { $floor: { $multiply: [Math.random(), 10000] } } }
                        ]
                    }
                }
            }],
            { multi: true }
        );

        console.log(`Updated ${result.nModified} orders with generated order numbers`);

        // Drop existing index if it exists
        try {
            await Order.collection.dropIndex('orderNumber_1');
            console.log('Dropped existing orderNumber index');
        } catch (e) {
            console.log('No existing orderNumber index to drop or error dropping index:', e.message);
        }

        // Create a new unique index with sparse:true to allow multiple nulls
        await Order.collection.createIndex(
            { orderNumber: 1 },
            { 
                unique: true,
                sparse: true,
                background: true,
                name: 'orderNumber_1'
            }
        );
        console.log('Created new unique index on orderNumber');

        console.log('Schema update completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error updating order schema:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
    }
}

updateOrderSchema();
