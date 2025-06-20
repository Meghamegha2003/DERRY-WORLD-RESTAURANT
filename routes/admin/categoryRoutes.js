const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');
const { adminAuth } = require('../../middlewares/authMiddleware');

// Only apply admin auth to modification routes
router.post('/add', adminAuth, categoryController.addCategory);

// Add category
router.post('/edit/:categoryId', adminAuth, categoryController.editCategory);

// Edit category
router.post('/status/:categoryId', adminAuth, categoryController.toggleStatus);

// Toggle category status
// Allow viewing categories without auth
router.get('/', categoryController.listCategories);

// List categories

module.exports = router;