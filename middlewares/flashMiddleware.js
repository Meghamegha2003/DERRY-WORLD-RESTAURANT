/**
 * Middleware for handling flash messages
 * Adds setMessage helper to response object and processes flash messages from cookies
 */

module.exports = {
    // Middleware to add setMessage helper to response object
    setMessage: (req, res, next) => {
        res.setMessage = function(type, message) {
            res.cookie('flash', JSON.stringify({ type, message }), {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production'
            });
        };
        next();
    },

    // Middleware to get and clear flash message from cookie
    getFlash: (req, res, next) => {
        const flash = req.cookies.flash;
        if (flash) {
            try {
                res.locals.flash = JSON.parse(flash);
            } catch (e) {
                // Error parsing flash message - ignore
            }
            res.clearCookie('flash');
        }
        next();
    }
};
