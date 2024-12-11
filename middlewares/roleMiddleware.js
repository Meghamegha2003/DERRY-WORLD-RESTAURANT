const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');

const checkRole = (roles) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized - Please log in' });
        }

        // Check if user has any of the required roles
        const hasRequiredRole = roles.some(role => 
            req.user.roles.includes(role) || 
            (role === 'admin' && req.user.isAdmin)
        );

        if (!hasRequiredRole) {
            return res.status(403).json({ error: 'Access denied - Insufficient permissions' });
        }

        next();
    };
};

// Helper middleware to ensure user is active
const isActiveUser = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized - Please log in' });
    }

    if (req.user.status !== 'Active') {
        return res.status(403).json({ error: 'Account is not active' });
    }

    next();
};

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: 'Access denied - Admin only' });
    }
    next();
};

module.exports = {
    checkRole,
    isActiveUser,
    isAdmin
};
