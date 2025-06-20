const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Check if headers are already sent
    if (res.headersSent) {
        return next(err);
    }

    // Check if this is an API request
    const isApiRequest = req.path.startsWith('/api/') || 
                        req.path.includes('/active-products') || 
                        req.path.includes('/active-categories') ||
                        req.accepts(['html', 'json']) === 'json';

    // Handle view rendering errors
    if (err.view && !isApiRequest) {
        return res.status(500).render('error', {
            message: 'Error rendering page',
            error: process.env.NODE_ENV === 'development' ? err : {},
            user: req.user || null,
            cartCount: res.locals.cartCount || 0,
            activePage: 'error'
        });
    }

    // Handle validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            errors: Object.values(err.errors).map(error => error.message)
        });
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        res.clearCookie('token');
        res.clearCookie('admin_token');
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token. Please login again.'
        });
    }

    // Handle MongoDB errors
    if (err.name === 'MongoError' || err.name === 'MongoServerError') {
        if (err.code === 11000) { // Duplicate key error
            return res.status(409).json({
                success: false,
                message: 'This record already exists.'
            });
        }
    }

    // Handle file upload errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'File size exceeds the limit.'
        });
    }

    // For API requests, always return JSON
    if (isApiRequest) {
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }

    // For all other errors in web requests, render error page
    res.status(err.status || 500).render('error', {
        message: err.message || 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.user || null,
        cartCount: res.locals.cartCount || 0,
        activePage: 'error'
    });
};

module.exports = errorHandler;