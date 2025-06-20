const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');
const Cart = require('../models/cartSchema');

const getTokenFromRequest = (req, type = 'user') => {
    // Try to get token from Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    
    // Then try cookies
    const token = req.cookies[`${type}Token`];
    return token;
};

const verifyToken = async (token, requireAdmin = false) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // For admin routes, verify the token has admin flag
        if (requireAdmin && !decoded.isAdmin) {
            return { success: false, error: 'Unauthorized' };
        }
        
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        // Check if user is active
        if (!requireAdmin && !user.isActive) {
            return { success: false, error: 'Account is blocked' };
        }
        
        // For admin routes, verify user has admin role
        if (requireAdmin && !user.roles?.includes('admin')) {
            return { success: false, error: 'Unauthorized' };
        }
        
        return { success: true, user };
    } catch (error) {
        // Check if token is expired
        if (error.name === 'TokenExpiredError') {
            return { success: false, error: 'Token expired', clearToken: true };
        }
        return { success: false, error: error.message, clearToken: true };
    }
};

const auth = async (req, res, next) => {
    try {
        const token = getTokenFromRequest(req, 'user');
        
        if (!token) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }
            return res.redirect('/login');
        }

        const result = await verifyToken(token);
        if (!result.success) {
             
            // Clear user token if needed
            if (result.clearToken || result.error === 'Account is blocked') {
                res.clearCookie('userToken', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    path: '/'
                });
            }
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({
                    success: false,
                    message: result.error || 'Invalid or expired token'
                });
            }
            return res.redirect('/login');
        }

        req.user = result.user;

        // Get cart count
        try {
            const cart = await Cart.findOne({ user: req.user._id });
            req.cartCount = cart ? cart.items.reduce((total, item) => total + item.quantity, 0) : 0;
        } catch (error) {
            req.cartCount = 0;
        }
        next();
    } catch (error) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Authentication error'
            });
        }
        return res.redirect('/login');
    }
};

const adminAuth = async (req, res, next) => {
    try {
       
        const token = getTokenFromRequest(req, 'admin');
        if (!token) {
             // Always return JSON for AJAX or JSON requests
            if (
                req.xhr ||
                req.headers.accept?.includes('application/json') ||
                req.headers['content-type'] === 'application/json' ||
                req.headers.accept === '*/*'
            ) {
                return res.status(401).json({
                    success: false,
                    message: 'Admin authentication required'
                });
            }
            return res.redirect('/admin/login');
        }

        const result = await verifyToken(token, true);
        if (!result.success) {
            if (result.clearToken) {
                res.clearCookie('adminToken');
            }
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({
                    success: false,
                    message: result.error || 'Authentication required'
                });
            }
            return res.redirect('/admin/login');
        }

        req.user = result.user;
        next();
    } catch (error) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Authentication error'
            });
        }
        return res.redirect('/admin/login');
    }
};

const preventAuthPages = async (req, res, next) => {
    try {
        
        // For admin login page
        if (req.originalUrl === '/admin/login') {
            const adminToken = getTokenFromRequest(req, 'admin');
            if (adminToken) {
                const result = await verifyToken(adminToken, true);
                if (result.success) {
                    return res.redirect('/admin');
                }
            }
            // Even if user is logged in, allow access to admin login
            return next();
        } 
        // For user login/register pages
        else if (req.originalUrl === '/login' || req.originalUrl === '/register') {
            const userToken = getTokenFromRequest(req, 'user');
            if (userToken) {
                const result = await verifyToken(userToken);
                if (result.success) {
                    return res.redirect('/');
                }
            }
            return next();
        }
        
        // For any other auth pages
        next();
    } catch (error) {
        next();
    }
};

const optionalAuth = async (req, res, next) => {
    try {
        const token = getTokenFromRequest(req, 'user');
        
        if (token) {
            const result = await verifyToken(token);
            if (result.success) {
                req.user = result.user;

                // Get cart count
                try {
                    const cart = await Cart.findOne({ user: req.user._id });
                    req.cartCount = cart ? cart.items.reduce((total, item) => total + item.quantity, 0) : 0;
                } catch (error) {
                    req.cartCount = 0;
                }
            }
        }
        next();
    } catch (error) {
        next();
    }
};

module.exports = {
    auth,
    adminAuth,
    preventAuthPages,
    optionalAuth
};