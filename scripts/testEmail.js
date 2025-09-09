require('dotenv').config();
const { sendOtpEmail } = require('../utils/sendOtpEmail');

async function testEmail() {
    console.log('🔍 TESTING EMAIL SERVICE');
    console.log('========================');
    
    const testEmail = process.argv[2];
    if (!testEmail) {
        console.log('Usage: node scripts/testEmail.js <email>');
        console.log('Example: node scripts/testEmail.js test@example.com');
        process.exit(1);
    }
    
    console.log(`Testing email to: ${testEmail}`);
    console.log(`EMAIL_USER: ${process.env.EMAIL_USER || 'NOT SET'}`);
    console.log(`EMAIL_PASS: ${process.env.EMAIL_PASS ? 'SET' : 'NOT SET'}`);
    
    try {
        console.log('\nSending test OTP email...');
        const result = await sendOtpEmail(testEmail, '123456');
        console.log('✅ Email sent successfully!');
        console.log('Message ID:', result.messageId);
    } catch (error) {
        console.error('❌ Email sending failed:', error.message);
        console.error('Full error:', error);
    }
}

testEmail().catch(console.error);
