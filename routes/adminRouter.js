const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const productController = require('../controllers/admin/productController');
const categoryController = require('../controllers/admin/categoryController');
const { isAdmin, isActiveUser } = require('../middlewares/roleMiddleware');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/products');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'), false);
    }
  }
});

// Prevent caching middleware
const preventCaching = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// Public admin routes
router.get('/login', preventCaching, adminController.loadLogin);
router.post('/login', adminController.handleLogin);

// Protected admin routes - require both active user and admin role
router.use(isActiveUser, isAdmin); // Apply both middleware to all routes below

router.get('/dashboard', preventCaching, adminController.loadDashboard);

// Customer management
router.get('/customer-list', preventCaching, adminController.customerList);
router.post('/customers/status/:id', adminController.updateUserStatus);

// Product management
router.get('/products', preventCaching, productController.viewProducts);
router.get('/products/add', preventCaching, productController.loadAddProductPage);
router.post('/products/add', upload.array('productImage', 4), productController.addProduct);
router.get('/products/edit/:id', preventCaching, productController.editProductForm);
router.post('/products/update/:id', upload.array('productImage', 4), productController.updateProduct);
router.delete('/products/:productId/images/:imageIndex', productController.deleteProductImage);

// Category management
router.get('/categories', preventCaching, categoryController.viewCategories);
router.get('/categories/add', preventCaching, categoryController.addCategoryForm);
router.post('/categories/add', categoryController.addCategory);
router.get('/categories/edit/:id', preventCaching, categoryController.editCategory);
router.post('/categories/edit/:id', categoryController.updateCategory);
router.post('/categories/status/:id', categoryController.toggleCategoryStatus);

module.exports = router;
