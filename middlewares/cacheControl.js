const cacheControl = (req, res, next) => {
    // Common security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Check for protected pages that should never be cached
    const isProtectedRoute = [
        '/dashboard',
        '/profile',
        '/orders',
        '/checkout',
        '/cart'
    ].some(route => req.path.startsWith(route));
    
    const isAuthPage = ['/login', '/register', '/forgot-password'].includes(req.path);
    
    // Prevent access to checkout page if order was already placed
    if (req.path.startsWith('/checkout') && req.cookies?.orderToken) {
        return res.redirect('/orders');
    }
    
    // Set no-cache, no-store for protected routes and auth pages
    if (isProtectedRoute || isAuthPage) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        
        // Prevent page from being cached in the browser history
        res.setHeader('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        
        // For older browsers
        res.setHeader('Expires', '-1');
    } else {
        // Default cache control for public pages
        res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    }
    
    next();
};

const preventBackAfterLogin = (req, res, next) => {
    // If user is logged in and tries to access auth pages, redirect to home
    const authRoutes = ['/login', '/register', '/forgot-password'];
    if (req.cookies.userToken && authRoutes.includes(req.path)) {
        return res.redirect('/');
    }
    
    // Prevent caching of auth pages
    if (authRoutes.includes(req.path)) {
        res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        res.header('Pragma', 'no-cache');
        res.header('Expires', '-1');
    }
    
    next();
};

// Middleware to prevent back button after logout
const preventCache = (req, res, next) => {
    res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '-1');
    next();
};

module.exports = {
    cacheControl,
    preventBackAfterLogin,
    preventCache
};
