# Coupon System Testing Guide

## Overview
This document provides comprehensive testing instructions for the new coupon calculation system implemented in the DERRY restaurant application.

## System Components

### 1. Database Schema Updates
- **Order Schema**: Added `totalCoupon`, `deductRefundCoupon`, `balanceCoupon` fields
- **Order Items**: Added `individualCoupon`, `deductRefundCoupon`, `couponRatio` fields
- **Coupon Schema**: Enhanced with `maxDiscount` field and calculation methods

### 2. Core Functions
- `calculateTotalCoupon()`: Calculates total coupon discount for an order
- `calculateIndividualCoupon()`: Calculates proportional coupon per item
- `calculateDeductRefundCoupon()`: Calculates coupon deduction for cancelled/returned items
- `calculateBalanceCoupon()`: Calculates remaining coupon after deductions
- `updateOrderCouponCalculations()`: Updates all coupon fields on an order

## Testing Scenarios

### Scenario 1: Order Creation with Coupon
**Test Steps:**
1. Create a cart with multiple items (total ₹1000)
2. Apply a 10% coupon (max discount ₹100)
3. Complete checkout
4. Verify order fields:
   - `totalCoupon`: ₹100
   - `balanceCoupon`: ₹100
   - `deductRefundCoupon`: ₹0
   - Each item has `individualCoupon` calculated proportionally

**Expected Results:**
- Total coupon discount applied correctly
- Individual item coupons sum to total coupon
- Frontend displays accurate coupon breakdown

### Scenario 2: Single Item Cancellation
**Test Steps:**
1. Use order from Scenario 1
2. Cancel one item worth ₹300
3. Verify calculations:
   - Item `deductRefundCoupon`: ₹30 (300/1000 * 100)
   - Order `deductRefundCoupon`: ₹30
   - Order `balanceCoupon`: ₹70
   - Refund amount: ₹270 (300 - 30)

**Expected Results:**
- Proportional coupon deduction applied
- Remaining coupon balance updated
- Frontend shows updated totals

### Scenario 3: Multiple Item Cancellations
**Test Steps:**
1. Use order from Scenario 1
2. Cancel items worth ₹300 and ₹200 separately
3. Verify after each cancellation:
   - First cancellation: deductRefundCoupon = ₹30, balanceCoupon = ₹70
   - Second cancellation: deductRefundCoupon = ₹50, balanceCoupon = ₹50

**Expected Results:**
- Each cancellation applies correct proportional deduction
- Cumulative deductions tracked accurately
- Consistent refund calculations

### Scenario 4: Return Request and Approval
**Test Steps:**
1. Request return for an item
2. Admin approves return
3. Verify coupon calculations update correctly
4. Check refund processing

**Expected Results:**
- Return approval triggers coupon recalculation
- Refund includes correct coupon deduction
- Order totals updated accurately

### Scenario 5: Migration Testing
**Test Steps:**
1. Create test orders with old coupon structure
2. Run migration script: `node migrations/migrateCouponCalculations.js migrate`
3. Validate results: `node migrations/migrateCouponCalculations.js validate`
4. Verify migrated orders have new fields populated

**Expected Results:**
- All orders with coupons migrated successfully
- New coupon fields populated with accurate values
- No data loss during migration

## Test Data Setup

### Sample Coupon
```javascript
{
  code: "TEST10",
  discountType: "percentage",
  discountValue: 10,
  maxDiscount: 100,
  minPurchase: 500,
  isActive: true
}
```

### Sample Order Items
```javascript
[
  { product: "Product1", price: 400, quantity: 1 }, // ₹400
  { product: "Product2", price: 300, quantity: 2 }, // ₹600
  // Total: ₹1000, Coupon: ₹100
]
```

## Validation Checklist

### Frontend Validation
- [ ] Coupon breakdown displays correctly in order details
- [ ] Price summary updates dynamically after cancellations
- [ ] Invoice PDF shows accurate coupon amounts
- [ ] Refund breakdown shows correct coupon deductions

### Backend Validation
- [ ] Database fields populated correctly
- [ ] Coupon calculations match expected formulas
- [ ] Refund amounts calculated accurately
- [ ] Order totals consistent across all displays

### Edge Cases
- [ ] Zero coupon orders handled correctly
- [ ] Full order cancellation clears coupon properly
- [ ] Invalid coupon codes rejected appropriately
- [ ] Maximum discount limits enforced

## Common Issues and Solutions

### Issue: Coupon deduction exceeds item price
**Solution:** Safety cap implemented - `Math.min(itemPrice, calculatedCouponDeduction)`

### Issue: Inconsistent totals after cancellations
**Solution:** `updateOrderCouponCalculations()` called after every item status change

### Issue: Legacy orders missing coupon data
**Solution:** Migration script reconstructs missing coupon information

## Performance Considerations

- Coupon calculations are cached in database fields
- Migration script processes orders in batches
- Frontend uses stored values instead of recalculating

## Monitoring and Logging

Key log messages to monitor:
- `[COUPON_CALC] Calculating total coupon for order`
- `[COUPON_CALC] Individual coupon calculated`
- `[COUPON_CALC] Coupon deduction applied`
- `[MIGRATION] Order migrated successfully`

## Rollback Procedure

If issues arise, use rollback command:
```bash
node migrations/migrateCouponCalculations.js rollback
```

This removes new coupon fields and reverts to original structure.
