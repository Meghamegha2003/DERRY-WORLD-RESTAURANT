const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { Schema } = mongoose;

const userSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: function () {
            return !this.isGoogleUser;
        },
        minlength: [6, 'Password must be at least 6 characters long'],
    },
    isGoogleUser: {
        type: Boolean,
        default: false,
    },
    googleId: {
        type: String,
        required: function () {
            return this.isGoogleUser;
        },
    },
    picture: {
        type: String,
        default: null,
    },
    otp: {
        type: String,
        default: null,
    },
    otpExpiry: {
        type: Date,
        default: null,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    phone: {
        type: String,
        required: function () {
            return !this.isGoogleUser;
        },
        validate: {
            validator: function (v) {
                return this.isGoogleUser || /^\d{10}$/.test(v);
            },
            message: (props) => `${props.value} is not a valid phone number!`,
        },
    },    
    address: {
        type: String,
        trim: true,
        default: null,
    },
    status: {
        type: String,
        enum: ['Active', 'Blocked'],
        default: 'Active',
    },
    roles: {
        type: [String],
        default: ['user'],
    },
    isAdmin: {
        type: Boolean,
        default: false,
    },
    createdOn: {
        type: Date,
        default: Date.now,
    },
    updatedOn: {
        type: Date,
        default: Date.now,
    },
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    try {
        if (this.isModified('password')) {
            console.log('Hashing password for user:', this.email);
            const salt = await bcrypt.genSalt(10);
            this.password = await bcrypt.hash(this.password, salt);
            console.log('Password hashed successfully');
        }
        next();
    } catch (error) {
        console.error('Error hashing password:', error);
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        console.log('Comparing passwords for user:', this.email);
        console.log('Stored hashed password:', this.password);
        console.log('Candidate password length:', candidatePassword.length);
        
        const isMatch = await bcrypt.compare(candidatePassword, this.password);
        console.log('Password match result:', isMatch);
        return isMatch;
    } catch (error) {
        console.error('Error comparing passwords:', error);
        throw error;
    }
};

userSchema.pre('save', function (next) {
    if (!this.isNew) {
        this.updatedOn = Date.now();
    }
    next();
});

userSchema.methods.hasRole = function (role) {
    return this.roles.includes(role);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
