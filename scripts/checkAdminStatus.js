require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/userSchema');

async function checkAdminStatus() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const adminUsers = await User.find({
            $or: [
                { isAdmin: true },
                { roles: 'admin' }
            ]
        });

        console.log('\nAdmin Users Found:', adminUsers.length);
        adminUsers.forEach(admin => {
            console.log('\nAdmin Details:');
            console.log('Name:', admin.name);
            console.log('Email:', admin.email);
            console.log('Is Active:', admin.isActive);
            console.log('Is Admin:', admin.isAdmin);
            console.log('Roles:', admin.roles);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkAdminStatus();