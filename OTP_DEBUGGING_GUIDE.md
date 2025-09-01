# OTP Verification Debugging Guide

## Overview
This guide helps debug OTP verification failures for other users after hosting your Node.js application. The system has been enhanced with comprehensive logging to identify the root cause.

## Enhanced Logging Features

### 1. Backend Logging (userController.js)

#### Registration Cookie Setting Debug
- Environment detection (development/production)
- Request protocol, security, and host information
- Cookie options being set
- Token length validation

#### OTP Verification Debug
- Complete request analysis (IP, User-Agent, Host, Protocol)
- All cookies received from client
- Request body and query parameters
- Token source detection (body/query/cookie)
- JWT token verification with detailed timing
- Database OTP lookup with expiry checking
- Comparison of all OTP records for the email

#### Verify OTP Page Render Debug
- Cookie reception analysis
- Token availability from different sources
- JWT verification on page load

### 2. Frontend Logging (verify-otp.ejs)

#### Client-Side Debug Information
- Current URL, domain, protocol, and port
- All available cookies in browser
- Token collection from multiple sources
- API request preparation details
- Complete response analysis

## Step-by-Step Debugging Process

### Step 1: Check Server Logs During Registration

When a user registers, look for these log sections:

```
=== COOKIE SETTING DEBUG ===
Environment: production
Request protocol: https
Request secure: true
Request host: yourdomain.com
Cookie options being set: {
  "httpOnly": true,
  "secure": true,
  "maxAge": 1800000,
  "sameSite": "lax",
  "path": "/verify-otp"
}
```

**Key Issues to Check:**
- ✅ `secure: true` should be set for HTTPS production
- ✅ `Request protocol: https` for hosted sites
- ✅ `Request host` should match your domain
- ❌ If `secure: false` on HTTPS site, cookies won't be sent

### Step 2: Check OTP Page Access Logs

When user accesses verify-otp page, look for:

```
=== VERIFY OTP PAGE RENDER DEBUG ===
--- COOKIES ON VERIFY PAGE ---
All cookies: {"otpToken": "eyJ0eXAiOiJKV1QiLCJhbGc..."}
--- TOKEN SOURCES ON PAGE RENDER ---
Token from URL: EXISTS (length: 200)
Token from cookie: EXISTS (length: 200)
```

**Key Issues to Check:**
- ❌ If `All cookies: {}` - cookies not being sent
- ❌ If `Token from cookie: NULL` - cookie not accessible
- ✅ Token should exist from URL or cookie

### Step 3: Check OTP Verification Attempt Logs

When user submits OTP, look for:

```
=== OTP VERIFICATION DEBUG START ===
--- COOKIES RECEIVED ---
All cookies: {"otpToken": "eyJ0eXAiOiJKV1QiLCJhbGc..."}
--- TOKEN SOURCES ---
Token from body: EXISTS (length: 200)
Token from query: NULL
Token from cookie: EXISTS (length: 200)
--- JWT TOKEN VERIFICATION ---
✅ JWT verification successful
--- DATABASE OTP LOOKUP ---
✅ Valid OTP found in database
```

**Key Issues to Check:**
- ❌ `All cookies: {}` - cookies not being received
- ❌ `Token from body: NULL` and `Token from cookie: NULL` - no token available
- ❌ `JWT verification failed` - token expired or invalid
- ❌ `No valid OTP found` - OTP mismatch or expired

### Step 4: Check Browser Console Logs

Ask users to open browser console (F12) and look for:

```
=== FRONTEND OTP SUBMISSION DEBUG ===
Current URL: https://yourdomain.com/verify-otp
Current domain: yourdomain.com
Current protocol: https:
--- FRONTEND COOKIES ---
Document.cookie: otpToken=eyJ0eXAiOiJKV1QiLCJhbGc...
--- API REQUEST PREPARATION ---
Request URL: /verify-otp
Full URL will be: https://yourdomain.com/verify-otp
--- API RESPONSE RECEIVED ---
Response status: 200
Response OK: true
```

**Key Issues to Check:**
- ❌ `Document.cookie:` empty - cookies not accessible to JavaScript
- ❌ `Full URL will be: http://localhost:3000/verify-otp` - pointing to localhost
- ❌ `Response status: 500` - server error
- ❌ Network errors in console

## Common Issues and Solutions

### Issue 1: Cookies Not Being Set (HTTPS/HTTP Mismatch)

**Symptoms:**
- `All cookies: {}` in server logs
- `Document.cookie:` empty in browser console

**Root Cause:**
- `secure: true` cookie flag on HTTP site
- Mixed HTTP/HTTPS content

**Solution:**
```javascript
// In userController.js, update cookie options:
const cookieOptions = {
    httpOnly: true,
    secure: req.secure || req.get('X-Forwarded-Proto') === 'https', // Dynamic secure flag
    maxAge: 30 * 60 * 1000,
    sameSite: 'lax',
    path: '/verify-otp'
};
```

### Issue 2: Domain/Subdomain Cookie Issues

**Symptoms:**
- Cookies set but not accessible on verification

**Root Cause:**
- Cookie domain mismatch
- Subdomain issues

**Solution:**
```javascript
// Add domain option for subdomains:
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 60 * 1000,
    sameSite: 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined, // e.g., '.yourdomain.com'
    path: '/verify-otp'
};
```

### Issue 3: API Calls to Localhost

**Symptoms:**
- `Full URL will be: http://localhost:3000/verify-otp` in browser console

**Root Cause:**
- Frontend making relative API calls that resolve to localhost

**Solution:**
- Ensure relative URLs (`/verify-otp`) are used
- Check if any hardcoded localhost URLs exist

### Issue 4: CORS Issues

**Symptoms:**
- CORS errors in browser console
- Network request failures

**Solution:**
```javascript
// Add CORS middleware in app.js:
const cors = require('cors');
app.use(cors({
    origin: process.env.FRONTEND_URL || 'https://yourdomain.com',
    credentials: true
}));
```

### Issue 5: Reverse Proxy Cookie Issues

**Symptoms:**
- Cookies work locally but not on hosted environment

**Root Cause:**
- Nginx/Apache not forwarding cookies properly

**Solution:**
```nginx
# In Nginx config:
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cookie_path / /;
}
```

## Environment Variables to Check

Add these to your `.env` file:

```env
# Cookie configuration
COOKIE_DOMAIN=.yourdomain.com
FRONTEND_URL=https://yourdomain.com

# Security
NODE_ENV=production
JWT_SECRET=your-secret-key
```

## Testing Checklist

### For Your Device (Working)
1. ✅ Check server logs show proper cookie setting
2. ✅ Verify JWT token creation and verification
3. ✅ Confirm OTP database storage and retrieval

### For Other Devices (Failing)
1. ❌ Compare cookie reception logs
2. ❌ Check browser console for errors
3. ❌ Verify API endpoint resolution
4. ❌ Test cookie accessibility

## Quick Fix Commands

### Temporary HTTP Cookie Fix
```javascript
// In userController.js, temporarily set secure: false for testing:
secure: false, // ONLY FOR TESTING - REMOVE IN PRODUCTION
```

### Add Request Logging Middleware
```javascript
// In app.js, add before routes:
app.use((req, res, next) => {
    console.log('Request:', req.method, req.url, 'Cookies:', req.cookies);
    next();
});
```

## Next Steps

1. **Deploy with enhanced logging** - The system now has comprehensive logging
2. **Test with other users** - Ask them to check browser console
3. **Compare logs** - Check differences between working and failing requests
4. **Identify root cause** - Use the debugging information to pinpoint the issue
5. **Apply appropriate fix** - Based on the identified issue type

## New Debugging Tools Added

### 1. Cookie Configuration Helper (`utils/cookieConfig.js`)
Automatically detects hosting environment and sets appropriate cookie options:
```javascript
const { getOTPCookieConfig } = require('./utils/cookieConfig');
const cookieOptions = getOTPCookieConfig(req); // Auto-detects secure/domain settings
```

### 2. Quick Diagnostic Script (`scripts/otpDiagnostic.js`)
Run immediate diagnostics for any email:
```bash
node scripts/otpDiagnostic.js user@example.com
```

**What it checks:**
- Environment variables (JWT_SECRET, NODE_ENV, etc.)
- Database connectivity
- Existing user records
- OTP records and expiry
- JWT token creation/verification
- Cookie configuration
- Provides specific recommendations

### 3. Cookie Debug Middleware (`middleware/cookieDebugger.js`)
Optional middleware to log all cookie operations:
```javascript
// Add to app.js for detailed cookie logging
const cookieDebugger = require('./middleware/cookieDebugger');
app.use(cookieDebugger); // Only logs in development
```

## Quick Start Debugging

### Step 1: Run Diagnostic Script
```bash
cd /path/to/your/project
node scripts/otpDiagnostic.js failing-user@example.com
```

This will immediately show:
- ✅ What's working correctly
- ❌ What's failing
- 💡 Specific recommendations

### Step 2: Enable Cookie Debugging (Optional)
Add to your `app.js` before routes:
```javascript
const cookieDebugger = require('./middleware/cookieDebugger');
app.use(cookieDebugger);
```

### Step 3: Deploy and Test
The enhanced logging will show exactly where the OTP verification is failing:
- Cookie setting/reception issues
- JWT token problems  
- Database OTP mismatches
- API endpoint resolution problems
- HTTPS/HTTP security flag issues

### Step 4: Compare Logs
- **Your device (working)**: Look for ✅ success markers
- **Other devices (failing)**: Look for ❌ failure markers
- **Focus on differences** in cookie reception and JWT verification

## Most Common Fix

Based on hosting issues, try this first:

**Add to your `.env` file:**
```env
NODE_ENV=production
COOKIE_DOMAIN=.yourdomain.com
```

**Or temporarily test with:**
```javascript
// In userController.js, temporarily change:
secure: false, // ONLY FOR TESTING - REMOVE IN PRODUCTION
```

## Support Information

All logs are prefixed with clear markers (✅ success, ❌ failure, ⚠️ warning) for easy identification. The diagnostic script provides immediate insights without needing to wait for user testing.
