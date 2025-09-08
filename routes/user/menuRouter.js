const express = require('express');
const router = express.Router();
const menuController = require('../../controllers/user/menuController');
const { auth } = require('../../middlewares/authMiddleware');

// Menu routes
router.get('/menu', auth, menuController.renderMenuPage);
router.post('/menu', auth, menuController.renderMenuPage); // Support POST for filtering
router.get('/products', auth, menuController.renderMenuPage);
router.get('/menu/category/:categoryId', auth, menuController.renderCategoryMenu);
router.get('/menu/search', auth, menuController.searchProducts);
router.get('/menu/filter', auth, menuController.filterProducts);
router.post('/menu/filter', auth, menuController.filterMenuPage); // POST method for filtering

module.exports = router;
