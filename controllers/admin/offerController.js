const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');


exports.viewOffers = async (req, res) => {
    try {
        const offers = await Offer.find()
            .populate('targetProducts', 'name price')
            .populate('targetCategories', 'name')
            .sort({ createdAt: -1 });

        const products = await Product.find().select('name');
        const categories = await Category.find().select('name');

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                offers
            });
        }

        res.render('admin/offers', {
            title: 'Offer Management',
            offers,
            products,
            categories,
            error: null,
            path : '/admin/offers'
        });
    } catch (error) {
        
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch offers',
                error: error.message
            });
        }

        res.status(500).render('admin/error', {
            message: 'Failed to fetch offers',
            error
        });
    }
};

exports.getActiveProducts = async (req, res) => {
    try {
        const products = await Product.find({ isListed: true, isBlocked: false })
            .select('name price category')
            .populate('category', 'name')
            .sort({ name: 1 });

        res.json({
            success: true,
            products
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active products'
        });
    }
};

exports.getActiveCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true, isBlocked: false })
            .select('name')
            .sort({ name: 1 });

        res.json({
            success: true,
            categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active categories'
        });
    }
};

exports.getOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id)
            .populate('targetProducts', 'name price')
            .populate('targetCategories', 'name');

        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

        res.json({
            success: true,
            offer
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch offer'
        });
    }
};

exports.createOffer = async (req, res) => {
    try {
        const {
            name,
            discountType,
            discountValue,
            minPurchase = 0,
            maxDiscount,
            startDate,
            endDate,
            targetType,
            targetId
        } = req.body;

        
        if (!name || !discountType || !discountValue || !startDate || !endDate || !targetType || !targetId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 90)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid discount percentage. Must be between 1 and 90.'
            });
        } else if (discountType === 'amount' && discountValue <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid discount amount. Must be greater than 0.'
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const now = new Date();

        if (start >= end) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        if (end < now) {
            return res.status(400).json({
                success: false,
                message: 'End date must be in the future'
            });
        }

        const existingOffer = await Offer.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingOffer) {
            return res.status(400).json({
                success: false,
                message: `An offer with the name "${name}" already exists`
            });
        }

        const offerData = {
            name,
            discountType,
            discountValue: Number(discountValue),
            minPurchase: Number(minPurchase) || 0,
            validFrom: start,
            validUntil: end,
            isActive: true
        };

        if (discountType === 'percentage' && maxDiscount) {
            offerData.maxDiscount = Number(maxDiscount);
        }

        if (targetType === 'product') {
            const product = await Product.findById(targetId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found'
                });
            }
            offerData.targetProducts = [targetId];
        } else if (targetType === 'category') {
            const category = await Category.findById(targetId);
            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }
            offerData.targetCategories = [targetId];
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid target type'
            });
        }

        const offer = new Offer(offerData);
        await offer.save();

        res.status(201).json({
            success: true,
            message: 'Offer created successfully',
            offer
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create offer',
            error: error.message
        });
    }
};

exports.updateOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        const {
            name,
            discountType,
            discountValue,
            minPurchase = 0,
            maxDiscount,
            startDate,
            endDate,
            targetType,
            targetId
        } = req.body;

        const offer = await Offer.findById(offerId);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

        if (!name || !discountType || !discountValue || !startDate || !endDate || !targetType || !targetId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 90)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid discount percentage. Must be between 1 and 90.'
            });
        } else if (discountType === 'amount' && discountValue <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid discount amount. Must be greater than 0.'
            });
        }

        const existingOffer = await Offer.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') },
            _id: { $ne: offerId }
        });
        if (existingOffer) {
            return res.status(400).json({
                success: false,
                message: `An offer with the name "${name}" already exists`
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const now = new Date();

        if (start >= end) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        offer.name = name;
        offer.discountType = discountType;
        offer.discountValue = Number(discountValue);
        offer.minPurchase = Number(minPurchase) || 0;
        offer.validFrom = start;
        offer.validUntil = end;

        if (discountType === 'percentage' && maxDiscount) {
            offer.maxDiscount = Number(maxDiscount);
        } else {
            offer.maxDiscount = undefined;
        }

        if (targetType === 'product') {
            const product = await Product.findById(targetId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found'
                });
            }
            offer.targetProducts = [targetId];
            offer.targetCategories = [];
        } else if (targetType === 'category') {
            const category = await Category.findById(targetId);
            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }
            offer.targetCategories = [targetId];
            offer.targetProducts = [];
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid target type'
            });
        }

        await offer.save();

        res.json({
            success: true,
            message: 'Offer updated successfully',
            offer
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update offer',
            error: error.message
        });
    }
};


exports.toggleOfferStatus = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

       
        if (req.body && req.body.hasOwnProperty('isActive')) {
            offer.isActive = req.body.isActive;
        } else {
            offer.isActive = !offer.isActive;
        }
        
        await offer.save();

        res.json({
            success: true,
            message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`,
            offer
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to toggle offer status'
        });
    }
};