const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = 'public/uploads/reImage';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Ensure directory exists before saving
      const dir = 'public/uploads/reImage';
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
  
  const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
      const fileTypes = /jpeg|jpg|png/;
      const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
      const mimeType = fileTypes.test(file.mimetype);
      if (mimeType && extname) {
        return cb(null, true);
      } 
      return cb(new Error('Only JPEG, JPG, and PNG images are allowed!'), false);
    },
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });

  
  
  const cropImages = async (req, res, next) => {
    try {
      const uploadedImages = req.files;
      if (uploadedImages && uploadedImages.length > 0) {
        const croppedImages = await Promise.all(
          uploadedImages.map(async (image) => {
            const croppedImagePath = 'public/uploads/cropped_' + image.filename;
            await sharp(image.path)
              .resize({ width: 600, height: 600 })
              .toFile(productDetailsImagePath);
            return {
              ...image,
              path: croppedImagePath,
              filename: 'cropped_' + image.filename,
            };
          })
        );
        req.files = croppedImages;
        next();
      } else {
        res.status(400).send('No images uploaded');
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('Error processing the images');
    }
  };
  


module.exports = upload;
