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
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Ensure OTP documents are automatically deleted after expiry
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Add compound index for email and otp for faster lookups
otpSchema.index({ email: 1, otp: 1 });

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;