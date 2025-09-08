// Global variables
let editMode = false;
let editOfferId = null;

// Validate form data
function validateOfferForm(data) {
    if (!data.targetType) {
        showError('Please select an offer type');
        return false;
    }

    if (data.targetType === 'product' && !data.targetProduct) {
        showError('Please select a product');
        return false;
    }

    if (data.targetType === 'category' && !data.targetCategory) {
        showError('Please select a category');
        return false;
    }

    if (!data.discountValue || data.discountValue <= 0 || data.discountValue > 99) {
        showError('Please enter a valid discount percentage between 1 and 99');
        return false;
    }

    if (!data.startDate || !data.endDate) {
        showError('Please select both start and end dates');
        return false;
    }

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (startDate < today) {
        showError('Start date cannot be in the past');
        return false;
    }

    if (endDate <= startDate) {
        showError('End date must be after start date');
        return false;
    }

    return true;
}

// Handle offer type change
function handleOfferTypeChange(event) {
    const type = event.target.value;
    const modal = event.target.closest('.modal');
    const isAddModal = modal && modal.id === 'addOfferModal';
    const prefix = isAddModal ? 'add' : 'edit';

    // Get the field elements
    // For add modal, the IDs are 'productDropdownAdd' and 'categoryDropdownAdd'
    // For edit modal, the IDs are 'editProductField' and 'editCategoryField'
    const productField = isAddModal 
        ? document.getElementById('productDropdownAdd')
        : document.getElementById(`${prefix}ProductField`);
        
    const categoryField = isAddModal 
        ? document.getElementById('categoryDropdownAdd')
        : document.getElementById(`${prefix}CategoryField`);
        
    const productSelect = document.getElementById(isAddModal ? 'targetProductAdd' : `${prefix}Product`);
    const categorySelect = document.getElementById(isAddModal ? 'targetCategoryAdd' : `${prefix}Category`);

    // Hide both fields first
    if (productField) productField.style.display = 'none';
    if (categoryField) categoryField.style.display = 'none';
    
    // Reset and disable both fields
    if (productSelect) {
        productSelect.value = '';
        productSelect.disabled = true;
        productSelect.required = false;
    }
    if (categorySelect) {
        categorySelect.value = '';
        categorySelect.disabled = true;
        categorySelect.required = false;
    }

    // Show and enable the relevant field based on type
    if (type === 'product' && productField && productSelect) {
        productField.style.display = 'block';
        productSelect.disabled = false;
        productSelect.required = true;
    } else if (type === 'category' && categoryField && categorySelect) {
        categoryField.style.display = 'block';
        categorySelect.disabled = false;
        categorySelect.required = true;
    }
}

// Prepare form data for submission
function prepareFormData(formData) {
    const type = formData.get('targetType');
    
    // Remove the field that's not being used based on type
    if (type === 'product') {
        formData.delete('targetCategory');
    } else if (type === 'category') {
        formData.delete('targetProduct');
    }

    // Convert to plain object
    const data = Object.fromEntries(formData.entries());

    // Ensure numeric fields are numbers
    if (data.discountValue) {
        data.discountValue = Number(data.discountValue);
    }
    if (data.minPurchase) {
        data.minPurchase = Number(data.minPurchase);
    }

    return data;
}

// Initialize date fields with minimum dates
function initializeDateFields() {
    const today = new Date().toISOString().split('T')[0];
    
    // Set min dates for both add and edit forms
    ['add', 'edit'].forEach(prefix => {
        const startDateInput = document.getElementById(`${prefix}StartDateInput`);
        const endDateInput = document.getElementById(`${prefix}EndDateInput`);
        
        if (startDateInput) {
            startDateInput.min = today;
            if (prefix === 'add') startDateInput.value = today;
        }
        
        if (endDateInput) {
            endDateInput.min = today;
            if (prefix === 'add') {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                endDateInput.value = tomorrow.toISOString().split('T')[0];
            }
        }
    });
}

// Edit offer
async function openEditModal(offerId) {
    try {
        const response = await fetch(`/admin/offers/${offerId}`, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            credentials: 'include' // This ensures cookies are sent with the request
        });
        
        // Check if redirected to login page
        if (response.redirected || response.url.includes('/admin/login')) {
            window.location.href = '/admin/login';
            return;
        }
        
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Failed to fetch offer details');
        }

        const offer = result.offer;
        editOfferId = offer._id;

        // Set offer type and trigger change event
        const typeSelect = document.getElementById('editType');
        if (typeSelect) {
            typeSelect.value = offer.type;
            handleOfferTypeChange({ target: typeSelect });
        }

        // Set product or category based on type
        if (offer.type === 'product' && offer.product) {
            const productSelect = document.getElementById('editProduct');
            if (productSelect) productSelect.value = offer.product._id;
        } else if (offer.type === 'category' && offer.category) {
            const categorySelect = document.getElementById('editCategory');
            if (categorySelect) categorySelect.value = offer.category._id;
        }

        // Set other fields
        document.getElementById('editOfferId').value = offer._id;
        document.getElementById('editDiscountValue').value = offer.discountValue;
        document.getElementById('editMinPurchase').value = offer.minPurchase || 0;
        document.getElementById('editStartDateInput').value = offer.startDate.split('T')[0];
        document.getElementById('editEndDateInput').value = offer.endDate.split('T')[0];
        document.getElementById('editDescription').value = offer.description || '';

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('editOfferModal'));
        modal.show();
    } catch (error) {
        showError(error.message || 'Failed to load offer details');
    }
}

// Save new offer
async function saveOffer(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    
    // Validate form
    if (!validateOfferForm(data)) return;

    try {
        // Get the target type from the form
        const targetType = document.querySelector('#addOfferModal select[name="targetType"]').value;
        data.targetType = targetType;
        
        // Set the target ID based on the selected type
        if (targetType === 'product') {
            data.targetId = data.targetProduct;
        } else if (targetType === 'category') {
            data.targetId = data.targetCategory;
        }
        
        
        const response = await fetch('/admin/offers', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data),
            credentials: 'include' // This ensures cookies are sent with the request
        });
        
        // Check if redirected to login page
        if (response.redirected || response.url.includes('/admin/login')) {
            window.location.href = '/admin/login';
            return;
        }

        const result = await response.json();

        if (!response.ok) {
            if (response.status === 400 && result.message.includes('already exists')) {
                throw new Error('A similar offer already exists. Please choose a different product or category.');
            }
            throw new Error(result.message || 'Failed to save offer');
        }

        Swal.fire({
            icon: 'success',
            title: 'Success!',
            text: 'Offer saved successfully',
            showConfirmButton: false,
            timer: 1500
        }).then(() => {
            form.reset();
            const modal = bootstrap.Modal.getInstance(document.getElementById('addOfferModal'));
            modal.hide();
            location.reload();
        });
    } catch (error) {
        showError(error.message || 'Failed to save offer');
    }
}

// Update offer
async function updateOffer(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const offerId = formData.get('offerId');
    formData.delete('offerId');
    let data = Object.fromEntries(formData.entries());

    // Get the target type and ID from the form
    const targetType = document.querySelector('#editOfferModal select[name="targetType"]').value;
    data.targetType = targetType;
    
    // Set the target ID based on the selected type
    if (targetType === 'product') {
        data.targetId = data.targetProduct;
    } else if (targetType === 'category') {
        data.targetId = data.targetCategory;
    }

    // Ensure date fields are properly formatted
    if (data.startDate) data.startDate = new Date(data.startDate).toISOString();
    if (data.endDate) data.endDate = new Date(data.endDate).toISOString();


    // Validate form
    if (!validateOfferForm(data)) return;

    try {
        const response = await fetch(`/admin/offers/${offerId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data),
            credentials: 'include' // This ensures cookies are sent with the request
        });
        
        // Check if redirected to login page
        if (response.redirected || response.url.includes('/admin/login')) {
            window.location.href = '/admin/login';
            return;
        }

        const result = await response.json();

        if (!response.ok) {
            if (response.status === 400 && result.message.includes('already exists')) {
                throw new Error('A similar offer already exists. Please choose a different product or category.');
            }
            throw new Error(result.message || 'Failed to update offer');
        }

        Swal.fire({
            icon: 'success',
            title: 'Success!',
            text: 'Offer updated successfully',
            showConfirmButton: false,
            timer: 1500
        }).then(() => {
            const modal = bootstrap.Modal.getInstance(document.getElementById('editOfferModal'));
            modal.hide();
            location.reload();
        });
    } catch (error) {
        showError(error.message || 'Failed to update offer');
    }
}

// Toggle target dropdown based on selection in add modal
function toggleTargetDropdown(prefix) {
    // Handle the add modal which has id 'offerTargetType' instead of 'addType'
    const typeSelect = document.getElementById(prefix === 'add' ? 'offerTargetType' : `${prefix}Type`);
    if (typeSelect) {
        handleOfferTypeChange({ target: typeSelect });
    }
    
    // Also update the target dropdown visibility based on the selected value
    const selectedValue = typeSelect ? typeSelect.value : '';
    
    // For add modal, the IDs are 'productDropdownAdd' and 'categoryDropdownAdd'
    // For edit modal, the IDs are 'editProductField' and 'editCategoryField'
    const productField = document.getElementById(prefix === 'add' ? 'productDropdownAdd' : prefix + 'ProductField');
    const categoryField = document.getElementById(prefix === 'add' ? 'categoryDropdownAdd' : prefix + 'CategoryField');
    
    if (productField) productField.style.display = selectedValue === 'product' ? 'block' : 'none';
    if (categoryField) categoryField.style.display = selectedValue === 'category' ? 'block' : 'none';
}

// Initialize form
function initializeForm() {
    // Add offer type change listeners for both modals
    ['add', 'edit'].forEach(prefix => {
        const typeSelect = document.getElementById(`${prefix}Type`);
        if (typeSelect) {
            typeSelect.addEventListener('change', handleOfferTypeChange);
        }
    });

    // Initialize date fields
    initializeDateFields();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeForm();

    // Add modal show event listener for add modal
    const addModal = document.getElementById('addOfferModal');
    if (addModal) {
        addModal.addEventListener('shown.bs.modal', function() {
            // Use the correct ID for the add modal's target type select
            const typeSelect = document.getElementById('offerTargetType');
            if (typeSelect) {
                typeSelect.value = '';
                // Hide both dropdowns by default
                const productField = document.getElementById('productDropdownAdd');
                const categoryField = document.getElementById('categoryDropdownAdd');
                if (productField) productField.style.display = 'none';
                if (categoryField) categoryField.style.display = 'none';
            }
            initializeDateFields();
        });
    }
});

// Toggle offer status
async function toggleOfferStatus(offerId, currentStatus) {
    try {
        // Convert string 'true'/'false' to boolean if needed
        const isActive = typeof currentStatus === 'string' ? currentStatus === 'true' : currentStatus;
        
        // Send the current status so the server knows what to change it to
        const response = await fetch(`/admin/offers/${offerId}/toggle`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ isActive: !isActive }),
            credentials: 'include' // This ensures cookies are sent with the request
        });
        
        // Check if redirected to login page
        if (response.redirected || response.url.includes('/admin/login')) {
            window.location.href = '/admin/login';
            return;
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Failed to toggle offer status');
        }

        Swal.fire({
            icon: 'success',
            title: 'Success!',
            text: 'Offer status updated successfully',
            showConfirmButton: false,
            timer: 1500
        }).then(() => {
            // Reload the page after successful toggle
            window.location.reload();
        });
    } catch (error) {
        showError(error.message || 'Failed to toggle offer status');
    }
}

// Load active products
async function loadProducts() {
    try {
        const response = await fetch('/admin/offers/active-products');
        const data = await response.json();

        if (!data.success) {
            showError(data.message || 'Failed to load products');
            return;
        }

        const productSelect = document.getElementById('productSelect');
        if (!productSelect) return;

        products = data.products;
        
        // Clear existing options
        productSelect.innerHTML = '<option value="">Select Product</option>';
        
        // Add new options
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product._id;
            option.textContent = `${product.name} (₹${product.price})`;
            productSelect.appendChild(option);
        });
    } catch (error) {
        showError('Failed to load products: ' + error.message);
    }
}

// Load active categories
async function loadCategories() {
    try {
        const response = await fetch('/admin/offers/active-categories');
        const data = await response.json();

        if (!data.success) {
            showError(data.message || 'Failed to load categories');
            return;
        }

        const categorySelect = document.getElementById('categorySelect');
        if (!categorySelect) return;

        categories = data.categories;
        
        // Clear existing options
        categorySelect.innerHTML = '<option value="">Select Category</option>';
        
        // Add new options
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category._id;
            option.textContent = category.name;
            categorySelect.appendChild(option);
        });
    } catch (error) {
        showError('Failed to load categories: ' + error.message);
    }
}

// Show error message
function showError(message) {
    Swal.fire({
        icon: 'error',
        title: 'Error!',
        text: message
    });
}