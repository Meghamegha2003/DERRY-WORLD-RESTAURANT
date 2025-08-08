const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define common status enum values
const ORDER_STATUS = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  RETURN_REQUESTED: 'Return Requested',
  RETURN_APPROVED: 'Return Approved',
  RETURN_REJECTED: 'Return Rejected',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled'
};

const PAYMENT_STATUS = {
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded'
};

// Function to generate a unique item ID
const generateItemId = () => {
  const prefix = 'ITM';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${timestamp}${random}`;
};

// Export the function for use in controllers
exports.generateItemId = generateItemId;

// Map order status to item status
const ORDER_TO_ITEM_STATUS = {
    'Pending': 'Pending',
    'Processing': 'Pending',
    'Shipped': 'Shipped',
    'Delivered': 'Delivered',
    'Return Requested': 'Return Requested',
    'Return Approved': 'Return Approved',
    'Return Rejected': 'Return Rejected',
    'Cancelled': 'Cancelled'
};

const orderItemSchema = new Schema({
  itemId: {
    type: String,
    required: true,
    default: generateItemId
  },
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity cannot be less than 1']
  },
  price: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative']
  },
  regularPrice: {
    type: Number,
    required: true,
    min: [0, 'Regular price cannot be negative']
  },
  offerPrice: {
    type: Number,
    min: [0, 'Offer price cannot be negative']
  },
  total: {
    type: Number,
    required: true,
    min: [0, 'Total cannot be negative']
  },
  status: {
  type: String,
  enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Return Approved', 'Return Rejected', 'Returned'],
  default: 'Pending'
},
  rating: {
    type: Number,
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot be more than 5']
  },
  ratedAt: {
    type: Date
  },
  // Return related fields
  returnReason: String,
  returnRequestDate: Date,
  returnStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
  },
  returnProcessedDate: Date,
  // Cancellation related fields
  cancelReason: String,
  cancelledAt: Date,
  refundAmount: {
    type: Number,
    min: 0
  },
  refundStatus: {
    type: String,
    enum: ['Pending', 'Completed'],
  },
  refundDate: Date
});

const addressSchema = new Schema({
  addressType: {
    type: String,
    required: true,
    default: 'Home'
  },
  fullName: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  addressLine1: {
    type: String,
    required: true
  },
  addressLine2: String,
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  pincode: {
    type: String,
    required: true
  }
});

// Pre-save middleware to generate order number
const generateOrderNumber = () => {
  const prefix = 'ORD';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${timestamp}${random}`;
};

const OrderSchema = new Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true,
    default: generateOrderNumber
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [orderItemSchema],
  // Cancellation reason for the whole order
  cancelReason: { type: String },
  shippingAddress: addressSchema,
  couponDiscount: {
    type: Number,
    default: 0
  },
  appliedCoupon: {
    code: String,
    discountType: String,
    discountValue: Number,
    minPurchase: Number,
    maxDiscount: Number,
    couponId: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon'
    }
  },
  total: {
    type: Number,
    required: true,
    min: [0, 'Total cannot be negative']
  },
  totalAmount: {
    type: Number,
    required: true,
    min: [0, 'Total amount cannot be negative'],
    default: function() {
      return this.total || 0;
    }
  },
  orderStatus: {
    type: String,
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.PENDING
  },
  status: {
    type: String,
    enum: ['Active', 'Cancelled', 'Returned', 'Return Requested', 'Return Approved', 'Return Rejected'],
    default: 'Active'
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  deliveryDate: Date,
  returnReason: { type: String }, // Reason for return at order level

  paymentMethod: {
    type: String,
    enum: ['cod', 'online', 'wallet'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
    default: 'Pending'
  },
  razorpay: {
  orderId: String,
  paymentId: String,
  signature: String,
  status: {
    type: String,
    enum: ['created', 'attempted', 'failed', 'captured', 'refunded'],
    default: 'created'
  },
  failureReason: String,
  attemptCount: {
    type: Number,
    default: 0
  },
  lastAttemptedAt: Date
},

}, {
  timestamps: true
});

// Create the model
const Order = mongoose.model('Order', OrderSchema);

// Export both the model and the status enums
module.exports = {
  Order,
  ORDER_STATUS, 
  PAYMENT_STATUS,
  ORDER_TO_ITEM_STATUS
};