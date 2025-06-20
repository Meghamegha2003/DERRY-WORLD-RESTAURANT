const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

const wishlistSchema = new Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    addedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const addressSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    addressLine1: {
        type: String,
        required: true
    },
    addressLine2: String,
    city: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    pincode: {
        type: String,
        required: true
    },
    addressType: {
        type: String,
        required: true,
        enum: ['Home', 'Work', 'Other']
    },
    isDefault: {
        type: Boolean,
        default: false
    }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters long'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    phone: {
        type: String,
        required: false,
        validate: {
            validator: function(v) {
                if (!v && this.googleId) return true;
                return !v || /^\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid phone number! Please enter a 10-digit number.`
        }
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(v);
            },
            message: props => `${props.value} is not a valid email!`
        }
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long'],
        validate: {
            validator: function(v) {
                if (this.googleId) return true; // Skip validation for Google users
                if (!this.isModified('password')) return true;
                
                // Password requirements
                const hasUpper = /[A-Z]/.test(v);
                const hasLower = /[a-z]/.test(v);
                const hasNumber = /\d/.test(v);
                const hasSpecial = /[!@#$%^&*]/.test(v);
                
                return hasUpper && hasLower && hasNumber && hasSpecial;
            },
            message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: String,
    verificationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    googleId: String,
    referralCode: {
        type: String,
        unique: true,
        sparse: true
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    referralCount: {
        type: Number,
        default: 0
    },
    referralEarnings: {
        type: Number,
        default: 0
    },
    wallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
        default: null
    },
    roles: {
        type: [String],
        default: ['user'],
        validate: {
            validator: function(roles) {
                return roles.every(role => ['user', 'admin'].includes(role));
            },
            message: 'Invalid role specified'
        }
    },
    addresses: {
        type: [addressSchema],
        validate: [
            {
                validator: function(addresses) {
                    return addresses.length <= 3;
                },
                message: 'You can only add up to 3 addresses'
            }
        ]
    },
    wishlist: {
        type: [wishlistSchema],
        default: [],
        validate: [
            {
                validator: function(wishlist) {
                    if (!Array.isArray(wishlist)) return true;
                    const productIds = wishlist
                        .filter(item => item && item.product)
                        .map(item => item.product.toString());
                    return productIds.length === new Set(productIds).size;
                },
                message: 'Duplicate product in wishlist'
            }
        ]
    }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
    try {
        if (!this.isModified('password')) return next();
        
        // Generate salt
        const salt = await bcrypt.genSalt(10);
        
        // Hash password
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Method to check if user has a specific role
userSchema.methods.hasRole = function(role) {
    return this.roles.includes(role);
};

const User = mongoose.model('User', userSchema);
module.exports = User;