const User = require('../../models/userSchema');

// Validate address fields
const validateAddress = (address) => {
    const requiredFields = ['fullName', 'phone', 'addressLine1', 'city', 'state', 'pincode'];
    const errors = [];

    // Check required fields
    for (const field of requiredFields) {
        if (!address[field] || address[field].trim() === '') {
            errors.push(`${field} is required`);
        }
    }

    // Validate phone number (10 digits)
    if (address.phone && !/^\d{10}$/.test(address.phone)) {
        errors.push('Phone number must be 10 digits');
    }
n 
    // Validate pincode (6 digits)
    if (address.pincode && !/^\d{6}$/.test(address.pincode)) {
        errors.push('PIN code must be 6 digits');
    }

    return errors;
};

// Check for duplicate address
const isDuplicateAddress = (addresses, newAddress, excludeId = null) => {
    return addresses.some(addr => {
        if (excludeId && addr._id.toString() === excludeId) {
            return false;
        }
        
        // Normalize strings for comparison
        const normalizeString = (str) => str.toLowerCase().trim().replace(/\s+/g, ' ');
        
        // Compare only if the address is exactly the same
        const isSameAddress = 
            normalizeString(addr.addressLine1) === normalizeString(newAddress.addressLine1) &&
            normalizeString(addr.city) === normalizeString(newAddress.city) &&
            normalizeString(addr.state) === normalizeString(newAddress.state) &&
            addr.pincode === newAddress.pincode &&
            normalizeString(addr.fullName) === normalizeString(newAddress.fullName) &&
            addr.phone === newAddress.phone;
            
        return isSameAddress;
    });
};

// Get all addresses
const getUserAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        res.render('user/addresses', { 
            addresses: user.addresses || [],
            user: user
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Add new address
const addUserAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const newAddress = req.body;
        
        // Validate address fields
        const validationErrors = validateAddress(newAddress);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Check for duplicate address
        if (isDuplicateAddress(user.addresses, newAddress)) {
            return res.status(400).json({
                success: false,
                message: 'This address already exists'
            });
        }

        user.addresses.push(newAddress);
        await user.save();

        res.json({ 
            success: true, 
            message: 'Address added successfully',
            address: newAddress
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add address'
        });
    }
};

// Update address
const updateUserAddress = async (req, res) => {
    try {
        const addressId = req.params.addressId;
        const updatedAddress = req.body;

        if (!addressId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Address ID is required' 
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Validate address fields
        const validationErrors = validateAddress(updatedAddress);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Check for duplicate address (excluding current address)
        if (isDuplicateAddress(user.addresses, updatedAddress, addressId)) {
            return res.status(400).json({
                success: false,
                message: 'This address already exists'
            });
        }

        // Find address index
        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Address not found' 
            });
        }

        // Update address
        user.addresses[addressIndex] = {
            ...user.addresses[addressIndex].toObject(),
            ...updatedAddress,
            _id: user.addresses[addressIndex]._id // Preserve the original _id
        };
        
        await user.save();

        res.json({ 
            success: true, 
            message: 'Address updated successfully',
            address: user.addresses[addressIndex]
        });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to update address'
        });
    }
};

// Delete address
const deleteUserAddress = async (req, res) => {
    try {
        const addressId = req.params.addressId;
        
        if (!addressId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Address ID is required' 
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Find address index
        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Address not found' 
            });
        }

        // If deleting default address, make another address default if exists
        if (user.addresses[addressIndex].isDefault && user.addresses.length > 1) {
            const newDefaultIndex = addressIndex === 0 ? 1 : 0;
            user.addresses[newDefaultIndex].isDefault = true;
        }

        // Remove address
        user.addresses.splice(addressIndex, 1);
        await user.save();

        res.json({ 
            success: true, 
            message: 'Address deleted successfully',
            addresses: user.addresses
        });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to delete address'
        });
    }
};

// Get single address
const getSingleAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        if (!addressId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Address ID is required' 
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const address = user.addresses.find(addr => addr._id.toString() === addressId);
        if (!address) {
            return res.status(404).json({ 
                success: false, 
                message: 'Address not found' 
            });
        }

        res.json({ 
            success: true, 
            address
        });
    } catch (error) {
        console.error('Error getting address:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get address details'
        });
    }
};

// Get address by ID
const getAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        res.json({
            success: true,
            address
        });
    } catch (error) {
        console.error('Error fetching address:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Update address by ID
const updateAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user._id;
        const updateData = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Validate the updated address
        const validationErrors = validateAddress(updateData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Check for duplicates excluding current address
        if (isDuplicateAddress(user.addresses, updateData, addressId)) {
            return res.status(400).json({
                success: false,
                message: 'This address already exists'
            });
        }

        // Update address fields
        Object.assign(address, updateData);

        await user.save();

        res.json({
            success: true,
            message: 'Address updated successfully',
            address
        });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Delete address by ID
const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Remove the address
        address.remove();
        await user.save();

        res.json({
            success: true,
            message: 'Address deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    getUserAddresses,
    addUserAddress,
    updateUserAddress,
    deleteUserAddress,
    getAddress,
    updateAddress,
    deleteAddress
};