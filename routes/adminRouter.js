const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const productController = require('../controllers/admin/productController');
const categoryController = require('../controllers/admin/categoryController');
const isAdminAuthenticated = require('../middlewares/adminAuthMiddileware');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

// Configure multer for file uploads
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
    const uploadedImages = req.files; // The multiple images uploaded by the user

    if (uploadedImages && uploadedImages.length > 0) {
      // Iterate and crop each image
      const croppedImages = await Promise.all(
        uploadedImages.map(async (image) => {
          const croppedImagePath = 'public/uploads/cropped_' + image.filename;

// Resizing for product details
await sharp(image.path)
  .resize({ width: 600, height: 600 }) // Fit for product details page
  .toFile(productDetailsImagePath);
          // Update the path in the `image` object
          return {
            ...image,
            path: croppedImagePath,
            filename: 'cropped_' + image.filename,
          };
        })
      );

      // Replace `req.files` with the cropped images
      req.files = croppedImages;

      // Pass control to the next middleware
      next();
    } else {
      res.status(400).send('No images uploaded');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error processing the images');
  }
};




// Prevent caching middleware

const preventCaching = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// Public admin routes
router.get('/login', adminController.loginPage);
router.post('/login',preventCaching, adminController.loginAdmin);
router.get('/logout',  adminController.logoutAdmin);

// Protected admin routes

router.get('/dashboard', preventCaching,isAdminAuthenticated, adminController.loadDashboard);

// Customer management
router.get('/customer-list', preventCaching, adminController.customerList);
router.post('/customers/status/:id', preventCaching,adminController.updateUserStatus);

// Product management
router.get('/products', preventCaching, productController.viewProducts);
router.get('/products/add', preventCaching, productController.loadAddProductPage);
router.post(
  '/products/add',
  isAdminAuthenticated,
  upload.fields([
    { name: 'imageInput0', maxCount: 1 }, 
    { name: 'imageInput1', maxCount: 1 }, 
    { name: 'imageInput2', maxCount: 1 }, 
    { name: 'imageInput3', maxCount: 1 },
  ]),
  productController.addProduct
);

router.get('/products/edit/:id', preventCaching, productController.editProductForm);
router.post('/products/edit/:id', isAdminAuthenticated,upload.fields([
  { name: 'imageInput0', maxCount: 1 }, 
  { name: 'imageInput1', maxCount: 1 }, 
  { name: 'imageInput2', maxCount: 1 }, 
  { name: 'imageInput3', maxCount: 1 },
]), productController.updateProduct);  // Handle multiple file uploads
router.delete('/products/:productId/images/:imageIndex', productController.deleteProductImage);
router.post('/products/status/:id', productController.toggleProductStatus);

// Category management
router.get('/categories', preventCaching, categoryController.viewCategories);
router.get('/categories/add', preventCaching, categoryController.addCategoryForm);
router.post('/categories/add', categoryController.addCategory);
router.get('/categories/edit/:id', preventCaching, categoryController.editCategory);
router.post('/categories/edit/:id', categoryController.updateCategory);
router.post('/categories/status/:id', categoryController.toggleCategoryStatus);

module.exports = router;
