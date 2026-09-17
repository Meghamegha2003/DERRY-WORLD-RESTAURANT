const mongoose = require('mongoose');

const { Schema } = mongoose;

const otpSchema = new Schema({
  email: {
    type: String,
    required: true,
    index: true
  },

  otp: {
    type: String,
    required: true
  },

  expiresAt: {
    type: Date,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Temporary registration data
  name: {
    type: String
  },

  phone: {
    type: String
  },

  password: {
    type: String
  },

  referralCode: {
    type: String
  },

  referredBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

otpSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

otpSchema.index({ email: 1, otp: 1 });

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;