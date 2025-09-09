require('dotenv').config();

console.log('🔍 PRODUCTION ENVIRONMENT CHECK');
console.log('================================');

const requiredVars = [
    'NODE_ENV',
    'JWT_SECRET', 
    'MONGODB_URI',
    'EMAIL_USER',
    'EMAIL_PASS',
    'PORT'
];

const optionalVars = [
    'COOKIE_DOMAIN',
    'CSRF_SECRET'
];

console.log('\n📋 REQUIRED VARIABLES:');
let missingRequired = [];
requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✅ ${varName}: ${varName.includes('SECRET') || varName.includes('PASS') ? 'SET' : value}`);
    } else {
        console.log(`❌ ${varName}: MISSING`);
        missingRequired.push(varName);
    }
});

console.log('\n📋 OPTIONAL VARIABLES:');
optionalVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`${value ? '✅' : '⚠️ '} ${varName}: ${value || 'NOT SET'}`);
});

console.log('\n🔧 CONFIGURATION CHECK:');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`Production mode: ${process.env.NODE_ENV === 'production' ? 'YES' : 'NO'}`);
console.log(`JWT Secret length: ${process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0} characters`);

if (missingRequired.length > 0) {
    console.log('\n❌ CRITICAL ISSUES FOUND:');
    console.log(`Missing required variables: ${missingRequired.join(', ')}`);
    console.log('\nPlease set these environment variables in your production .env file');
} else {
    console.log('\n✅ All required environment variables are set!');
}

console.log('\n💡 RECOMMENDATIONS:');
if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️  Set NODE_ENV=production for production deployment');
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.log('⚠️  JWT_SECRET should be at least 32 characters long');
}
if (process.env.NODE_ENV === 'production' && !process.env.COOKIE_DOMAIN) {
    console.log('⚠️  Consider setting COOKIE_DOMAIN for production');
}
