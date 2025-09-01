/**
 * OTP Verification Diagnostic Script
 * Run this script to quickly identify OTP verification issues
 * Usage: node scripts/otpDiagnostic.js <email>
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Import models
const OTP = require('../models/otpSchema');
const User = require('../models/userSchema');

async function runDiagnostic(email) {
    console.log('\n🔍 OTP VERIFICATION DIAGNOSTIC TOOL');
    console.log('=====================================');
    console.log(`Checking OTP verification for: ${email}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Database connected successfully');

        // Check environment variables
        console.log('\n📋 ENVIRONMENT CHECK:');
        console.log(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
        console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'SET' : 'MISSING'}`);
        console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? 'SET' : 'MISSING'}`);
        console.log(`EMAIL_USER: ${process.env.EMAIL_USER || 'undefined'}`);
        console.log(`EMAIL_PASS: ${process.env.EMAIL_PASS ? 'SET' : 'MISSING'}`);
        console.log(`COOKIE_DOMAIN: ${process.env.COOKIE_DOMAIN || 'undefined'}`);

        // Check if user exists
        console.log('\n👤 USER CHECK:');
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            console.log('❌ User already exists in database');
            console.log(`   - Name: ${existingUser.name}`);
            console.log(`   - Email: ${existingUser.email}`);
            console.log(`   - Verified: ${existingUser.isVerified}`);
            console.log(`   - Active: ${existingUser.isActive}`);
        } else {
            console.log('✅ Email available for registration');
        }

        // Check OTP records
        console.log('\n📧 OTP RECORDS CHECK:');
        const otpRecords = await OTP.find({ 
            email: { $regex: new RegExp(`^${email.toLowerCase()}$`, 'i') } 
        }).sort({ createdAt: -1 });

        if (otpRecords.length === 0) {
            console.log('❌ No OTP records found for this email');
        } else {
            console.log(`✅ Found ${otpRecords.length} OTP record(s):`);
            otpRecords.forEach((record, index) => {
                const isExpired = record.expiresAt <= new Date();
                const timeLeft = Math.floor((record.expiresAt - new Date()) / 60000);
                
                console.log(`   ${index + 1}. OTP: ${record.otp}`);
                console.log(`      Created: ${record.createdAt}`);
                console.log(`      Expires: ${record.expiresAt}`);
                console.log(`      Status: ${isExpired ? '❌ EXPIRED' : `✅ VALID (${timeLeft} min left)`}`);
                console.log('');
            });
        }

        // Test JWT token creation and verification
        console.log('\n🔐 JWT TOKEN TEST:');
        try {
            const testPayload = {
                purpose: 'otp_verification',
                email: email.toLowerCase(),
                timestamp: Date.now()
            };

            const testToken = jwt.sign(testPayload, process.env.JWT_SECRET, { expiresIn: '30m' });
            console.log('✅ JWT token creation successful');
            console.log(`   Token length: ${testToken.length}`);

            const decoded = jwt.verify(testToken, process.env.JWT_SECRET);
            console.log('✅ JWT token verification successful');
            console.log(`   Decoded email: ${decoded.email}`);
            console.log(`   Token expires: ${new Date(decoded.exp * 1000).toISOString()}`);
        } catch (error) {
            console.log('❌ JWT token test failed:', error.message);
        }

        // Cookie configuration test
        console.log('\n🍪 COOKIE CONFIGURATION TEST:');
        const mockReq = {
            secure: process.env.NODE_ENV === 'production',
            get: (header) => {
                if (header === 'Host') return process.env.COOKIE_DOMAIN || 'localhost:3000';
                if (header === 'X-Forwarded-Proto') return process.env.NODE_ENV === 'production' ? 'https' : 'http';
                return null;
            }
        };

        const cookieConfig = {
            httpOnly: true,
            secure: mockReq.secure || mockReq.get('X-Forwarded-Proto') === 'https',
            maxAge: 30 * 60 * 1000,
            sameSite: 'lax',
            path: '/verify-otp'
        };

        console.log('Cookie configuration that would be used:');
        console.log(JSON.stringify(cookieConfig, null, 2));

        // Recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        
        if (!process.env.JWT_SECRET) {
            console.log('❌ Set JWT_SECRET in environment variables');
        }
        
        if (process.env.NODE_ENV === 'production' && !cookieConfig.secure) {
            console.log('⚠️  Production environment should use secure cookies (HTTPS)');
        }
        
        if (otpRecords.length > 5) {
            console.log('⚠️  Many OTP records found - consider cleanup of expired records');
        }
        
        if (existingUser && !existingUser.isVerified) {
            console.log('⚠️  User exists but not verified - they may need to complete verification');
        }

        console.log('\n✅ Diagnostic complete!');

    } catch (error) {
        console.error('❌ Diagnostic failed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Database disconnected');
    }
}

// Command line usage
const email = process.argv[2];
if (!email) {
    console.log('Usage: node scripts/otpDiagnostic.js <email>');
    console.log('Example: node scripts/otpDiagnostic.js user@example.com');
    process.exit(1);
}

runDiagnostic(email).catch(console.error);
