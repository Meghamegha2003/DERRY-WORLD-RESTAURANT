// Google OAuth Debug Script for Hosted Environment
// Add this to your hosted server to debug OAuth issues

const express = require('express');
const router = express.Router();

// Debug route - add this to your hosted server temporarily
router.get('/debug-oauth', (req, res) => {
    const debugInfo = {
        environment: 'HOSTED',
        host: req.get('host'),
        protocol: req.protocol,
        fullUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
        environmentVariables: {
            GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET',
            GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET',
            GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'NOT SET (using fallback)',
        },
        expectedCallbackURL: 'http://derryworld.ddns.net/auth/google/callback',
        actualCallbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://derryworld.ddns.net/auth/google/callback',
        instructions: [
            'If GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is NOT SET, add them to your hosted environment',
            'In Google Cloud Console, add: http://derryworld.ddns.net/auth/google/callback to Authorized redirect URIs',
            'Set GOOGLE_CALLBACK_URL=http://derryworld.ddns.net/auth/google/callback in your hosted .env',
            'Restart your hosted application after making changes'
        ]
    };
    
    res.json(debugInfo);
});

module.exports = router;
