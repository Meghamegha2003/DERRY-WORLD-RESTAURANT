const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');
const { adminAuth } = require('../../middlewares/authMiddleware');

router.post('/add', adminAuth, categoryController.addCategory);
router.post('/edit/:categoryId', adminAuth, categoryController.editCategory);
router.post('/status/:categoryId', adminAuth, categoryController.toggleStatus);
router.get('/', categoryController.listCategories);

module.exports = router;