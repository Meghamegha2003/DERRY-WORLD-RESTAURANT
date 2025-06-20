const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const OfferService = require('../../services/offerService');
const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const Cart = require('../../models/cartSchema');

// Constants
const ITEMS_PER_PAGE = 12;
const SORT_OPTIONS = {
    'name-asc': { name: 1 },
    'name-desc': { name: -1 },
    'price-low': { salesPrice: 1 },
    'price-high': { salesPrice: -1 }
};

// Filtering logic removed. Always return base query.
const buildQuery = () => ({
    isListed: true,
    isBlocked: false,
   
});

// Helper function to get active categories
const getActiveCategories = async () => {
    return await Category.find({
        isListed: true,
        isBlocked: false
    }).sort({ name: 1 }).lean();
};

// Apply offers only, no price filtering
const applyOffersAndFilter = async (products) => {
    return await Promise.all(products.map(async (product) => {
        const offerDetails = await OfferService.getBestOffer(product);
        return {
            ...product,
            offerDetails,
            finalPrice: offerDetails?.finalPrice ?? (product.salesPrice || product.regularPrice)
        };
    }));
};

// Add wishlist status to products
const addWishlistStatus = async (products, userId) => {
    if (!userId) return products;

    const user = await User.findById(userId).select('wishlist').lean();
    const wishlistItems = user.wishlist.map(item => item.product.toString());

    return products.map(product => ({
        ...product,
        isInWishlist: wishlistItems.includes(product._id.toString())
    }));
};


// Utility to get unique product count
function getUniqueProductCount(cart) {
  if (!cart || !cart.items) return 0;
  return new Set(cart.items.filter(item => item && item.product).map(item => item.product.toString())).size;
}

// Render menu page
const renderMenuPage = async (req, res) => {
    // DEBUG: Log incoming query params
    try {
        // Get filter parameters
        const { page = 1, search, sort, category, dietaryType, minPrice, maxPrice } = req.query;
        
        // Build base query
        const query = buildQuery();
        // Add search by product name (starts with, case-insensitive)
        if (search && typeof search === 'string' && search.trim()) {
            query.name = { $regex: '^' + search.trim(), $options: 'i' };
        }
        // Get all active categories (not blocked)
        const activeCategories = await Category.find({ isBlocked: false, isListed: true }).lean();
        const activeCategoryIds = activeCategories.map(cat => cat._id.toString());
        // Filter by category if provided and is an active category
        if (category && activeCategoryIds.includes(category)) {
            query.category = category;
        } else {
            // Always restrict to only active categories
            query.category = { $in: activeCategoryIds };
        }
        // Filter by dietaryType if provided
        if (dietaryType && ['veg','nonveg','vegan'].includes(dietaryType)) {
            query.dietaryType = dietaryType;
        }
        
        // Fetch all products matching basic filters
        let allProducts = await Product.find(query)
            .populate('category')
            .lean();
        // Apply offers to compute finalPrice
        let productsWithOffers = await applyOffersAndFilter(allProducts);
        // Compute dynamic slider range from finalPrice
        const finalPrices = productsWithOffers.map(p => p.finalPrice);
        const priceRangeMin = finalPrices.length ? Math.min(...finalPrices) : 0;
        const priceRangeMax = finalPrices.length ? Math.max(...finalPrices) : 0;
        // JS filter by user-selected price range
        let minPriceNum = parseFloat(minPrice);
        let maxPriceNum = parseFloat(maxPrice);
        if (!isNaN(minPriceNum)) {
            productsWithOffers = productsWithOffers.filter(p => p.finalPrice >= minPriceNum);
        }
        if (!isNaN(maxPriceNum)) {
            productsWithOffers = productsWithOffers.filter(p => p.finalPrice <= maxPriceNum);
        }
        // Sort products based on selected sort option
        if (sort === 'price-low') {
            productsWithOffers.sort((a, b) => a.finalPrice - b.finalPrice);
        } else if (sort === 'price-high') {
            productsWithOffers.sort((a, b) => b.finalPrice - a.finalPrice);
        } else if (sort === 'name-asc') {
            productsWithOffers.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sort === 'name-desc') {
            productsWithOffers.sort((a, b) => b.name.localeCompare(a.name));
        } else {
            // Default: newest first
            productsWithOffers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        // Pagination in JS
        const totalProducts = productsWithOffers.length;
        const startIdx = (page - 1) * ITEMS_PER_PAGE;
        const paginated = productsWithOffers.slice(startIdx, startIdx + ITEMS_PER_PAGE);
        const products = paginated;
        // Get categories for filter
        const categories = await getActiveCategories();
        
        // Add wishlist status
        const processedProducts = await addWishlistStatus(products, req.user?._id);

        // Calculate pagination info
        const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
        
        // Get cart count if user is logged in
        let cartCount = 0;
        if (req.user) {
          const cart = await Cart.findOne({ user: req.user._id });
          cartCount = getUniqueProductCount(cart);
        }
        
        // Render page
        res.render('user/menu', {
            title: 'Menu',
            products: processedProducts,
            categories,
            filters: {
                search,
                page,
                sort,
                category,
                dietaryType,
                minPrice,
                maxPrice
            },
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: parseInt(page) + 1,
                prevPage: parseInt(page) - 1
            },
            cartCount,
            user: req.user || null,

            activeSort: sort || 'default'
        });
    } catch (error) {
        console.error('Error in renderMenuPage:', error);
        res.status(500).render('error', {
            message: 'Failed to load menu',
            error
        });
    }
};

// Render category menu
const renderCategoryMenu = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { page = 1 } = req.query;
        
        // Validate category
        const category = await Category.findOne({
            _id: categoryId,
            isListed: true,
            isBlocked: false
        });
        
        if (!category) {
            return res.status(404).render('error', {
                message: 'Category not found'
            });
        }
        
        // Build query
        const query = {
            category: categoryId,
            isListed: true,
            isBlocked: false,
        };
        
        
        // Get total count for pagination
        const totalProducts = await Product.countDocuments(query);
        
        // Get products with pagination
        const products = await Product.find(query)
            .populate('category')
            .skip((page - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE)
            .lean();
            
        // Apply offers
        let processedProducts = await applyOffersAndFilter(products);
        
        // Add wishlist status
        processedProducts = await addWishlistStatus(processedProducts, req.user?._id);

        // Filter by price range (effective price: offer price if present, otherwise sales price)
        let minPriceNum = parseFloat(minPrice);
        let maxPriceNum = parseFloat(maxPrice);
        if (!isNaN(minPriceNum) || !isNaN(maxPriceNum)) {
            processedProducts = processedProducts.filter(p => {
                if (typeof p.finalPrice !== 'number') return false;
                if (!isNaN(minPriceNum) && p.finalPrice < minPriceNum) return false;
                if (!isNaN(maxPriceNum) && p.finalPrice > maxPriceNum) return false;
                return true;
            });
        }
        
        // Sort products if needed
        if (sort) {
            processedProducts = sortProducts(processedProducts, sort);
        }
        
        // Calculate pagination info
        const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
        
        // Get cart count if user is logged in
        const cartCount = req.user ? await Cart.countDocuments({ user: req.user._id }) : 0;
        
        // Render page
        res.render('user/categoryMenu', {
            title: `${category.name} Menu`,
            category,
            products: processedProducts,
            filters: {

                search,
                page
            },
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: parseInt(page) + 1,
                prevPage: parseInt(page) - 1
            },
            cartCount,
            user: req.user || null,

            activeSort: sort || 'default'
        });
    } catch (error) {
        console.error('Error in renderCategoryMenu:', error);
        res.status(500).render('error', {
            message: 'Failed to load category menu',
            error
        });
    }
};


// Filtering endpoint removed. No longer used.
const filterProducts = async (req, res) => {
    res.status(410).json({ success: false, message: 'Filtering is disabled.' });
};


module.exports = {
    renderMenuPage,
    renderCategoryMenu: (req, res) => { res.status(501).send('Not implemented'); },
    searchProducts: (req, res) => { res.status(501).send('Not implemented'); },
    filterProducts: (req, res) => { res.status(501).send('Not implemented'); },
    renderCategoryMenu,

    filterProducts
};