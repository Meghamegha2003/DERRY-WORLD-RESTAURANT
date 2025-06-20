// Sweet Alert Configuration
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

// Cart functions
function addToCart(productId, quantity = 1) {
    $.ajax({
        url: `/cart/add/${productId}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({ quantity }),
        xhrFields: {
            withCredentials: true
        },
        success: function(response) {
            if (response.success) {
                Toast.fire({
                    icon: 'success',
                    title: 'Item added to cart'
                });
                updateCartCount(response.cartCount);
            }
        },
        error: function(xhr) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: xhr.responseJSON?.message || 'Failed to add item to cart',
                confirmButtonColor: '#d33'
            });
        }
    });
}

function removeFromCart(productId) {
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
            $.ajax({
                url: `/cart/remove/${productId}`,
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                xhrFields: {
                    withCredentials: true
                },
                success: function(response) {
                    if (response.success) {
                        $(`#cart-item-${productId}`).fadeOut(300, function() {
                            $(this).remove();
                            // location.reload();
                        });
                    }
                },
                error: function(xhr) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: xhr.responseJSON?.message || 'Failed to remove item from cart',
                        confirmButtonColor: '#d33'
                    });
                }
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const cartItemsEl = document.querySelector('.cart-items-scroll');
    if (cartItemsEl) {
        cartItemsEl.addEventListener('click', async function(e) {
            if (!e.target.closest('.quantity-btn')) return;

            const button = e.target.closest('.quantity-btn');
            const productId = button.dataset.productId;
            const action = button.dataset.action;
            const quantityInput = button.parentElement.querySelector('.quantity-input');
            const currentQuantity = parseInt(quantityInput.value);
            // Get available stock from data attribute (set in cart.ejs)
            const availableStock = parseInt(button.dataset.stock || '5');
            let newQuantity = currentQuantity;
            if (action === 'increase' && currentQuantity < 5) {
                newQuantity = currentQuantity + 1;
            } else if (action === 'decrease' && currentQuantity > 1) {
                newQuantity = currentQuantity - 1;
            } else {
                return;
            }

            let endpoint;
            if (action === 'increase') {
                endpoint = `/cart/increment/${productId}`;
            } else if (action === 'decrease') {
                endpoint = `/cart/decrement/${productId}`;
            } else {
                return;
            }
            try {
                const response = await fetch(endpoint, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                let data;
                if (!response.ok) {
                    data = await response.json().catch(() => ({}));
                    const err = new Error(data.message || data.error || 'Failed to update quantity');
                    if (data.availableStock !== undefined) err.availableStock = data.availableStock;
                    throw err;
                }
                data = await response.json();

                // Only update the input value after successful backend response
                quantityInput.value = newQuantity;

                // Update button states
                button.parentElement.querySelector('.decrease-btn').disabled = newQuantity <= 1;
                button.parentElement.querySelector('.increase-btn').disabled = newQuantity >= 5;

                // Update order summary UI if present
                if (data) {
                    const subtotalElem = document.getElementById('subtotal');
                    const deliveryElem = document.getElementById('delivery-charge');
                    const totalElem = document.getElementById('total');
                    const couponElem = document.getElementById('coupon-discount');
                    if (subtotalElem && typeof data.subtotal !== 'undefined') 
                        subtotalElem.textContent = `₹${Number(data.subtotal).toFixed(2)}`;
                    if (deliveryElem && typeof data.deliveryCharge !== 'undefined') 
                        deliveryElem.textContent = `₹${Number(data.deliveryCharge).toFixed(2)}`;
                    if (totalElem && typeof data.total !== 'undefined') 
                        totalElem.textContent = `₹${Number(data.total).toFixed(2)}`;
                    if (couponElem && typeof data.couponDiscount !== 'undefined' && data.couponDiscount > 0)
                        couponElem.textContent = `-₹${Number(data.couponDiscount).toFixed(2)}`;
                    else if (couponElem)
                        couponElem.textContent = '-₹0.00';
                }

                // Show custom styled SweetAlert
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: data.message || 'Cart updated',
                    background: '#f0f9f4',
                    color: '#1a7f37',
                    showConfirmButton: false,
                    timer: 1400,
                    customClass: {
                        popup: 'swal2-cart-success',
                        title: 'swal2-cart-title',
                        icon: 'swal2-cart-icon'
                    },
                    didOpen: (toast) => {
                        toast.style.boxShadow = '0 4px 16px rgba(26,127,55,0.15)';
                        toast.style.borderRadius = '12px';
                        toast.style.fontWeight = 'bold';
                    }
                });
            } catch (error) {
                console.error('Error updating quantity:', error);
                // If stock error, adjust UI to available stock
                if (error.availableStock !== undefined) {
                    quantityInput.value = error.availableStock;
                    const incBtn = button.parentElement.querySelector('.increase-btn');
                    incBtn.disabled = true;
                    Toast.fire({ icon: 'warning', title: `Only ${error.availableStock} in stock` });
                } else {
                    Toast.fire({ icon: 'error', title: error.message || 'Failed to update quantity' });
                }
            }
        });
    }
});

async function fetchCartData() {
    try {
        const response = await fetch('/user/cart/get-cart', {
            credentials: 'same-origin'
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to fetch cart data');
        }
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Failed to fetch cart data');
        }

        return data.cart;
    } catch (error) {
        console.error('Error fetching cart:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to fetch cart data',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });
        return null;
    }
}

async function handleCartAction(url, method, body = null) {
    try {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        
        // First check if the response is ok
        if (!response.ok) {
            // Try to parse error JSON first
            try {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            } catch (e) {
                // If JSON parsing fails, use the status text
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        }

        // Now try to parse the successful response
        try {
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || 'Operation failed');
            }
            return data;
        } catch (e) {
            throw new Error('Invalid response format');
        }
    } catch (error) {
        console.error('Cart action error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to perform action',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });
        throw error;
    }
}

async function updateQuantity(productId, newQuantity, maxQuantity = 5, action = null) {
    try {
        let endpoint;
        if (action === 'increase') {
            endpoint = `/cart/increment/${productId}`;
        } else if (action === 'decrease') {
            endpoint = `/cart/decrement/${productId}`;
        } else {
            endpoint = `/cart/update/${productId}`; // fallback, but should be replaced
        }
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
        });
        const data = await response.json();

        const quantityElement = document.getElementById(`quantity-${productId}`);
        if (data.success) {
            // Update the quantity display
            if (quantityElement) {
                quantityElement.textContent = data.newQuantity || newQuantity;
            }
            // Update buttons state
            if (quantityElement) {
                const decreaseBtn = quantityElement.previousElementSibling;
                const increaseBtn = quantityElement.nextElementSibling;
                decreaseBtn.disabled = newQuantity <= 1;
                increaseBtn.disabled = newQuantity >= maxQuantity;
            }
            // Update price display
            const itemContainer = document.getElementById(`cart-item-${productId}`);
            if (itemContainer) {
                const totalElement = itemContainer.querySelector('.item-total');
                if (totalElement && data.cart) {
                    const itemPrice = parseFloat(totalElement.getAttribute('data-price'));
                    totalElement.textContent = `Total: ₹${(itemPrice * newQuantity).toFixed(2)}`;
                }
            }
            // Update cart summary
            if (data.cart) {
                updateCartTotals(data.cart);
            }
            // Toast
            Toast.fire({
                icon: 'success',
                title: 'Quantity updated',
                position: 'top-end'
            });
            // Remove item if quantity is 0
            if ((data.newQuantity || newQuantity) === 0) {
                if (itemContainer) itemContainer.remove();
                updateCartCount(data.cartCount);
                if (data.cartCount === 0) {
                    // location.reload();
                }
            }
        } else {
            // Show backend error
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.error || data.message || 'Failed to update quantity',
                confirmButtonColor: '#ffbe33',
                showConfirmButton: true
            });
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to update quantity',
            confirmButtonColor: '#ffbe33',
            showConfirmButton: true
        });
        console.error('Failed to update quantity:', error);
    }
}

let availableCoupons = [];

let couponModal;

document.addEventListener('DOMContentLoaded', function() {
    couponModal = new bootstrap.Modal(document.getElementById('couponModal'));
});

function openCouponModal() {
    loadAvailableCoupons();
    couponModal.show();
}

function loadAvailableCoupons() {
    fetch('/user/coupons/available', {
        credentials: 'same-origin'
    })
    .then(response => response.json())
    .then(data => {
        const couponsContainer = $('#availableCoupons');
        couponsContainer.empty();

        if (data.coupons && data.coupons.length > 0) {
            data.coupons.forEach(coupon => {
                const expiryDate = new Date(coupon.expiryDate).toLocaleDateString();
                const couponHtml = `
                    <div class="coupon-item mb-3 p-3 border rounded">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h5 class="mb-1">${coupon.code}</h5>
                                <p class="mb-1 text-muted">
                                    ${coupon.discountType === 'percentage' 
                                        ? `${coupon.discountAmount}% OFF` 
                                        : `₹${coupon.discountAmount} OFF`}
                                </p>
                                <small class="text-muted">
                                    Min. Purchase: ₹${coupon.minimumPurchase}
                                    ${coupon.maxDiscount ? ` | Max Discount: ₹${coupon.maxDiscount}` : ''}
                                </small>
                                <br>
                                <small class="text-muted">Valid till: ${expiryDate}</small>
                            </div>
                            <button class="btn btn-sm btn-warning" 
                                    onclick="applyCouponFromModal('${coupon.code}')">
                                Apply
                            </button>
                        </div>
                    </div>
                `;
                couponsContainer.append(couponHtml);
            });
        } else {
            couponsContainer.html(`
                <div class="text-center p-4">
                    <i class="fas fa-ticket-alt fa-3x mb-3 text-muted"></i>
                    <p class="text-muted">No coupons available at the moment</p>
                </div>
            `);
        }
    })
    .catch(error => {
        const couponsContainer = $('#availableCoupons');
        couponsContainer.html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                ${error.message || 'Failed to load coupons. Please try again.'}
            </div>
        `);
    });
}

function applyCouponAndCloseModal() {
    const code = $('#couponCode').val().trim();
    if (code) {
        applyCouponCode(code);
        $('#couponModal').modal('hide');
    } else {
        Toast.fire({
            icon: 'warning',
            title: 'Please enter a coupon code'
        });
    }
}

function applyCouponFromModal(code) {
    $('#couponModal').modal('hide');
    applyCouponCode(code);
}

async function applyCouponCode(code) {
    try {
        const response = await fetch('/user/coupons/apply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code }),
            credentials: 'same-origin'
        });

        const data = await response.json();
        if (data.success) {
            Toast.fire({
                icon: 'success',
                title: data.message
            });

            // Update cart totals and refresh the page
            if (data.cartTotals) {
                updateCartTotals(data.cartTotals);
            }
            // location.reload();
        } else {
            throw new Error(data.message || 'Failed to apply coupon');
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to apply coupon',
            confirmButtonColor: '#d33'
        });
    }
}

async function removeCoupon() {
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
            // Optionally reload after alert
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
}

function updateCartTotals(totals) {
    // Update subtotal
    const subtotalElement = document.getElementById('subtotal');
    if (subtotalElement) {
        subtotalElement.textContent = `₹${totals.subtotal.toFixed(2)}`;
    }

    // Update delivery charge
    const deliveryElement = document.getElementById('delivery-charge');
    if (deliveryElement) {
        if (totals.subtotal >= 500) {
            deliveryElement.textContent = 'Free Delivery!';
            deliveryElement.classList.add('text-success');
            
            // Remove any existing delivery message
            const oldMessage = document.querySelector('.delivery-message');
            if (oldMessage) {
                oldMessage.remove();
            }
        } else {
            deliveryElement.textContent = `₹${totals.deliveryCharge.toFixed(2)}`;
            deliveryElement.classList.remove('text-success');
            
            // Update free delivery message
            const remainingForFree = 500 - totals.subtotal;
            const oldMessage = document.querySelector('.delivery-message');
            if (oldMessage) {
                oldMessage.remove();
            }
            if (remainingForFree > 0) {
                deliveryElement.insertAdjacentHTML('afterend', 
                    `<div class="text-muted small delivery-message">Add ₹${remainingForFree.toFixed(2)} more for free delivery</div>`
                );
            }
        }
    }

    // Update coupon discount
    const discountElement = document.getElementById('coupon-discount');
    if (discountElement) {
        if (totals.discount > 0) {
            discountElement.textContent = `-₹${totals.discount.toFixed(2)}`;
            discountElement.closest('.d-flex').style.display = 'flex';
        } else {
            discountElement.closest('.d-flex').style.display = 'none';
        }
    }

    // Update final total
    const totalElement = document.getElementById('total');
    if (totalElement) {
        totalElement.textContent = `₹${totals.total.toFixed(2)}`;
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

// Load available coupons when the modal is opened
$('#couponModal').on('show.bs.modal', function () {
    loadAvailableCoupons();
});

// Function to load available coupons
function loadAvailableCoupons() {
    fetch('/user/coupons/available', {
        credentials: 'same-origin'
    })
    .then(response => response.json())
    .then(data => {
        const container = document.getElementById('availableCoupons');
        container.innerHTML = '';

        if (data.coupons && data.coupons.length > 0) {
            data.coupons.forEach(coupon => {
                const couponCard = document.createElement('div');
                couponCard.className = 'card mb-2';
                couponCard.innerHTML = `
                    <div class="card-body">
                        <h6 class="card-title">${coupon.code}</h6>
                        <p class="card-text small mb-2">${coupon.description}</p>
                        <button class="btn btn-sm btn-outline-warning" 
                            onclick="applyCoupon('${coupon.code}')">
                            Apply Coupon
                        </button>
                    </div>
                `;
                container.appendChild(couponCard);
            });
        } else {
            container.innerHTML = '<p class="text-center text-muted">No coupons available</p>';
        }
    })
    .catch(error => {
        console.error('Error loading coupons:', error);
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'Failed to load available coupons'
        });
    });
}

// Function to apply coupon
function applyCoupon(code) {
    const couponCode = code || document.getElementById('couponCode').value;
    if (!couponCode) {
        Swal.fire({
            icon: 'warning',
            title: 'Please enter a coupon code'
        });
        return;
    }

    fetch('/user/coupons/apply', {
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
            $('#couponModal').modal('hide');
            // Update cart summary if backend provides new totals
            if (data.cartTotals) {
                updateCartTotals(data.cartTotals);
            } else {
                // Fallback: reload page if no totals returned
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

// Function to remove coupon
function removeCoupon() {
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
            // Optionally reload after alert
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
}

// Function to apply coupon and close modal (used by the input field)
function applyCouponAndCloseModal() {
    applyCoupon();
}

// Initialize components when document is ready
$(document).ready(function() {
    $('[data-toggle="tooltip"]').tooltip();
    
    // Initialize coupon modal and event handlers if Bootstrap is loaded
    const couponModalEl = document.getElementById('couponModal');
    if (couponModalEl && window.bootstrap && bootstrap.Modal) {
        try {
            couponModal = new bootstrap.Modal(couponModalEl);
        } catch (e) {
            console.warn('Bootstrap Modal init failed:', e);
        }
        couponModalEl.addEventListener('show.bs.modal', () => loadAvailableCoupons());
        couponModalEl.addEventListener('hide.bs.modal', () => {
            $('#couponCode').val('');
            $('#availableCoupons').empty();
        });
    }
});