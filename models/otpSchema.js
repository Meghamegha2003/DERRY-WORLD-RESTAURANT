// otpSchema.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const otpSchema = new Schema({
  email: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// Ensure that OTP expires after a certain period and cannot be reused
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OTP = mongoose.model('OTP', otpSchema);
module.exports = OTP;
