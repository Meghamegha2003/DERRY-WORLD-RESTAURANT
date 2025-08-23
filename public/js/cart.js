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


function addToCart(productId, quantity = 1) {
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
                    $(`#cart-item-${productId}`).fadeOut(300, function() {
                        $(this).remove();

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
}

document.addEventListener('DOMContentLoaded', function () {
    const cartItemsEl = document.querySelector('.cart-items-scroll');

    if (cartItemsEl) {
        cartItemsEl.addEventListener('click', async function (e) {
            const button = e.target.closest('.quantity-btn');
            if (!button) return;

            const productId = button.dataset.productId;
            const action = button.dataset.action;
            const quantityInput = button.parentElement.querySelector('.quantity-input');
            const currentQuantity = parseInt(quantityInput.value);
            const maxStock = parseInt(button.dataset.stock || '5');

            let newQuantity = currentQuantity;

            if (action === 'increase' && currentQuantity < 5) {
                newQuantity++;
            } else if (action === 'decrease' && currentQuantity > 1) {
                newQuantity--;
            } else {
                return;
            }

            const endpoint =
                action === 'increase'
                    ? `/cart/increment/${productId}`
                    : `/cart/decrement/${productId}`;

            try {
                const response = await fetch(endpoint, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.message || 'Failed to update cart');
                }

                const data = await response.json();

                // Update the quantity input
                quantityInput.value = newQuantity;
                
                // Update button states
                const quantityControls = button.closest('.quantity-controls');
                let decreaseBtn = quantityControls.querySelector('.decrease-btn');
                let increaseBtn = quantityControls.querySelector('.increase-btn');
                const input = quantityControls.querySelector('.quantity-input');
                const maxStock = parseInt(button.dataset.stock || '5');
                
                // Create decrease button if it doesn't exist and we need it
                if (newQuantity > 1 && !decreaseBtn) {
                    decreaseBtn = document.createElement('button');
                    decreaseBtn.className = 'quantity-btn decrease-btn';
                    decreaseBtn.innerHTML = '<i class="fas fa-minus"></i>';
                    decreaseBtn.setAttribute('data-product-id', button.dataset.productId);
                    decreaseBtn.setAttribute('data-action', 'decrease');
                    decreaseBtn.setAttribute('data-stock', maxStock);
                    quantityControls.insertBefore(decreaseBtn, input);
                    
                    // The event is already handled by the document-level event delegation
                    // No need to add additional event listeners
                } 
                // Remove decrease button if quantity is 1
                else if (newQuantity <= 1 && decreaseBtn) {
                    decreaseBtn.remove();
                }
                
                // Create increase button if it doesn't exist and we need it
                if (newQuantity < Math.min(5, maxStock) && !increaseBtn) {
                    increaseBtn = document.createElement('button');
                    increaseBtn.className = 'quantity-btn increase-btn';
                    increaseBtn.innerHTML = '<i class="fas fa-plus"></i>';
                    increaseBtn.setAttribute('data-product-id', button.dataset.productId);
                    increaseBtn.setAttribute('data-action', 'increase');
                    increaseBtn.setAttribute('data-stock', maxStock);
                    quantityControls.appendChild(increaseBtn);
                    
                    // The event is already handled by the document-level event delegation
                    // No need to add additional event listeners
                } 
                // Remove increase button if we've reached max
                else if (newQuantity >= Math.min(5, maxStock) && increaseBtn) {
                    increaseBtn.remove();
                }
                
                // Update button states
                if (decreaseBtn) {
                    decreaseBtn.disabled = newQuantity <= 1;
                    decreaseBtn.style.opacity = newQuantity <= 1 ? '0.5' : '1';
                }
                
                if (increaseBtn) {
                    increaseBtn.disabled = newQuantity >= Math.min(5, maxStock);
                    increaseBtn.style.opacity = newQuantity >= Math.min(5, maxStock) ? '0.5' : '1';
                }
                
                // Update the UI with server response data
                if (data) {
                    // Update the cart summary
                    const subtotalEl = document.getElementById('subtotal');
                    const totalEl = document.getElementById('total');
                    const deliveryChargeEl = document.getElementById('delivery-charge');
                    
                    if (data.subtotal !== undefined && subtotalEl) {
                        subtotalEl.textContent = '₹' + data.subtotal.toFixed(2);
                    }
                    
                    if (data.total !== undefined && totalEl) {
                        totalEl.textContent = '₹' + data.total.toFixed(2);
                    }
                    
                    // Update coupon discount if it exists
                    if (data.couponDiscount > 0) {
                        let couponDiscountEl = document.getElementById('coupon-discount');
                        if (!couponDiscountEl) {
                            // If coupon discount element doesn't exist, create it
                            const subtotalItem = document.querySelector('.total-item:first-child');
                            if (subtotalItem) {
                                const discountItem = document.createElement('div');
                                discountItem.className = 'total-item discount';
                                discountItem.innerHTML = `
                                    <span>Coupon Discount</span>
                                    <span id="coupon-discount">-₹${data.couponDiscount.toFixed(2)}</span>
                                `;
                                subtotalItem.after(discountItem);
                            }
                        } else {
                            couponDiscountEl.textContent = '-₹' + data.couponDiscount.toFixed(2);
                        }
                    } else {
                        // Remove coupon discount if it exists but no discount is applied
                        const couponDiscountEl = document.getElementById('coupon-discount');
                        if (couponDiscountEl) {
                            couponDiscountEl.closest('.total-item').remove();
                        }
                    }
                    
                    // Update delivery charge
                    if (data.deliveryCharge !== undefined && deliveryChargeEl) {
                        deliveryChargeEl.textContent = data.deliveryCharge === 0 ? 'FREE' : '₹' + data.deliveryCharge.toFixed(2);
                    }
                }
                
                // Show success message
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
                console.error('Quantity update failed:', error.message);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: error.message || 'Failed to update quantity',
                    confirmButtonColor: '#d33'
                });
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




    async function removeFromCart(productId) {
  const confirm = await Swal.fire({
    title: 'Remove this item?',
    text: 'Are you sure you want to delete it from your cart?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, remove it!',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6'
  });

  if (!confirm.isConfirmed) return;

  try {
    const response = await fetch(`/cart/remove/${productId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.success) {
      // Remove the product div from the DOM
      const productDiv = document.querySelector(`.cart-item[data-product-id="${productId}"]`);
      if (productDiv) productDiv.remove();

      // Update totals
      document.getElementById('subtotal').textContent = `₹${data.subtotal.toFixed(2)}`;
      document.getElementById('total').textContent = `₹${data.total.toFixed(2)}`;
      document.getElementById('delivery-charge').textContent = `₹${data.deliveryCharge.toFixed(2)}`;

      // Show toast
      Swal.fire({
        icon: 'success',
        title: 'Removed!',
        text: 'Product removed from cart',
        toast: true,
        position: 'top-end',
        timer: 1500,
        showConfirmButton: false,
      });

      // If cart becomes empty, refresh to show "empty cart" UI
      const remainingItems = document.querySelectorAll('.cart-item');
      if (remainingItems.length === 0) {
        setTimeout(() => window.location.reload(), 1000);
      }

    } else {
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: data.error || 'Failed to remove item!',
      });
    }
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Something went wrong!',
    });
  }
}

        // Modal open/close logic
        document.getElementById('openCouponModal').onclick = function() {
            document.getElementById('couponModal').style.display = 'flex';
            setTimeout(() => {
                document.getElementById('couponCodeInput').focus();
            }, 200);
            // Dynamically load coupons when modal opens
            if (typeof loadAvailableCoupons === 'function') {
                loadAvailableCoupons();
            }
        };
        document.getElementById('closeCouponModal').onclick = function() {
            document.getElementById('couponModal').style.display = 'none';
            document.getElementById('couponMessage').innerText = '';
            document.getElementById('couponCodeInput').value = '';
        };
        // Close modal on overlay click
        document.getElementById('couponModal').onclick = function(e) {
            if (e.target === this) {
                this.style.display = 'none';
                document.getElementById('couponMessage').innerText = '';
                document.getElementById('couponCodeInput').value = '';
            }
        };
        // Enter key submits coupon
        document.getElementById('couponCodeInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('applyCouponBtn').click();
            }
        });
        // Apply coupon logic (delegated to cart.js, but show loading/message here)
        document.getElementById('applyCouponBtn').onclick = async function() {
            const code = document.getElementById('couponCodeInput').value.trim();
            const msg = document.getElementById('couponMessage');
            if (!code) {
                msg.innerText = 'Please enter a coupon code.';
                msg.style.color = '#e74c3c';
                return;
            }
            msg.innerText = 'Checking...';
            msg.style.color = '#888';
            try {
                // You may want to move this AJAX to cart.js for separation
                const res = await fetch('/user/coupons/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });
                const data = await res.json();
                if (data.success) {
                    msg.innerText = 'Coupon applied!';
                    msg.style.color = '#27ae60';
                    setTimeout(() => window.location.reload(), 900);
                } else {
                    msg.innerText = data.message || 'Invalid coupon.';
                    msg.style.color = '#e74c3c';
                }
            } catch (err) {
                msg.innerText = 'Error applying coupon.';
                msg.style.color = '#e74c3c';
            }
        };
    