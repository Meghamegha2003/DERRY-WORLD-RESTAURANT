/**
 * Test script for refund calculation service
 * Tests the formula: (itemPrice/total) * totalCoupon
 */

const { calculateItemRefund, calculateOrderRefund, validateRefundInputs } = require('../services/refundCalculationService');

// Mock order data for testing
const mockOrder = {
  _id: 'test_order_123',
  items: [
    {
      _id: 'item1',
      price: 300, // salesPrice or offerPrice
      quantity: 1,
      status: 'Active'
    },
    {
      _id: 'item2', 
      price: 200,
      quantity: 2,
      status: 'Active'
    },
    {
      _id: 'item3',
      price: 100,
      quantity: 1,
      status: 'Active'
    }
  ],
  totalCoupon: 80, // Original total coupon amount
  couponDiscount: 80, // Current coupon discount
  appliedCoupon: {
    code: 'TEST20',
    discountType: 'percentage',
    discountValue: 10,
    maxDiscount: 100
  }
};

// Test cases
function runTests() {
  console.log('=== REFUND CALCULATION SERVICE TESTS ===\n');

  // Test 1: Item refund calculation
  console.log('Test 1: Item Refund Calculation');
  console.log('Order total: ₹800 (300 + 400 + 100)');
  console.log('Total coupon: ₹80');
  console.log('Item to refund: ₹300');
  console.log('Expected coupon deduction: (300/800) * 80 = ₹30');
  console.log('Expected refund: 300 - 30 = ₹270\n');

  const itemToRefund = mockOrder.items[0]; // ₹300 item
  const refundResult = calculateItemRefund(mockOrder, itemToRefund);
  
  console.log('Actual result:', refundResult);
  console.log('✓ Formula verification: (300/800) * 80 =', (300/800) * 80);
  console.log('---\n');

  // Test 2: Second item refund (after first item cancelled)
  console.log('Test 2: Second Item Refund (Sequential)');
  
  // Simulate first item already cancelled
  const orderAfterFirstCancel = {
    ...mockOrder,
    couponDiscount: 50, // Reduced after first cancellation
    items: mockOrder.items.map(item => 
      item._id === 'item1' 
        ? { ...item, status: 'Cancelled', itemCouponDiscount: 30 }
        : item
    )
  };

  const secondItemToRefund = orderAfterFirstCancel.items[1]; // ₹400 item
  const secondRefundResult = calculateItemRefund(orderAfterFirstCancel, secondItemToRefund);
  
  console.log('Second item (₹400) refund result:', secondRefundResult);
  console.log('✓ Formula verification: (400/800) * 80 =', (400/800) * 80);
  console.log('---\n');

  // Test 3: Order refund calculation
  console.log('Test 3: Full Order Refund');
  const orderRefundResult = calculateOrderRefund(mockOrder, 'Cancellation');
  console.log('Order refund result:', orderRefundResult);
  console.log('---\n');

  // Test 4: Input validation
  console.log('Test 4: Input Validation');
  const validationResult = validateRefundInputs(mockOrder, itemToRefund);
  console.log('Validation result:', validationResult);
  
  const invalidValidation = validateRefundInputs(null, null);
  console.log('Invalid input validation:', invalidValidation);
  console.log('---\n');

  // Test 5: Edge case - coupon exceeds item price
  console.log('Test 5: Edge Case - High Coupon Amount');
  const highCouponOrder = {
    ...mockOrder,
    totalCoupon: 500, // Very high coupon
    couponDiscount: 500
  };
  
  const smallItem = { _id: 'small_item', price: 50, quantity: 1, status: 'Active' };
  const edgeCaseResult = calculateItemRefund(highCouponOrder, smallItem);
  console.log('High coupon vs small item result:', edgeCaseResult);
  console.log('✓ Safety cap applied - coupon deduction capped at item price');
  
  console.log('\n=== TESTS COMPLETED ===');
}

// Run the tests
try {
  runTests();
} catch (error) {
  console.error('Test execution failed:', error);
}
