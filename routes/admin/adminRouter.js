const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const adminController = require('../../controllers/admin/adminController');
const productController = require('../../controllers/admin/productController');
const categoryController = require('../../controllers/admin/categoryController');
const orderController = require('../../controllers/admin/orderController');  
const isAdminAuthenticated = require('../../middlewares/adminAuthMiddileware');
const upload = require('../../config/multerConfig')


const preventCaching = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

router.get('/login',preventCaching, adminController.loginPage);
router.post('/login',preventCaching, adminController.loginAdmin);
router.get('/logout',  preventCaching,adminController.logoutAdmin);
router.get('/dashboard', preventCaching,isAdminAuthenticated, adminController.loadDashboard);
router.get('/customer-list', preventCaching, adminController.customerList);
router.post('/customers/status/:id', preventCaching,adminController.updateUserStatus);


router.get('/products', preventCaching, productController.viewProducts);
router.get('/products/add', preventCaching, productController.loadAddProductPage);
router.post('/products/add',isAdminAuthenticated,upload.fields([{ name: 'imageInput0', maxCount: 1 }, { name: 'imageInput1', maxCount: 1 }, { name: 'imageInput2', maxCount: 1 }, { name: 'imageInput3', maxCount: 1 },]), productController.addProduct);
router.get('/products/edit/:id', preventCaching, productController.editProduct);
router.post('/products/edit/:id', preventCaching,isAdminAuthenticated,upload.fields([{ name: 'imageInput0', maxCount: 1 }, { name: 'imageInput1', maxCount: 1 }, { name: 'imageInput2', maxCount: 1 }, { name: 'imageInput3', maxCount: 1 },]), productController.updateProduct);
router.delete('/products/:productId/images/:imageIndex',preventCaching, productController.deleteProductImage);
router.post('/products/status/:id',preventCaching, productController.toggleProductStatus);

router.get('/categories', preventCaching, categoryController.viewCategories);
router.get('/categories/add', preventCaching, categoryController.addCategoryForm);
router.post('/categories/add',preventCaching, categoryController.addCategory);
router.get('/categories/edit/:id', preventCaching, categoryController.editCategory);
router.post('/categories/edit/:id',preventCaching, categoryController.updateCategory);
router.post('/categories/status/:id', preventCaching,categoryController.toggleCategoryStatus);

router.get('/orders',preventCaching, orderController.getOrders);
router.post('/orders/status/:id',preventCaching, orderController.toggleStatus);

module.exports = router;
