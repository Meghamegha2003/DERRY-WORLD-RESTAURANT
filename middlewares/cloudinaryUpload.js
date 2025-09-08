const { uploadToCloudinary } = require('../config/cloudinary');

// Unified Cloudinary upload middleware with configurable options
const createCloudinaryUploader = (options = {}) => {
  const {
    folder = 'derry-uploads',
    prefix = 'upload',
    includePublicId = false,
    transformations = null,
    maxSize = 5 * 1024 * 1024 // 5MB default
  } = options;

  return async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        req.cloudinaryUploads = [];
        return next();
      }

      // Validate files
      for (const file of req.files) {
        if (!file.mimetype.startsWith('image/')) {
          return res.status(400).json({
            success: false,
            message: 'Only image files are allowed!'
          });
        }

        if (file.size > maxSize) {
          return res.status(400).json({
            success: false,
            message: `File "${file.originalname}" is too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`
          });
        }
      }

      // Upload files
      const uploadPromises = req.files.map(async (file) => {
        try {
          const timestamp = Date.now();
          const randomId = Math.floor(Math.random() * 1000000);
          const cleanPublicId = `${prefix}_${timestamp}_${randomId}`;
          
          const uploadOptions = {
            public_id: cleanPublicId,
            folder: folder
          };

          // Add transformations if specified
          if (transformations) {
            uploadOptions.transformation = transformations;
          }
          
          const result = await uploadToCloudinary(file.buffer, uploadOptions);
          
          // Return different formats based on configuration
          if (includePublicId) {
            return {
              secure_url: result.secure_url,
              public_id: result.public_id
            };
          } else {
            return result.secure_url;
          }
        } catch (error) {
          throw new Error(`Failed to upload ${file.originalname}`);
        }
      });

      const uploadResults = await Promise.all(uploadPromises);
      
      // Format output based on configuration
      if (includePublicId) {
        req.cloudinaryUploads = uploadResults.map(result => {
          // Ensure we only return the URL, not the full Cloudinary response
          if (typeof result === 'object' && result.secure_url) {
            return result.secure_url;
          }
          return result;
        });
      } else {
        req.cloudinaryUploads = uploadResults;
      }
      
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Error uploading images'
      });
    }
  };
};

// Pre-configured middlewares for different use cases
const handleReviewUpload = createCloudinaryUploader({
  folder: 'derry-reviews',
  prefix: 'review',
  includePublicId: true
});

const handleProductUpload = createCloudinaryUploader({
  folder: 'derry-products',
  prefix: 'product',
  includePublicId: false,
  transformations: [
    { width: 800, height: 800, crop: 'pad', background: 'white' },
    { quality: 'auto:good' }
  ]
});

// Legacy export for backward compatibility
const handleCloudinaryUpload = handleReviewUpload;

module.exports = { 
  createCloudinaryUploader,
  handleCloudinaryUpload,
  handleReviewUpload,
  handleProductUpload
};
