const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/authMiddleware');
const offerController = require('../../controllers/admin/offerController');

router.use(adminAuth);

router.get('/', offerController.viewOffers);
router.get('/active-products', offerController.getActiveProducts);
router.get('/active-categories', offerController.getActiveCategories);
router.post('/', offerController.createOffer);
router.get('/:id', offerController.getOffer);
router.put('/:id', offerController.updateOffer);
router.patch('/:id/toggle', offerController.toggleOfferStatus);

module.exports = router;