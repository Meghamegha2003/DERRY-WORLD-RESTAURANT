
const HttpStatus = Object.freeze({
  // HTTP Status Codes
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500
});

// Payment Status Constants
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
  PROCESSING: 'processing',
  COMPLETED: 'completed'
});

module.exports = {
  ...HttpStatus,
  PAYMENT_STATUS
};
