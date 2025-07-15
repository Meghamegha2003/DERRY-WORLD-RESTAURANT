const {
    viewOffers,
    getActiveProducts,
    getActiveCategories,
    createOffer,
    getOffer,
    updateOffer,
    toggleOfferStatus
} = require('../controllers/admin/offerController');

const viewOffersMiddleware = (req, res, next) => {
    try {
        viewOffers(req, res);
    } catch (error) {
        next(error);
    }
};

const getActiveProductsMiddleware = (req, res, next) => {
    try {
        getActiveProducts(req, res);
    } catch (error) {
        next(error);
    }
};

const getActiveCategoriesMiddleware = (req, res, next) => {
    try {
        getActiveCategories(req, res);
    } catch (error) {
        next(error);
    }
};

const createOfferMiddleware = (req, res, next) => {
    try {
        createOffer(req, res);
    } catch (error) {
        next(error);
    }
};

const getOfferMiddleware = (req, res, next) => {
    try {
        getOffer(req, res);
    } catch (error) {
        next(error);
    }
};

const updateOfferMiddleware = (req, res, next) => {
    try {
        updateOffer(req, res);
    } catch (error) {
        next(error);
    }
};

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
