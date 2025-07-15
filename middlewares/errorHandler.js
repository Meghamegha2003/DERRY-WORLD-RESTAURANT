const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    if (res.headersSent) {
        return next(err);
    }

    const isApiRequest = req.path.startsWith('/api/') || 
                        req.path.includes('/active-products') || 
                        req.path.includes('/active-categories') ||
                        req.accepts(['html', 'json']) === 'json';

    if (err.view && !isApiRequest) {
        return res.status(500).render('error', {
            message: 'Error rendering page',
            error: process.env.NODE_ENV === 'development' ? err : {},
            user: req.user || null,
            cartCount: res.locals.cartCount || 0,
            activePage: 'error'
        });
    }

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            errors: Object.values(err.errors).map(error => error.message)
        });
    }

    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        res.clearCookie('token');
        res.clearCookie('admin_token');
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token. Please login again.'
        });
    }

    if (err.name === 'MongoError' || err.name === 'MongoServerError') {
        if (err.code === 11000) { 
            return res.status(409).json({
                success: false,
                message: 'This record already exists.'
            });
        }
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'File size exceeds the limit.'
        });
    }

    if (isApiRequest) {
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }

    res.status(err.status || 500).render('error', {
        message: err.message || 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.user || null,
        cartCount: res.locals.cartCount || 0,
        activePage: 'error'
    });
};

module.exports = errorHandler;