/**
 * Error handling middlewares
 * Handles 404 errors and general error handling
 */

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
    res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'Page not found',
        error: {
            status: 404,
            stack: process.env.NODE_ENV === 'development' ? 'Page not found' : ''
        },
        user: req.user || null,
        cartCount: 0
    });
};

/**
 * General error handler
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Check if it's an API request
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(err.status || 500).json({
            success: false,
            message: err.message || 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }

    // Render error page
    res.status(err.status || 500).render('error', {
        title: 'Error',
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.user || null,
        cartCount: 0
    });
};

module.exports = {
    notFoundHandler,
    errorHandler
};
