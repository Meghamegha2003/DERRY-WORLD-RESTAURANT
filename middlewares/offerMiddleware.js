const {
    viewOffers,
    getActiveProducts,
    getActiveCategories,
    createOffer,
    getOffer,
    updateOffer,
    toggleOfferStatus
} = require('../controllers/admin/offerController');

// View all offers middleware
const viewOffersMiddleware = (req, res, next) => {
    try {
        viewOffers(req, res);
    } catch (error) {
        next(error);
    }
};

// Get active products middleware
const getActiveProductsMiddleware = (req, res, next) => {
    try {
        getActiveProducts(req, res);
    } catch (error) {
        next(error);
    }
};

// Get active categories middleware
const getActiveCategoriesMiddleware = (req, res, next) => {
    try {
        getActiveCategories(req, res);
    } catch (error) {
        next(error);
    }
};

// Create offer middleware
const createOfferMiddleware = (req, res, next) => {
    try {
        createOffer(req, res);
    } catch (error) {
        next(error);
    }
};

// Get single offer middleware
const getOfferMiddleware = (req, res, next) => {
    try {
        getOffer(req, res);
    } catch (error) {
        next(error);
    }
};

// Update offer middleware
const updateOfferMiddleware = (req, res, next) => {
    try {
        updateOffer(req, res);
    } catch (error) {
        next(error);
    }
};

// Toggle offer status middleware
const toggleOfferStatusMiddleware = (req, res, next) => {
    try {
        toggleOfferStatus(req, res);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    viewOffersMiddleware,
    getActiveProductsMiddleware,
    getActiveCategoriesMiddleware,
    createOfferMiddleware,
    getOfferMiddleware,
    updateOfferMiddleware,
    toggleOfferStatusMiddleware
};
