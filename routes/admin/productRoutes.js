const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/productController');
const { adminAuth } = require('../../middlewares/authMiddleware');
const upload = require('../../config/multerMemory');

// Debug middleware
// router.use((req, res, next) => {
//     console.log('[DEBUG] Product route:', {
//         path: req.path,
//         method: req.method,
//         originalUrl: req.originalUrl,
//         isXHR: req.xhr || req.headers.accept?.includes('application/json')
//     });
//     next();
// });

// View all products
router.get('/', adminAuth, (req, res, next) => {
    res.locals.path = '/admin/products';
    next();
}, productController.viewProducts);

// API endpoint for products (JSON)
router.get('/api/products', adminAuth, productController.getProductsJson);

// Add product
router.get('/add', adminAuth, productController.loadAddProductPage);
router.post('/add', adminAuth, upload.array('images', 5), productController.addProduct);

// Edit product
router.get('/edit/:id', adminAuth, productController.loadEditProductPage);
router.post('/edit/:id', adminAuth, upload.array('images', 5), productController.updateProduct);

// Get product details
router.get('/:id', adminAuth, productController.getProductDetails);

// Product image management
router.delete('/:productId/images/:imageIndex', adminAuth, productController.deleteProductImage);

// Toggle product status
router.post('/toggle-block/:id', adminAuth, productController.toggleProductBlock);

// Search products
router.get('/search', adminAuth, (req, res, next) => {
    res.locals.path = '/admin/products/search';
    next();
}, productController.searchProducts);

module.exports = router;