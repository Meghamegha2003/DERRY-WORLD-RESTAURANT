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
  CANCELLED: 'Cancelled'
};

const PAYMENT_STATUS = {
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded'
};

const orderItemSchema = new Schema({
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
    enum: ['Active', 'Cancelled', 'Returned', 'Return Requested', 'Return Approved', 'Return Rejected'],
    default: 'Active'
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
    enum: ['Pending', 'Completed', 'Failed'],
    default: 'Pending'
  },
  refundDate: Date,
  // Coupon calculation fields for refunds
  couponRatio: {
    type: Number,
    default: 0
  },
  itemCouponDiscount: {
    type: Number,
    default: 0
  }
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

const OrderSchema = new Schema({
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
  totalCoupon: {
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
  deliveredDate: Date,
  processingDate: Date,
  shippedDate: Date,
  returnReason: { type: String }, // Reason for return at order level
  returnRequestedDate: Date,
  returnApprovedDate: Date,
  returnRejectedDate: Date,
  returnedDate: Date,
  cancelledDate: Date,
  cancellationReason: String,

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
  // Order-level refund tracking
  orderLevelRefund: {
    type: Number,
    default: 0
  },
  walletRefund: {
    type: Number,
    default: 0
  },
  // Refund transaction tracking
  refundTransactions: [{
    type: {
      type: String,
      enum: ['Wallet', 'Razorpay'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    date: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      enum: ['Cancellation', 'Return'],
      required: true
    },
    itemReference: {
      type: mongoose.Schema.Types.ObjectId,
      required: false
    },
    razorpayRefundId: String,
    walletTransactionId: String,
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed'],
      default: 'Pending'
    }
  }],

}, {
  timestamps: true
});

// Create the model
const Order = mongoose.model('Order', OrderSchema);

// Export both the model and the status enums
module.exports = {
  Order,
  ORDER_STATUS,
  PAYMENT_STATUS
};