// Migration script to update existing orders with new coupon calculation system
const mongoose = require('mongoose');
const { Order } = require('../models/orderSchema');
const Coupon = require('../models/couponSchema');
const { updateOrderCouponCalculations } = require('../helpers/couponHelper');

/**
 * Migration script to update all existing orders with proper coupon calculations
 */
async function migrateCouponCalculations() {
  try {
    console.log('Starting coupon calculation migration...');
    
    // Find all orders that have coupon applied but missing new fields
    const ordersToMigrate = await Order.find({
      $or: [
        { 'appliedCoupon.code': { $exists: true } },
        { couponDiscount: { $gt: 0 } },
        { totalCoupon: { $exists: false } },
        { balanceCoupon: { $exists: false } }
      ]
    }).populate('items.product');
    
    console.log(`Found ${ordersToMigrate.length} orders to migrate`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const order of ordersToMigrate) {
      try {
        console.log(`Migrating order ${order._id}...`);
        
        // Get coupon if applied
        let coupon = null;
        if (order.appliedCoupon && order.appliedCoupon.couponId) {
          coupon = await Coupon.findById(order.appliedCoupon.couponId);
        } else if (order.appliedCoupon && order.appliedCoupon.code) {
          coupon = await Coupon.findOne({ code: order.appliedCoupon.code });
        }
        
        // Update coupon calculations
        await updateOrderCouponCalculations(order, coupon);
        
        // Save the updated order
        await order.save();
        
        migratedCount++;
        console.log(`✓ Migrated order ${order._id}`);
        
      } catch (error) {
        errorCount++;
        console.error(`✗ Error migrating order ${order._id}:`, error.message);
      }
    }
    
    console.log('\nMigration completed:');
    console.log(`✓ Successfully migrated: ${migratedCount} orders`);
    console.log(`✗ Errors: ${errorCount} orders`);
    
    return { migratedCount, errorCount };
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration (reset coupon fields to original state)
 */
async function rollbackCouponMigration() {
  try {
    console.log('Starting coupon migration rollback...');
    
    const result = await Order.updateMany(
      {},
      {
        $unset: {
          totalCoupon: "",
          deductRefundCoupon: "",
          balanceCoupon: "",
          'items.$[].individualCoupon': "",
          'items.$[].deductRefundCoupon': ""
        }
      }
    );
    
    console.log(`Rollback completed. Modified ${result.modifiedCount} orders`);
    return result;
    
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

/**
 * Validate migration results
 */
async function validateMigration() {
  try {
    console.log('Validating migration results...');
    
    const totalOrders = await Order.countDocuments({
      $or: [
        { 'appliedCoupon.code': { $exists: true } },
        { couponDiscount: { $gt: 0 } }
      ]
    });
    
    const migratedOrders = await Order.countDocuments({
      $and: [
        {
          $or: [
            { 'appliedCoupon.code': { $exists: true } },
            { couponDiscount: { $gt: 0 } }
          ]
        },
        { totalCoupon: { $exists: true } },
        { balanceCoupon: { $exists: true } }
      ]
    });
    
    const validationResult = {
      totalOrdersWithCoupons: totalOrders,
      migratedOrders: migratedOrders,
      migrationComplete: totalOrders === migratedOrders
    };
    
    console.log('Validation results:', validationResult);
    return validationResult;
    
  } catch (error) {
    console.error('Validation failed:', error);
    throw error;
  }
}

// CLI execution
if (require.main === module) {
  const command = process.argv[2];
  
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/derry-world')
    .then(async () => {
      console.log('Connected to MongoDB');
      
      switch (command) {
        case 'migrate':
          await migrateCouponCalculations();
          break;
        case 'rollback':
          await rollbackCouponMigration();
          break;
        case 'validate':
          await validateMigration();
          break;
        default:
          console.log('Usage: node migrateCouponCalculations.js [migrate|rollback|validate]');
      }
      
      process.exit(0);
    })
    .catch(error => {
      console.error('Database connection failed:', error);
      process.exit(1);
    });
}

module.exports = {
  migrateCouponCalculations,
  rollbackCouponMigration,
  validateMigration
};
