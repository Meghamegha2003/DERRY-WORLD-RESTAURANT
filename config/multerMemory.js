const multer = require('multer');

// Use memory storage so file.buffer is available in controller
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
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
