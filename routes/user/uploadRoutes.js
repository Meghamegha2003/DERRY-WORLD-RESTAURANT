const express = require('express');
const router = express.Router();
const cloudinary = require('../../config/cloudinary');
const { auth } = require('../../middlewares/authMiddleware');

// Generate Cloudinary signature for secure uploads
router.post('/cloudinary-signature', auth, async (req, res) => {
  try {
    const timestamp = Math.round((new Date()).getTime() / 1000);
    const params = {
      timestamp: timestamp,
      folder: 'review_images',
      transformation: 'w_800,h_600,c_limit,q_auto,f_auto'
    };

    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);

    res.json({
      success: true,
      signature: signature,
      timestamp: timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder: 'review_images'
    });

  } catch (error) {
    console.error('Signature generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate upload signature'
    });
  }
});

module.exports = router;
