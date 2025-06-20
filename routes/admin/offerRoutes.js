const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/authMiddleware');
const offerController = require('../../controllers/admin/offerController');

// Apply adminAuth middleware to all routes
router.use(adminAuth);

// List routes
router.get('/', offerController.viewOffers);
router.get('/active-products', offerController.getActiveProducts);
router.get('/active-categories', offerController.getActiveCategories);

// Create route
router.post('/', offerController.createOffer);

// Item routes
router.get('/:id', offerController.getOffer);
router.put('/:id', offerController.updateOffer);
router.patch('/:id/toggle', offerController.toggleOfferStatus);

module.exports = router;