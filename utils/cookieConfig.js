/**
 * Environment-specific cookie configuration helper
 * Automatically detects hosting environment and sets appropriate cookie options
 */

const getCookieConfig = (req, customOptions = {}) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const isSecure = req.secure || req.get('X-Forwarded-Proto') === 'https';
    const host = req.get('Host');
    
    // Log environment detection
    console.log('\n--- COOKIE CONFIG DETECTION ---');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('Request secure:', req.secure);
    console.log('X-Forwarded-Proto:', req.get('X-Forwarded-Proto'));
    console.log('Host:', host);
    console.log('Detected secure connection:', isSecure);
    
    // Base configuration
    const baseConfig = {
        httpOnly: true,
        secure: isSecure, // Dynamic based on actual connection
        sameSite: 'lax',
        path: '/'
    };
    
    // Add domain for production if specified
    if (isProduction && process.env.COOKIE_DOMAIN) {
        baseConfig.domain = process.env.COOKIE_DOMAIN;
        console.log('Using cookie domain:', baseConfig.domain);
    }
    
    // Merge with custom options
    const finalConfig = { ...baseConfig, ...customOptions };
    
    console.log('Final cookie config:', JSON.stringify(finalConfig, null, 2));
    console.log('--- COOKIE CONFIG DETECTION END ---\n');
    
    return finalConfig;
};

const getOTPCookieConfig = (req) => {
    return getCookieConfig(req, {
        maxAge: 30 * 60 * 1000, // 30 minutes
        path: '/verify-otp'
    });
};

const getUserTokenCookieConfig = (req) => {
    return getCookieConfig(req, {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'
    });
};

module.exports = {
    getCookieConfig,
    getOTPCookieConfig,
    getUserTokenCookieConfig
};
