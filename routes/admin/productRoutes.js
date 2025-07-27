const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/productController');
const { adminAuth } = require('../../middlewares/authMiddleware');
const upload = require('../../config/multerMemory');

router.use(adminAuth);

router.get('/', productController.viewProducts);
router.get('/add', productController.loadAddProductPage);
router.post('/add', upload.array('images', 5), productController.addProduct);
router.get('/edit/:id', productController.loadEditProductPage);
router.post('/edit/:id', upload.array('images', 5), productController.updateProduct);
router.get('/:id', productController.getProductDetails);
router.delete('/:productId/images/:imageIndex', productController.deleteProductImage);
router.post('/toggle-block/:id', productController.toggleProductBlock);

module.exports = router;
