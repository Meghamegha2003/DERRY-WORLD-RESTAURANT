const mongoose = require('mongoose');
const { Order } = require('../models/orderSchema');

async function fixNullOrderNumbers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/DERRY_WORLD', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');
        
        // First, update all orders with null orderNumber
        const result = await Order.updateMany(
            { orderNumber: { $exists: false } },
            [{
                $set: {
                    orderNumber: {
                        $concat: [
                            'ORD-',
                            { $toString: { $toLong: '$createdAt' } },
                            '-',
                            { $toString: { $floor: { $multiply: [Math.random(), 1000] } } }
                        ]
                    }
                }
            }]
        );
        
        console.log(`Updated ${result.nModified} orders with null orderNumber`);
        
        // Now drop and recreate the index
        try {
            await Order.collection.dropIndex('orderNumber_1');
            console.log('Dropped existing orderNumber index');
        } catch (e) {
            console.log('No existing orderNumber index to drop');
        }
        
        // Create a new unique index
        await Order.collection.createIndex({ orderNumber: 1 }, { unique: true });
        console.log('Created new unique index on orderNumber');
        
        console.log('Order number fix completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error fixing order numbers:', error);
        process.exit(1);
    }
}

fixNullOrderNumbers();
