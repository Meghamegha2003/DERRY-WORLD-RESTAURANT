const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/productController');
const { adminAuth } = require('../../middlewares/authMiddleware');
const { parseMultipartData } = require('../../middlewares/fileParser');
const { handleProductUpload } = require('../../middlewares/cloudinaryUpload');

router.use(adminAuth);

router.get('/', productController.viewProducts);
router.get('/add', productController.loadAddProductPage);
router.post('/add', parseMultipartData, handleProductUpload, productController.addProduct);
router.get('/edit/:id', productController.loadEditProductPage);
router.post('/edit/:id', parseMultipartData, handleProductUpload, productController.updateProduct);
router.get('/check-name', productController.checkProductName);
router.get('/:id', productController.getProductDetails);
router.delete('/:productId/images/:imageIndex', productController.deleteProductImage);
router.post('/toggle-block/:id', productController.toggleProductBlock);

module.exports = router;
