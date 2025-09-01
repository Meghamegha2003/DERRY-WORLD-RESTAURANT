/**
 * Cookie Debugging Middleware
 * Logs all cookie operations for debugging purposes
 */

const cookieDebugger = (req, res, next) => {
    // Only log in development or when DEBUG_COOKIES is set
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_COOKIES === 'true') {
        
        // Log incoming cookies
        if (Object.keys(req.cookies).length > 0) {
            console.log(`\n🍪 [${req.method} ${req.path}] Incoming cookies:`, req.cookies);
        }
        
        // Override res.cookie to log outgoing cookies
        const originalCookie = res.cookie;
        res.cookie = function(name, value, options) {
            console.log(`\n🍪 [${req.method} ${req.path}] Setting cookie:`, {
                name,
                value: typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' : value,
                options
            });
            return originalCookie.call(this, name, value, options);
        };
        
        // Override res.clearCookie to log cookie clearing
        const originalClearCookie = res.clearCookie;
        res.clearCookie = function(name, options) {
            console.log(`\n🍪 [${req.method} ${req.path}] Clearing cookie:`, { name, options });
            return originalClearCookie.call(this, name, options);
        };
    }
    
    next();
};

module.exports = cookieDebugger;
