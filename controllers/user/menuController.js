const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const OfferService = require('../../services/offerService');
const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const Cart = require('../../models/cartSchema');
const HttpStatus = require('../../utils/httpStatus');

const ITEMS_PER_PAGE = 12;
const SORT_OPTIONS = {
    'name-asc': { name: 1 },
    'name-desc': { name: -1 },
    'price-low': { salesPrice: 1 },
    'price-high': { salesPrice: -1 }
};

exports.buildQuery = () => ({
    isListed: true,
    isBlocked: false,
});

exports.getActiveCategories = async () => {
    return await Category.find({
        isListed: true,
        isBlocked: false
    }).sort({ name: 1 }).lean();
};

exports.applyOffersAndFilter = async (products) => {
    return await Promise.all(products.map(async (product) => {
        const offerDetails = await OfferService.getBestOffer(product);
        return {
            ...product,
            offerDetails,
            finalPrice: offerDetails?.finalPrice ?? (product.salesPrice || product.regularPrice)
        };
    }));
};

exports.addWishlistStatus = async (products, userId) => {
    if (!userId) return products;

    const user = await User.findById(userId).select('wishlist').lean();
    const wishlistItems = user.wishlist.map(item => item.product.toString());

    return products.map(product => ({
        ...product,
        isInWishlist: wishlistItems.includes(product._id.toString())
    }));
};

exports.getUniqueProductCount = (cart) => {
  if (!cart || !cart.items) return 0;
  return new Set(cart.items.filter(item => item && item.product).map(item => item.product.toString())).size;
}

exports.renderMenuPage = async (req, res) => {
    try {
        // Support both GET (query params) and POST (request body) methods
        const isPostRequest = req.method === 'POST';
        const filterData = isPostRequest ? req.body : req.query;
        const { page = 1, search, sort, category, dietaryType, minPrice, maxPrice } = filterData;
        
        const query = exports.buildQuery();
        if (search && typeof search === 'string' && search.trim()) {
            query.name = { $regex: '^' + search.trim(), $options: 'i' };
        }
        
        const activeCategories = await Category.find({ isBlocked: false, isListed: true }).lean();
        const activeCategoryIds = activeCategories.map(cat => cat._id.toString());
        
        if (category && activeCategoryIds.includes(category)) {
            query.category = category;
        } else {
            query.category = { $in: activeCategoryIds };
        }
        
        if (dietaryType && ['veg','nonveg','vegan'].includes(dietaryType)) {
            query.dietaryType = dietaryType;
        }
        
        let allProducts = await Product.find(query)
            .populate('category')
            .lean();
            
        let productsWithOffers = await exports.applyOffersAndFilter(allProducts);
        const finalPrices = productsWithOffers.map(p => p.finalPrice);
        const priceRangeMin = finalPrices.length ? Math.min(...finalPrices) : 0;
        const priceRangeMax = finalPrices.length ? Math.max(...finalPrices) : 0;
        
        let minPriceNum = parseFloat(minPrice);
        let maxPriceNum = parseFloat(maxPrice);
        if (!isNaN(minPriceNum)) {
            productsWithOffers = productsWithOffers.filter(p => p.finalPrice >= minPriceNum);
        }
        if (!isNaN(maxPriceNum)) {
            productsWithOffers = productsWithOffers.filter(p => p.finalPrice <= maxPriceNum);
        }
        
        if (sort === 'price-low') {
            productsWithOffers.sort((a, b) => a.finalPrice - b.finalPrice);
        } else if (sort === 'price-high') {
            productsWithOffers.sort((a, b) => b.finalPrice - a.finalPrice);
        } else if (sort === 'name-asc') {
            productsWithOffers.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sort === 'name-desc') {
            productsWithOffers.sort((a, b) => b.name.localeCompare(a.name));
        } else {
            productsWithOffers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        
        const totalProducts = productsWithOffers.length;
        const startIdx = (page - 1) * ITEMS_PER_PAGE;
        const paginated = productsWithOffers.slice(startIdx, startIdx + ITEMS_PER_PAGE);
        const products = paginated;
        
        const categories = await exports.getActiveCategories();
        const processedProducts = await exports.addWishlistStatus(products, req.user?._id);
        const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
        
        let cartCount = 0;
        if (req.user) {
            const cart = await Cart.findOne({ user: req.user._id });
            cartCount = exports.getUniqueProductCount(cart);
        }
        
        const finalProducts = Array.isArray(processedProducts) ? processedProducts : [];
        
        res.render('user/menu', {
            title: 'Menu',
            products: finalProducts,
            categories,
            filters: {
                search: search || '',
                page: parseInt(page) || 1,
                sort: sort || '',
                category: category || '',
                dietaryType: dietaryType || '',
                minPrice: minPrice || '',
                maxPrice: maxPrice || ''
            },
            pagination: {
                currentPage: parseInt(page) || 1,
                totalPages: totalPages || 1,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: (parseInt(page) || 1) + 1,
                prevPage: Math.max(1, (parseInt(page) || 1) - 1)
            },
            cartCount,
            user: req.user || null,
            activeSort: sort || 'default',
            priceRange: {
                min: Math.floor(priceRangeMin || 0),
                max: Math.ceil(priceRangeMax || 1000)
            }
        });
    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('error', {
            message: 'Failed to load menu',
            error
        });
    }
};

exports.renderCategoryMenu = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { page = 1, sort, minPrice, maxPrice } = req.query;
        
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
        
        const query = {
            category: categoryId,
            isListed: true,
            isBlocked: false,
        };
        
        const totalProducts = await Product.countDocuments(query);
        
        const products = await Product.find(query)
            .populate('category')
            .skip((page - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE)
            .lean();
            
        let processedProducts = await exports.applyOffersAndFilter(products);
        processedProducts = await exports.addWishlistStatus(processedProducts, req.user?._id);

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
        
        if (sort) {
            processedProducts = exports.sortProducts(processedProducts, sort);
        }
        
        const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
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
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('error', {
            message: 'Failed to load category menu',
            error
        });
    }
};


exports.searchProducts = async (req, res) => {
    try {
        const { query } = req.query;
        const userId = req.user?._id;

        if (!query || query.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Search query is required' 
            });
        }

        // Search in product name and description
        const products = await Product.find({
            $and: [
                { $or: [
                    { name: { $regex: query, $options: 'i' } },
                    { description: { $regex: query, $options: 'i' } }
                ]},
                { isListed: true },
                { isBlocked: false }
            ]
        }).lean();

        // Apply offers to products
        const productsWithOffers = await Promise.all(products.map(async (product) => {
            const offerDetails = await OfferService.getBestOffer(product);
            return {
                ...product,
                offerDetails,
                finalPrice: offerDetails?.finalPrice ?? (product.salesPrice || product.regularPrice)
            };
        }));

        // Add wishlist status if user is logged in
        let finalProducts = productsWithOffers;
        if (userId) {
            finalProducts = await exports.addWishlistStatus(productsWithOffers, userId);
        }

        const categories = await exports.getActiveCategories();
        
        res.render('user/menu', {
            title: `Search Results for "${query}"`,
            products: finalProducts,
            categories,
            currentCategory: null,
            query,
            user: req.user,
            cartCount: userId ? await exports.getUniqueProductCount(await Cart.findOne({ user: userId })) : 0
        });
    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('error', {
            message: 'Error loading menu',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
};

exports.filterProducts = async (req, res) => {
    res.status(200).json({ success: true, message: 'Filtering is no longer supported. All items are now shown.' });
};

exports.filterMenuPage = async (req, res) => {
    try {
        const { page = 1, search, sort, category, dietaryType, minPrice, maxPrice } = req.body;
        
        const query = exports.buildQuery();
        if (search && typeof search === 'string' && search.trim()) {
            query.name = { $regex: '^' + search.trim(), $options: 'i' };
        }
        
        const activeCategories = await Category.find({ isBlocked: false, isListed: true }).lean();
        const activeCategoryIds = activeCategories.map(cat => cat._id.toString());
        
        if (category && category !== 'all' && activeCategoryIds.includes(category)) {
            query.category = category;
        } else {
            query.category = { $in: activeCategoryIds };
        }
        
        if (dietaryType && dietaryType !== 'all' && ['veg','nonveg','vegan'].includes(dietaryType)) {
            query.dietaryType = dietaryType;
        }
        
        let allProducts = await Product.find(query)
            .populate('category')
            .lean();
            
        let productsWithOffers = await exports.applyOffersAndFilter(allProducts);
        const finalPrices = productsWithOffers.map(p => p.finalPrice);
        const priceRangeMin = finalPrices.length ? Math.min(...finalPrices) : 0;
        const priceRangeMax = finalPrices.length ? Math.max(...finalPrices) : 0;
        
        let minPriceNum = parseFloat(minPrice);
        let maxPriceNum = parseFloat(maxPrice);
        if (!isNaN(minPriceNum)) {
            productsWithOffers = productsWithOffers.filter(p => p.finalPrice >= minPriceNum);
        }
        if (!isNaN(maxPriceNum)) {
            productsWithOffers = productsWithOffers.filter(p => p.finalPrice <= maxPriceNum);
        }
        
        if (sort === 'price-low') {
            productsWithOffers.sort((a, b) => a.finalPrice - b.finalPrice);
        } else if (sort === 'price-high') {
            productsWithOffers.sort((a, b) => b.finalPrice - a.finalPrice);
        } else if (sort === 'name-asc') {
            productsWithOffers.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sort === 'name-desc') {
            productsWithOffers.sort((a, b) => b.name.localeCompare(a.name));
        } else {
            productsWithOffers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        
        const totalProducts = productsWithOffers.length;
        const startIdx = (page - 1) * ITEMS_PER_PAGE;
        const paginated = productsWithOffers.slice(startIdx, startIdx + ITEMS_PER_PAGE);
        const products = paginated;
        
        const categories = await exports.getActiveCategories();
        const processedProducts = await exports.addWishlistStatus(products, req.user?._id);
        const totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
        
        let cartCount = 0;
        if (req.user) {
            const cart = await Cart.findOne({ user: req.user._id });
            cartCount = exports.getUniqueProductCount(cart);
        }
        
        const finalProducts = Array.isArray(processedProducts) ? processedProducts : [];
        

        res.render('user/menu', {
            title: 'Menu',
            products: finalProducts,
            categories,
            filters: {
                search: search || '',
                page: parseInt(page) || 1,
                sort: sort || '',
                category: category || '',
                dietaryType: dietaryType || '',
                minPrice: minPrice || '',
                maxPrice: maxPrice || ''
            },
            pagination: {
                currentPage: parseInt(page) || 1,
                totalPages: totalPages || 1,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: (parseInt(page) || 1) + 1,
                prevPage: Math.max(1, (parseInt(page) || 1) - 1)
            },
            cartCount,
            user: req.user || null,
            activeSort: sort || 'default',
            priceRange: {
                min: Math.floor(priceRangeMin || 0),
                max: Math.ceil(priceRangeMax || 1000)
            },
            priceRangeMin: Math.floor(priceRangeMin || 0),
            priceRangeMax: Math.ceil(priceRangeMax || 1000)
        });
    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('error', {
            message: 'Failed to load menu',
            error
        });
    }
};