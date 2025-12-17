const { optionalAuth } = require('./authMiddleware');

const setViewLocals = (req, res, next) => {
    // Use optionalAuth to populate req.user and req.cartCount if a valid token exists
    optionalAuth(req, res, () => {
        // Set locals for the views
        res.locals.authenticated = !!req.user;
        res.locals.user = req.user || null;
        res.locals.cartCount = req.cartCount || 0;
        next();
    });
};

module.exports = { setViewLocals };
