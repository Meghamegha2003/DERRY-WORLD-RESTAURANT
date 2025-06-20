const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

// View all offers
const viewOffers = async (req, res) => {
    try {
        const offers = await Offer.find()
            .populate('targetProducts', 'name price')
            .populate('targetCategories', 'name')
            .sort({ createdAt: -1 });

        // Fetch ALL products and categories for offer creation/editing (no isActive filter)
        const products = await Product.find().select('name');
        const categories = await Category.find().select('name');

        // Check if it's an AJAX request
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                offers
            });
        }

        // Render the offers page with products and categories
        res.render('admin/offers', {
            title: 'Offer Management',
            offers,
            products,
            categories,
            error: null
        });
    } catch (error) {
        console.error('Error fetching offers:', error);
        
        // Check if it's an AJAX request
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch offers',
                error: error.message
            });
        }

        res.status(500).render('error', {
            message: 'Failed to fetch offers',
            error
        });
    }
};

// Get active products for offer creation/editing
const getActiveProducts = async (req, res) => {
    try {
        const products = await Product.find({ isActive: true })
            .select('name price category')
            .populate('category', 'name')
            .sort({ name: 1 });

        res.json({
            success: true,
            products
        });
    } catch (error) {
        console.error('Error fetching active products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active products'
        });
    }
};

// Get active categories for offer creation/editing
const getActiveCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true })
            .select('name')
            .sort({ name: 1 });

        res.json({
            success: true,
            categories
        });
    } catch (error) {
        console.error('Error fetching active categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active categories'
        });
    }
};

// Create new offer
const createOffer = async (req, res) => {
    try {
        console.log("Received offer data:", req.body); // Debug log
        
        const {
            name,
            description,
            discountType,
            discountValue,
            minPurchase,
            startDate,
            endDate,
            targetType,
            targetProduct,
            targetCategory
        } = req.body;

        // Validate required fields
        if (!name || !discountType || !discountValue || !startDate || !endDate || !targetType) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Validate discount value
        if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid discount percentage'
            });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start >= end) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Prepare products and categories arrays based on targetType
        let products = [];
        let categories = [];
        
        if (targetType === 'product' && targetProduct) {
            products = [targetProduct]; // Single product ID
        } else if (targetType === 'category' && targetCategory) {
            categories = [targetCategory]; // Single category ID
        }

        // Create new offer
        const offer = new Offer({
            name, // Use name directly as required by schema
            description,
            discountType,
            discountValue,
            minPurchase: minPurchase || 0,
            validFrom: start, // Map startDate to validFrom
            validUntil: end,  // Map endDate to validUntil
            targetProducts: products,
            targetCategories: categories
        });

        await offer.save();

        res.status(201).json({
            success: true,
            message: 'Offer created successfully',
            offer
        });
    } catch (error) {
        console.error('Error creating offer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create offer'
        });
    }
};

// Get single offer
const getOffer = async (req, res) => {
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
        console.error('Error fetching offer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch offer'
        });
    }
};

// Update offer
const updateOffer = async (req, res) => {
    try {
        console.log('Update offer request body:', req.body); // Debug log
        
        const {
            name,
            description,
            discountType,
            discountValue,
            minPurchase,
            maxDiscount,
            startDate,
            endDate,
            targetType,
            targetProduct,
            targetCategory,
            offerId
        } = req.body;

        // Find offer
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

        // Validate required fields
        if (!name || !discountType || !discountValue || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Validate discount value
        if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid discount percentage'
            });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start >= end) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Update offer
        offer.name = name;
        offer.description = description || '';
        offer.discountType = discountType;
        offer.discountValue = Number(discountValue);
        offer.minPurchase = minPurchase ? Number(minPurchase) : 0;
        offer.maxDiscount = maxDiscount ? Number(maxDiscount) : null;
        offer.validFrom = start;
        offer.validUntil = end;
        
        // Handle target products/categories based on targetType
        if (targetType === 'product' && targetProduct) {
            offer.targetProducts = [targetProduct];
            offer.targetCategories = [];
        } else if (targetType === 'category' && targetCategory) {
            offer.targetCategories = [targetCategory];
            offer.targetProducts = [];
        }

        await offer.save();

        res.json({
            success: true,
            message: 'Offer updated successfully',
            offer
        });
    } catch (error) {
        console.error('Error updating offer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update offer'
        });
    }
};

// Toggle offer status
const toggleOfferStatus = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

        // If isActive is provided in the request body, use that value
        // Otherwise toggle the current value
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
        console.error('Error toggling offer status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle offer status'
        });
    }
};

module.exports = {
    viewOffers,
    getActiveProducts,
    getActiveCategories,
    createOffer,
    getOffer,
    updateOffer,
    toggleOfferStatus
};