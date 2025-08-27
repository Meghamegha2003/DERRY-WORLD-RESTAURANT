const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');
const Cart = require('../models/cartSchema');

const getToken = (req, type = 'user') => {
    return req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring(7)
        : req.cookies[`${type}Token`];
};

const verifyToken = async (token, requireAdmin = false) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) return { success: false, error: 'User not found' };
        
        if (!requireAdmin && !user.isActive) {
            return { 
                success: false, 
                error: 'Your account has been blocked. Please contact support.',
                isBlocked: true
            };
        }
        
        if (requireAdmin && !user.roles?.includes('admin')) {
            return { success: false, error: 'Unauthorized' };
        }
        
        return { success: true, user };
    } catch (error) {
        return { 
            success: false, 
            error: error.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid token',
            clearToken: true
        };
    }
};

const clearToken = (res, type) => {
    res.clearCookie(`${type}Token`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'strict'
    });
};

const auth = async (req, res, next) => {
    try {
        const token = getToken(req, 'user');
        if (!token) {
            // Check if this is an AJAX request or regular browser navigation
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required',
                    redirect: '/login'
                });
            } else {
                // Regular browser navigation - redirect to login
                return res.redirect('/login');
            }
        }

        const result = await verifyToken(token);
        if (!result.success) {
            if (result.clearToken) clearToken(res, 'user');
            
            // Check if this is an AJAX request or regular browser navigation
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(result.isBlocked ? 403 : 401).json({
                    success: false,
                    message: result.error,
                    redirect: '/login',
                    isBlocked: result.isBlocked
                });
            } else {
                // Regular browser navigation - redirect to login
                if (result.isBlocked) {
                    return res.redirect('/login?blocked=true');
                } else {
                    return res.redirect('/login');
                }
            }
        }

        req.user = result.user;

        try {
            const cart = await Cart.findOne({ user: result.user._id });
            // Count unique products, not total quantities
            req.cartCount = cart?.items ? new Set(
                cart.items
                    .filter(item => item && item.product)
                    .map(item => item.product.toString())
            ).size : 0;
        } catch (error) {
            req.cartCount = 0;
        }

        next();
    } catch (error) {
        console.error('Auth error:', error);
        // Check if this is an AJAX request or regular browser navigation
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            res.status(500).json({
                success: false,
                message: 'Authentication error',
                redirect: '/login'
            });
        } else {
            // Regular browser navigation - redirect to login
            res.redirect('/login');
        }
    }
};

const adminAuth = async (req, res, next) => {
    try {
        const token = getToken(req, 'admin');
        
        // If no token and trying to access protected route, redirect to login
        if (!token) {
            return res.redirect('/admin/login');
        }

        const result = await verifyToken(token, true);
        
        // If token is invalid/expired, clear it and redirect to login
        if (!result.success) {
            if (result.clearToken) clearToken(res, 'admin');
            
            // If already on login page, just render it
            if (req.path === '/admin/login') {
                return next();
            }
            return res.redirect('/admin/login');
        }
        
        // If token is valid and user is trying to access login page, redirect to admin dashboard
        if (req.path === '/admin/login') {
            return res.redirect('/admin');
        }
        
        // If we get here, token is valid and user is authorized
        req.user = result.user;
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        res.redirect('/admin/login');
    }
};

const preventAuthPages = async (req, res, next) => {
    try {
        const { originalUrl } = req;
        const isAdminLogin = originalUrl === '/admin/login';
        const isUserAuthPage = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-otp'].some(path => 
            originalUrl.startsWith(path)
        );
        
        if (!isAdminLogin && !isUserAuthPage) return next();
        
        const tokenType = isAdminLogin ? 'admin' : 'user';
        const token = getToken(req, tokenType);
        
        if (token) {
            const result = await verifyToken(token, isAdminLogin);
            if (result.success) {
                // For AJAX/API requests, return JSON response
                if (req.xhr || req.headers.accept?.includes('application/json')) {
                    return res.status(200).json({
                        success: false,
                        message: 'Already authenticated',
                        redirect: isAdminLogin ? '/admin' : '/'
                    });
                }
                // For regular browser requests, redirect directly
                return res.redirect(isAdminLogin ? '/admin' : '/');
            }
        }
        
        next();
    } catch (error) {
        console.error('Prevent auth pages error:', error);
        next();
    }
};

const optionalAuth = async (req, res, next) => {
    try {
        const token = getToken(req, 'user');
        if (token) {
            const result = await verifyToken(token);
            if (result.success) {
                req.user = result.user;
                
                try {
                    const cart = await Cart.findOne({ user: result.user._id });
                    // Count unique products, not total quantities
                    req.cartCount = cart?.items ? new Set(
                        cart.items
                            .filter(item => item && item.product)
                            .map(item => item.product.toString())
                    ).size : 0;
                } catch (error) {
                    req.cartCount = 0;
                }
            }
        }
        next();
    } catch (error) {
        console.error('Optional auth error:', error);
        next();
    }
};

module.exports = {
    auth,
    adminAuth,
    preventAuthPages,
    optionalAuth
};