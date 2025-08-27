const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer)
        toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
});


window.addToCart = function(productId, quantity = 1) {
    const appliedCoupon = document.querySelector('.applied-coupon');
    if (appliedCoupon) {
        const couponCode = appliedCoupon.getAttribute('data-coupon-code');
        appliedCoupon.remove();
        document.querySelector('.coupon-section').style.display = 'block';
        localStorage.removeItem('appliedCoupon');
        fetch('/cart/remove-coupon', {
            method: 'POST',
            credentials: 'same-origin'
        }).catch(console.error);
    }
    fetch(`/cart/add/${productId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ quantity }),
        credentials: 'same-origin'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(response => {
        if (response.success) {
            Toast.fire({
                icon: 'success',
                title: 'Item added to cart'
            });
            updateCartCount(response.cartCount);
            if (window.location.pathname === '/cart') {
                window.location.reload();
            }
        }
    })
    .catch(error => {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to add item to cart',
            confirmButtonColor: '#d33'
        });
    });
}

window.removeFromCart = function(productId) {
    Swal.fire({
        title: 'Remove Item?',
        text: 'Are you sure you want to remove this item from cart?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, remove it!'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch(`/cart/remove/${productId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin'
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => Promise.reject(err));
                }
                return response.json();
            })
            .then(response => {
                if (response.success) {
                    const itemElement = document.getElementById(`cart-item-${productId}`);
                    if (itemElement) {
                        // Add fade out animation
                        itemElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        itemElement.style.opacity = '0';
                        itemElement.style.transform = 'translateX(-20px)';
                        
                        setTimeout(() => {
                            itemElement.remove();
                            
                            // Check if cart is empty and redirect or show empty state
                            if (response.cartEmpty) {
                                // Show success message and redirect to empty cart state
                                Swal.fire({
                                    icon: 'success',
                                    title: 'Item Removed!',
                                    text: 'Item has been removed from your cart',
                                    showConfirmButton: false,
                                    timer: 1500
                                }).then(() => {
                                    window.location.reload();
                                });
                            } else {
                                // Update cart totals and show success message
                                updateCartTotals(response);
                                Swal.fire({
                                    icon: 'success',
                                    title: 'Item Removed!',
                                    text: 'Item has been removed from your cart',
                                    showConfirmButton: false,
                                    timer: 1200
                                });
                            }
                        }, 300);
                    }
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: response.error || 'Failed to remove item from cart',
                        confirmButtonColor: '#d33'
                    });
                }
            })
            .catch(error => {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: error.message || 'Failed to remove item from cart',
                    confirmButtonColor: '#d33'
                });
            });
        }
    });
};

window.updateQuantityInline = async function(productId, action, currentQuantity) {
    console.log('updateQuantityInline called:', { productId, action, currentQuantity });
    
    // Validate action and quantity limits
    if (action === 'increase' && currentQuantity >= 5) {
        Swal.fire({
            icon: 'warning',
            title: 'Maximum Limit',
            text: 'Maximum quantity limit is 5'
        });
        return;
    }
    
    if (action === 'decrease' && currentQuantity <= 1) {
        Swal.fire({
            icon: 'warning',
            title: 'Minimum Limit',
            text: 'Minimum quantity is 1. Use remove to delete item.'
        });
        return;
    }
    
    const endpoint = action === 'increase' 
        ? `/cart/increment/${productId}` 
        : `/cart/decrement/${productId}`;
        
    console.log('Making request to:', endpoint);
        
    try {
        // Show loading state
        const quantityInput = document.querySelector(`[data-product-id="${productId}"] .quantity-input`);
        const originalValue = quantityInput ? quantityInput.value : currentQuantity;
        
        if (quantityInput) {
            quantityInput.style.opacity = '0.6';
        }
        
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errData = await response.json();
            console.error('API Error:', errData);
            throw new Error(errData.message || 'Failed to update cart');
        }
        
        const data = await response.json();
        console.log('API Response:', data);
        
        if (data.success) {
            // Update quantity display
            if (quantityInput) {
                quantityInput.value = data.newQuantity;
                quantityInput.style.opacity = '1';
            }
            
            // Update quantity control buttons visibility
            updateQuantityControls(productId, data.newQuantity);
            
            // Update cart totals
            if (data.cart) {
                updateCartTotals(data.cart);
            }
            
            // Show success toast
            Toast.fire({
                icon: 'success',
                title: 'Quantity updated'
            });
        } else {
            throw new Error(data.message || 'Failed to update quantity');
        }
    } catch (error) {
        console.error('Update quantity error:', error);
        
        // Restore original value on error
        const quantityInput = document.querySelector(`[data-product-id="${productId}"] .quantity-input`);
        if (quantityInput) {
            quantityInput.value = originalValue;
            quantityInput.style.opacity = '1';
        }
        
        Swal.fire({
            icon: 'error',
            title: 'Update Failed',
            text: error.message || 'Failed to update quantity'
        });
    }
};

function updateQuantityControls(productId, newQuantity) {
    const quantityContainer = document.querySelector(`[data-product-id="${productId}"] .quantity-controls`);
    if (!quantityContainer) return;
    
    const decreaseBtn = quantityContainer.querySelector('.decrease-btn');
    const increaseBtn = quantityContainer.querySelector('.increase-btn');
    
    // Handle decrease button visibility
    if (newQuantity <= 1) {
        if (decreaseBtn) {
            decreaseBtn.style.display = 'none';
        }
    } else {
        if (decreaseBtn) {
            decreaseBtn.style.display = 'flex';
            decreaseBtn.setAttribute('data-current-quantity', newQuantity);
        } else {
            // Create decrease button if it doesn't exist
            const newDecreaseBtn = document.createElement('button');
            newDecreaseBtn.className = 'quantity-btn decrease-btn';
            newDecreaseBtn.setAttribute('data-product-id', productId);
            newDecreaseBtn.setAttribute('data-action', 'decrease');
            newDecreaseBtn.setAttribute('data-current-quantity', newQuantity);
            newDecreaseBtn.innerHTML = '<i class="fas fa-minus"></i>';
            quantityContainer.insertBefore(newDecreaseBtn, quantityContainer.firstChild);
        }
    }
    
    // Handle increase button visibility
    if (newQuantity >= 5) {
        if (increaseBtn) {
            increaseBtn.style.display = 'none';
        }
    } else {
        if (increaseBtn) {
            increaseBtn.style.display = 'flex';
            increaseBtn.setAttribute('data-current-quantity', newQuantity);
        } else {
            // Create increase button if it doesn't exist
            const newIncreaseBtn = document.createElement('button');
            newIncreaseBtn.className = 'quantity-btn increase-btn';
            newIncreaseBtn.setAttribute('data-product-id', productId);
            newIncreaseBtn.setAttribute('data-action', 'increase');
            newIncreaseBtn.setAttribute('data-current-quantity', newQuantity);
            newIncreaseBtn.innerHTML = '<i class="fas fa-plus"></i>';
            quantityContainer.appendChild(newIncreaseBtn);
        }
    }
}

function updateCartTotals(response) {
    const subtotalElement = document.getElementById('subtotal');
    const totalElement = document.getElementById('total');
    const deliveryChargeElement = document.getElementById('delivery-charge');
    const couponSection = document.querySelector('.coupon-section');
    const appliedCouponEl = document.querySelector('.applied-coupon');
    
    // Update subtotal
    if (subtotalElement && response.subtotal !== undefined) {
        subtotalElement.textContent = `₹${response.subtotal.toFixed(2)}`;
    }

    // Update delivery charge
    if (deliveryChargeElement) {
        deliveryChargeElement.textContent = 'FREE';
        deliveryChargeElement.classList.add('text-success');
        const oldMessage = document.querySelector('.delivery-message');
        if (oldMessage) {
            oldMessage.remove();
        }
    }

    // Update coupon discount
    const discountElement = document.getElementById('coupon-discount');
    const discountRow = document.querySelector('.total-item.discount');
    
    if (response.couponDiscount && response.couponDiscount > 0) {
        if (discountElement) {
            discountElement.textContent = `-₹${response.couponDiscount.toFixed(2)}`;
        }
        if (discountRow) {
            discountRow.style.display = 'flex';
        }
    } else {
        if (discountRow) {
            discountRow.style.display = 'none';
        }
    }

    // Update total
    if (totalElement && response.total !== undefined) {
        totalElement.textContent = `₹${response.total.toFixed(2)}`;
    }
    
    // Update cart count in header if available
    if (response.itemCount !== undefined) {
        updateCartCount(response.itemCount);
    }
}

function handleImageError(img) {
    img.onerror = null;
    img.src = '/images/default-product.jpg';
}

function updateCartCount(count) {
    const cartCountElement = document.getElementById('cart-count');
    if (cartCountElement) {
        cartCountElement.textContent = count;
    }
}



window.applyCoupon = function(code) {
    const couponCode = code || document.getElementById('couponCodeInput').value;
    if (!couponCode) {
        Swal.fire({
            icon: 'warning',
            title: 'Please enter a coupon code'
        });
        return;
    }

    fetch('/cart/coupons/apply', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: couponCode }),
        credentials: 'same-origin'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: 'Coupon applied successfully!',
                text: data.message,
                showConfirmButton: false,
                timer: 1200
            });
            closeCouponModal();
            if (data.cartTotals) {
                updateCartTotals(data.cartTotals);
            } else {
                setTimeout(() => { location.reload(); }, 1250);
            }
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: data.message || 'Failed to apply coupon'
            });
        }
    })
    .catch(error => {
        console.error('Error applying coupon:', error);
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'Failed to apply coupon'
        });
    });
}

window.removeCoupon = function() {
    fetch('/cart/coupons/remove', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'same-origin'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: 'Coupon removed',
                showConfirmButton: false,
                timer: 1200
            });
            setTimeout(() => {
                location.reload();
            }, 1250);
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: data.message || 'Failed to remove coupon'
            });
        }
    })
    .catch(error => {
        console.error('Error removing coupon:', error);
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'Failed to remove coupon'
        });
    });
};



window.openCouponModal = function() {
    document.getElementById('couponModal').style.display = 'flex';
    document.getElementById('couponCodeInput').focus();
    loadAvailableCoupons();
};

window.closeCouponModal = function() {
    document.getElementById('couponModal').style.display = 'none';
    document.getElementById('couponCodeInput').value = '';
};

document.addEventListener('DOMContentLoaded', function() {
    if (typeof $ !== 'undefined') {
        $('[data-toggle="tooltip"]').tooltip();
    }
    
    // Coupon modal handlers
    const closeBtn = document.getElementById('closeCouponModal');
    const applyBtn = document.getElementById('applyCouponBtn');
    const modal = document.getElementById('couponModal');
    const input = document.getElementById('couponCodeInput');
    const openButtons = document.querySelectorAll('#openCouponModal, .apply-coupon-btn');
    
    openButtons.forEach(btn => {
        btn.onclick = window.openCouponModal;
    });
    
    if (closeBtn) closeBtn.onclick = window.closeCouponModal;
    if (modal) modal.onclick = (e) => { if (e.target === modal) window.closeCouponModal(); };
    if (input) input.onkeypress = (e) => { if (e.key === 'Enter') applyBtn && applyBtn.click(); };
    if (applyBtn) {
        applyBtn.onclick = function() {
            const code = input.value.trim();
            if (code) {
                window.applyCoupon(code);
            }
        };
    }
    
    // Quantity control event listeners
    document.addEventListener('click', function(e) {
        if (e.target.closest('.quantity-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.quantity-btn');
            const productId = btn.getAttribute('data-product-id');
            const action = btn.getAttribute('data-action');
            let currentQuantity = parseInt(btn.getAttribute('data-current-quantity'));
            
            // Fallback: get quantity from the input field if data attribute is missing
            if (isNaN(currentQuantity)) {
                const quantityInput = document.querySelector(`[data-product-id="${productId}"] .quantity-input`);
                currentQuantity = quantityInput ? parseInt(quantityInput.value) : 1;
            }
            
            console.log('Quantity button clicked:', { productId, action, currentQuantity });
            
            if (productId && action && !isNaN(currentQuantity)) {
                window.updateQuantityInline(productId, action, currentQuantity);
            } else {
                console.error('Missing required data:', { productId, action, currentQuantity });
            }
        }
    });
});

function loadAvailableCoupons() {
    const container = document.getElementById('availableCoupons');
    
    if (!container) {
        return;
    }
    
    container.innerHTML = '<div class="text-center p-2"><small class="text-muted">Loading coupons...</small></div>';
    
    fetch('/cart/coupons/available', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'same-origin'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        container.innerHTML = '';
        
        if (data.success && data.coupons && data.coupons.length > 0) {
            data.coupons.forEach((coupon) => {
                
                const couponDiv = document.createElement('div');
                couponDiv.className = 'coupon-card mb-3';
                couponDiv.style.cssText = `
                    border: 1px solid #e9ecef;
                    border-radius: 8px;
                    padding: 16px;
                    background: #fff;
                    transition: all 0.2s ease;
                    cursor: pointer;
                `;
                couponDiv.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="coupon-info">
                            <div class="d-flex align-items-center mb-2">
                                <div class="coupon-icon me-3" style="width: 32px; height: 32px; background: #fff3cd; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-tag" style="color: #856404; font-size: 14px;"></i>
                                </div>
                                <div>
                                    <h6 class="mb-0 fw-semibold text-dark" style="font-size: 15px;">${coupon.code}</h6>
                                    <div class="text-muted" style="font-size: 13px;">
                                        ${coupon.discountType === 'percentage' 
                                            ? `${coupon.discountAmount || coupon.discountValue || 'N/A'}% OFF` 
                                            : `₹${coupon.discountAmount || coupon.discountValue || 'N/A'} OFF`}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button class="btn btn-sm" onclick="applyCouponFromModal('${coupon.code}')" style="background: #ffc107; border: 1px solid #ffc107; color: #000; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 13px;">
                            Apply
                        </button>
                    </div>
                `;
                couponDiv.addEventListener('mouseenter', function() {
                    this.style.borderColor = '#ffc107';
                    this.style.boxShadow = '0 2px 8px rgba(255, 193, 7, 0.15)';
                });
                couponDiv.addEventListener('mouseleave', function() {
                    this.style.borderColor = '#e9ecef';
                    this.style.boxShadow = 'none';
                });
                container.appendChild(couponDiv);
            });
        } else {
            container.innerHTML = '<div class="text-center p-3"><small class="text-muted">No coupons available</small></div>';
        }
    })
    .catch(error => {
        container.innerHTML = `<div class="text-center p-2"><small class="text-danger">Error: ${error.message}</small></div>`;
    });
}

window.applyCouponFromModal = function(code) {
    document.getElementById('couponCodeInput').value = code;
    if (typeof window.applyCoupon === 'function') {
        window.applyCoupon(code);
    }
};





    