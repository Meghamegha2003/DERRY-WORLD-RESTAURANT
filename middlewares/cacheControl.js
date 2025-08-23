const cacheControl = (req, res, next) => {
    // Common security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Check for checkout or order confirmation pages
    const isCheckoutPage = req.path.startsWith('/checkout');
    const isOrderConfirmation = req.path.startsWith('/order-confirmation') || 
                              (req.path.startsWith('/orders/') && req.method === 'GET');
    
    // Prevent access to checkout page if order was already placed
    if (isCheckoutPage && req.cookies && req.cookies.orderToken) {
        return res.redirect('/orders');
    }
    
    // Set cache control headers
    if (isCheckoutPage || isOrderConfirmation) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        
        // Prevent page from being cached in the browser history
        res.setHeader('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        
        // For older browsers
        res.setHeader('Expires', '-1');
        
        // Add no-store to prevent caching in any form
        res.setHeader('Cache-Control', 'no-store');
    } else {
        // Default cache control for other pages
        res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    }
    
    next();
};

const preventBackAfterLogin = (req, res, next) => {
    // If user is logged in and tries to access login/register pages, redirect to home
    if (req.cookies.userToken && (req.path === '/login' || req.path === '/register')) {
        return res.redirect('/');
    }
    
    // For other cases, continue
    next();
};

module.exports = {
    cacheControl,
    preventBackAfterLogin
};
