const validateAddress = (address) => {
    const errors = [];
    
    const requiredFields = ['name', 'phone', 'street', 'city', 'state', 'pincode'];
    requiredFields.forEach(field => {
        if (!address[field] || !address[field].trim()) {
            errors.push(`${field.charAt(0).toUpperCase() + field.slice(1)} is required`);
        }
    });

    if (errors.length > 0) return errors;

    if (!/^[A-Za-z\s]{2,50}$/.test(address.name.trim())) {
        errors.push('Name should be 2-50 characters (letters and spaces only)');
    }

    if (!/^[0-9]{10}$/.test(address.phone.replace(/\D/g, ''))) {
        errors.push('Phone number must be exactly 10 digits');
    }

    const streetLength = address.street.trim().length;
    if (streetLength < 5 || streetLength > 100) {
        errors.push('Street address must be between 5 and 100 characters');
    }

    if (!/^[A-Za-z\s]{2,50}$/.test(address.city.trim())) {
        errors.push('City must be 2-50 characters (letters and spaces only)');
    }

    if (!/^[A-Za-z\s]{2,50}$/.test(address.state.trim())) {
        errors.push('State must be 2-50 characters (letters and spaces only)');
    }

    if (!/^[0-9]{6}$/.test(address.pincode.replace(/\D/g, ''))) {
        errors.push('PIN code must be exactly 6 digits');
    }

    return errors;
};

module.exports = {
    validateAddress
};