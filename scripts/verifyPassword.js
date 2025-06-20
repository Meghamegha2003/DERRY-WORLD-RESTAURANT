const mongoose = require('mongoose');
const User = require('../models/userSchema');
require('dotenv').config();

async function verifyPassword() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
\
        // Find any user
        const user = await User.findOne();
        if (!user) {
            return;
        }

     

        // Test password comparison with a known password
        const testPasswords = ['Test@123', 'Megha@2003', 'Password@123'];
        for (const pass of testPasswords) {
            const isMatch = await user.comparePassword(pass);
\        }

    } catch (error) {
        throw error
    } finally {
        await mongoose.disconnect();
    }
}

verifyPassword();
