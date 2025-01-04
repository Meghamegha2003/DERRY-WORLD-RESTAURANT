const path = require('path');
const multer = require('multer');
const sharp = require('sharp');



const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'public/uploads/reImage');
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));  }
  });
  
  const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
      const fileTypes = /jpeg|jpg|png/;
      const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
      const mimeType = fileTypes.test(file.mimetype);
      if (mimeType && extname) {
        cb(null, true);
      } else {
        cb(new Error('Images only!'));
      }
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
