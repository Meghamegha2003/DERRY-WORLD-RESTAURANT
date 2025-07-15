const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/productController');
const { adminAuth } = require('../../middlewares/authMiddleware');
const upload = require('../../config/multerMemory');


router.get('/', adminAuth, (req, res, next) => {
    res.locals.path = '/admin/products';
    next();
}, productController.viewProducts);
router.get('/api/products', adminAuth, productController.getProductsJson);
router.get('/add', adminAuth, productController.loadAddProductPage);
router.post('/add', adminAuth, upload.array('images', 5), productController.addProduct);
router.get('/edit/:id', adminAuth, productController.loadEditProductPage);
router.post('/edit/:id', adminAuth, upload.array('images', 5), productController.updateProduct);
router.get('/:id', adminAuth, productController.getProductDetails);
router.delete('/:productId/images/:imageIndex', adminAuth, productController.deleteProductImage);
router.post('/toggle-block/:id', adminAuth, productController.toggleProductBlock);
router.get('/search', adminAuth, (req, res, next) => {
    res.locals.path = '/admin/products/search';
    next();
}, productController.searchProducts);

module.exports = router;