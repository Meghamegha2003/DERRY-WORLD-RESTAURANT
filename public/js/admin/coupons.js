// Admin coupons JS loaded
console.log('admin coupons.js loaded');

// Stub for coupon code uniqueness check
async function checkCouponCodeExists(code, excludeId = null) {
    if (!code) return false;
    try {
        let url = `/admin/coupons/check-code?code=${encodeURIComponent(code)}`;
        if (excludeId) {
            url += `&excludeId=${excludeId}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        return !!data.exists;
    } catch (err) {
        return false;
    }
}

// Add simple validation to coupon code field
document.addEventListener('DOMContentLoaded', () => {
    const codeInputs = document.querySelectorAll('input[name="code"]');
    codeInputs.forEach(input => {
        input.addEventListener('input', function() {
            // Remove special characters except letters, numbers, and spaces
            this.value = this.value.replace(/[^A-Za-z0-9\s]/g, '');
        });
        
        input.addEventListener('blur', async function() {
            const code = this.value.trim();
            if (!code) return;
            
            // Check for duplicates
            const form = this.closest('form');
            const couponIdField = form.querySelector('input[name="couponId"]');
            const isEditForm = couponIdField && couponIdField.value;
            const excludeId = isEditForm ? couponIdField.value : null;
            
            const exists = await checkCouponCodeExists(code, excludeId);
            if (exists) {
                Swal.fire({
                    icon: 'error',
                    title: 'Duplicate Coupon Code',
                    text: 'This coupon code already exists. Please use a different code.'
                });
                this.focus();
            }
        });
    });
});

// Function to open create coupon modal
function openCreateCouponModal() {
    document.getElementById('couponModalLabel').textContent = 'Create New Coupon';
    document.getElementById('couponForm').reset();
    document.getElementById('couponId').value = '';
    
    // Set minimum dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').min = today;
    document.getElementById('expiryDate').min = today;
    
    const modal = new bootstrap.Modal(document.getElementById('couponModal'));
    modal.show();
}

// Function to edit coupon
async function editCoupon(couponId) {
    try {
        const response = await fetch(`/admin/coupons/${couponId}`);
        const result = await response.json();

        if (response.ok && result.success) {
            const coupon = result.coupon;
            // Set form values
            const form = document.getElementById('editCouponForm');
            const fields = {
                'couponId': coupon._id,
                'code': coupon.code,
                'description': coupon.description || '',
                'discountType': coupon.discountType,
                'discountValue': coupon.discountValue,
                'minPurchase': coupon.minPurchase || 0,
                'maxDiscount': coupon.maxDiscount || '',
                'validFrom': coupon.validFrom.split('T')[0],
                'validUntil': coupon.validUntil.split('T')[0],
                'usageLimit': coupon.usageLimit || ''
            };

            // Set each field value, with error handling
            Object.entries(fields).forEach(([id, value]) => {
                const element = form.querySelector(`[name="${id}"]`);
                if (element) {
                    element.value = value;
                    // Store original code for duplicate validation
                    if (id === 'code') {
                        element.setAttribute('data-original-code', value);
                    }
                } else {
                    console.warn(`Field not found: ${id}`);
                }
            });

            const modal = new bootstrap.Modal(document.getElementById('editCouponModal'));
            modal.show();
        } else {
            throw new Error(result.message || 'Failed to fetch coupon details');
        }
    } catch (error) {
        console.error('Error editing coupon:', error);
        Swal.fire({
            title: 'Error!',
            text: error.message || 'Failed to fetch coupon details',
            icon: 'error'
        });
    }
}

// Function to validate coupon form data
function validateCouponForm(data) {
    const discountValue = Number(data.discountValue);
    const minPurchase = Number(data.minPurchase);
    
    // Check if discount value is greater than minimum purchase amount
    if (discountValue > minPurchase) {
        Swal.fire({
            title: 'Validation Error',
            text: 'Discount value cannot be greater than the minimum purchase amount',
            icon: 'error'
        });
        return false;
    }
    
    // For percentage discounts, ensure value is between 1-100
    if (data.discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
        Swal.fire({
            title: 'Validation Error',
            text: 'Percentage discount must be between 1% and 100%',
            icon: 'error'
        });
        return false;
    }
    
    return true;
}

// Function to save coupon
async function saveCoupon(event) {
    event.preventDefault();
    
    try {
        const form = event.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Validate form data before submission
        if (!validateCouponForm(data)) {
            return; // Stop if validation fails
        }
        
        const couponId = document.getElementById('couponId').value;

        const url = couponId ? `/admin/coupons/${couponId}` : '/admin/coupons';
        const method = couponId ? 'PUT' : 'POST';

        // Convert form data to match schema field names
        const requestData = {
            code: data.code.trim(),
            description: data.description || '',
            discountType: data.discountType,
            discountValue: Number(data.discountValue),
            minPurchase: Number(data.minPurchase),
            maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : undefined,
            validFrom: data.validFrom,
            validUntil: data.validUntil,
            usageLimit: Number(data.usageLimit)
        };

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (response.ok) {
            Swal.fire({
                title: 'Success!',
                text: result.message,
                icon: 'success'
            }).then(() => {
                location.reload();
            });
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        Swal.fire({
            title: 'Error!',
            text: error.message,
            icon: 'error'
        });
    }
}

// Function to toggle coupon status
async function toggleCouponStatus(couponId, isActive) {
    try {
        const response = await fetch(`/admin/coupons/${couponId}/toggle`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isActive })
        });

        const result = await response.json();

        if (response.ok) {
            Swal.fire({
                title: 'Success!',
                text: result.message,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        Swal.fire({
            title: 'Error!',
            text: error.message,
            icon: 'error'
        }).then(() => {
            location.reload();
        });
    }
}

// Function to delete coupon
async function deleteCoupon(couponId) {
    try {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            const response = await fetch(`/admin/coupons/${couponId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (response.ok) {
                Swal.fire({
                    title: 'Deleted!',
                    text: data.message,
                    icon: 'success'
                }).then(() => {
                    location.reload();
                });
            } else {
                throw new Error(data.message);
            }
        }
    } catch (error) {
        Swal.fire({
            title: 'Error!',
            text: error.message,
            icon: 'error'
        });
    }
}

// Event listener for discount type change in both add and edit forms
function setupDiscountTypeListener(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const discountTypeField = form.querySelector('[name="discountType"]');
    if (!discountTypeField) return;

    discountTypeField.addEventListener('change', function() {
        const discountValueField = form.querySelector('[name="discountValue"]');
        const maxDiscountField = form.querySelector('[name="maxDiscount"]');
        
        if (!discountValueField || !maxDiscountField) return;

        if (this.value === 'percentage') {
            discountValueField.max = '100';
            maxDiscountField.disabled = false;
        } else {
            discountValueField.removeAttribute('max');
            maxDiscountField.disabled = true;
            maxDiscountField.value = '';
        }
    });
}

// Add validation for discount value vs min purchase
function setupDiscountValidation(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    
    const discountValueInput = form.querySelector('input[name="discountValue"]');
    const minPurchaseInput = form.querySelector('input[name="minPurchase"]');
    const discountTypeSelect = form.querySelector('select[name="discountType"]');
    
    if (!discountValueInput || !minPurchaseInput || !discountTypeSelect) return;
    
    function validateDiscount() {
        const discountValue = parseFloat(discountValueInput.value) || 0;
        const minPurchase = parseFloat(minPurchaseInput.value) || 0;
        const isPercentage = discountTypeSelect.value === 'percentage';
        
        if (isPercentage && (discountValue < 1 || discountValue > 100)) {
            discountValueInput.setCustomValidity('Percentage must be between 1 and 100');
            return false;
        }
        
        if (!isPercentage && discountValue > minPurchase) {
            discountValueInput.setCustomValidity('Discount amount cannot be greater than minimum purchase amount');
            return false;
        }
        
        discountValueInput.setCustomValidity('');
        return true;
    }
    
    // Add event listeners for real-time validation
    discountValueInput.addEventListener('input', validateDiscount);
    minPurchaseInput.addEventListener('input', validateDiscount);
    discountTypeSelect.addEventListener('change', validateDiscount);
    
    // Add form validation
    form.addEventListener('submit', function(event) {
        if (!validateDiscount()) {
            event.preventDefault();
            event.stopPropagation();
        }
        form.classList.add('was-validated');
    }, false);
}

// Setup listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setupDiscountTypeListener('addCouponForm');
    setupDiscountTypeListener('editCouponForm');
    setupDiscountValidation('addCouponForm');
    setupDiscountValidation('editCouponForm');
});