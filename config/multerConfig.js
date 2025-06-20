const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Ensure upload directories exist
const productsDir = path.join('public', 'uploads', 'products');
if (!fs.existsSync(productsDir)) {
  fs.mkdirSync(productsDir, { recursive: true });
}

// Configure multer to use disk storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, productsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB limit
  files: 5 // Maximum 5 files at once
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: limits
});

module.exports = upload;