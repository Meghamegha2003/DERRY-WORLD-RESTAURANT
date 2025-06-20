const mongoose = require('mongoose');
const User = require('../models/userSchema');
require('dotenv').config();

async function checkAdminUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const adminUsers = await User.find({ roles: 'admin' });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkAdminUsers();
