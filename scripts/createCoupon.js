require("dotenv").config();
const mongoose = require("mongoose");
const Coupon = require("../models/couponSchema");

async function updateCoupon() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const couponData = {
      code: "FREE",
      description: "Get 10% off on orders above ₹1000 (Max discount: ₹500)",
      discountType: "percentage",
      discountAmount: 10, // 10% discount
      minimumPurchase: 1000,
      maxDiscount: 500,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Valid for 30 days
      usageLimit: 100,
      usedCount: 0,
      isActive: true,
    };

    const updatedCoupon = await Coupon.findOneAndUpdate(
      { code: "FREE" },
      couponData,
      { upsert: true, new: true }
    );
  } catch (error) {
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

updateCoupon();
