
function extractAddress(address) {
    if (!address) {
        throw new Error('Address is required');
    }

    const addressObj = address._doc ? address._doc : address;
    
    const { 
        fullName: name,
        phone,
        addressLine1: addressLine,
        addressLine2: addressLine2,
        city,
        state,
        pincode,
        addressType: type = 'Home',
        isDefault = false
    } = addressObj;

    const requiredFields = { 
        name: name, 
        phone, 
        addressLine, 
        city, 
        state, 
        pincode 
    };
    const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

    if (missingFields.length > 0) {
        throw new Error(`Missing required address fields: ${missingFields.join(', ')}`);
    }

    return {
        name,
        phone,
        address: addressLine,
        address2: addressLine2 || '',
        city,
        state,
        pincode,
        type: type || 'Home',
        isDefault
    };
}


function formatAddress(address) {
    if (!address) return '';
    
    const { name, address: addressLine, locality, city, state, pincode } = address;
    return `${name}\n${addressLine}\n${locality}\n${city}, ${state} - ${pincode}`;
}


function validateAddress(address) {
    if (!address) {
        return { isValid: false, error: 'Address is required' };
    }

    const requiredFields = ['name', 'phone', 'address', 'locality', 'city', 'state', 'pincode'];
    const missingFields = requiredFields.filter(field => !address[field]);

    if (missingFields.length > 0) {
        return { 
            isValid: false, 
            error: `Missing required fields: ${missingFields.join(', ')}` 
        };
    }

    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(address.phone)) {
        return { 
            isValid: false, 
            error: 'Invalid phone number. Must be 10 digits.' 
        };
    }

    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(address.pincode)) {
        return { 
            isValid: false, 
            error: 'Invalid pincode. Must be 6 digits.' 
        };
    }

    return { isValid: true };
}

module.exports = {
    extractAddress,
    formatAddress,
    validateAddress
};
