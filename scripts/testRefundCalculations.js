const { calculateItemCouponRefund } = require('../helpers/couponHelper');

// Test refund calculations
async function testRefundCalculations() {
  console.log('=== Testing Refund Calculations ===\n');

  // Mock order with coupon discount
  const mockOrder = {
    _id: '507f1f77bcf86cd799439011',
    couponDiscount: 100, // ₹100 coupon discount
    items: [
      {
        _id: '507f1f77bcf86cd799439012',
        price: 500,
        quantity: 2,
        status: 'Active'
      },
      {
        _id: '507f1f77bcf86cd799439013', 
        price: 300,
        quantity: 1,
        status: 'Active'
      },
      {
        _id: '507f1f77bcf86cd799439014',
        price: 200,
        quantity: 1,
        status: 'Active'
      }
    ]
  };

  // Total order value: (500×2) + (300×1) + (200×1) = ₹1300
  // Coupon discount: ₹100
  // Net order value: ₹1200

  console.log('Order Summary:');
  console.log('- Item 1: ₹500 × 2 = ₹1000');
  console.log('- Item 2: ₹300 × 1 = ₹300');
  console.log('- Item 3: ₹200 × 1 = ₹200');
  console.log('- Subtotal: ₹1300');
  console.log('- Coupon Discount: ₹100');
  console.log('- Net Total: ₹1200\n');

  // Test individual item refunds
  for (let i = 0; i < mockOrder.items.length; i++) {
    const item = mockOrder.items[i];
    const itemTotal = item.price * item.quantity;
    
    console.log(`--- Testing Item ${i + 1} Refund ---`);
    console.log(`Item Value: ₹${itemTotal}`);
    
    try {
      const refundResult = await calculateItemCouponRefund(mockOrder, item);
      
      console.log(`Item Share: ${((itemTotal / 1300) * 100).toFixed(1)}%`);
      console.log(`Coupon Deduction: ₹${refundResult.itemCouponDiscount.toFixed(2)}`);
      console.log(`Net Refund: ₹${(itemTotal - refundResult.itemCouponDiscount).toFixed(2)}`);
      console.log(`Remaining Coupon Discount: ₹${refundResult.remainingCouponDiscount.toFixed(2)}\n`);
      
    } catch (error) {
      console.error(`Error calculating refund for item ${i + 1}:`, error.message);
    }
  }

  // Test whole order refund
  console.log('--- Whole Order Refund ---');
  const totalSubtotal = mockOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const wholeOrderRefund = totalSubtotal - mockOrder.couponDiscount;
  console.log(`Total Refund: ₹${wholeOrderRefund.toFixed(2)}`);
  console.log(`(Subtotal ₹${totalSubtotal} - Coupon ₹${mockOrder.couponDiscount})`);
}

// Test different payment method scenarios
function testPaymentMethodScenarios() {
  console.log('\n=== Payment Method Scenarios ===\n');
  
  const scenarios = [
    {
      name: 'COD Order',
      paymentMethod: 'cod',
      refundAction: 'No refund processing needed'
    },
    {
      name: 'Wallet Payment',
      paymentMethod: 'wallet',
      refundAction: 'Credit back to wallet'
    },
    {
      name: 'Online Payment (Razorpay)',
      paymentMethod: 'online',
      refundAction: 'Razorpay API refund → Wallet fallback'
    }
  ];

  scenarios.forEach(scenario => {
    console.log(`${scenario.name}:`);
    console.log(`  Payment Method: ${scenario.paymentMethod}`);
    console.log(`  Refund Action: ${scenario.refundAction}\n`);
  });
}

// Run tests
if (require.main === module) {
  testRefundCalculations()
    .then(() => {
      testPaymentMethodScenarios();
      console.log('=== Test Complete ===');
    })
    .catch(error => {
      console.error('Test failed:', error);
    });
}

module.exports = { testRefundCalculations, testPaymentMethodScenarios };
