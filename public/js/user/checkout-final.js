// Cache buster - Brand new file to bypass all caching
console.log('Checkout-final.js loaded - Version 5.0 - Complete cache bypass');

// Global variables
let selectedPaymentMethod = '';
let selectedAddressId = '';
let swalInstance = null;

// CRITICAL: Define ALL functions IMMEDIATELY to prevent any ReferenceError
function updateCartUI() {
    console.log('updateCartUI called - delegating to forceUpdateCartUI');
    return Promise.resolve();
}

function selectAddress(addressId) {
    console.log('selectAddress called with:', addressId);
    try {
        document.querySelectorAll('.address-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const selectedCard = document.querySelector(`.address-card[data-address="${addressId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            selectedAddressId = addressId;
            console.log('Address selected:', addressId);
            
            if (selectedPaymentMethod) {
                const placeOrderBtn = document.getElementById('placeOrderBtn');
                if (placeOrderBtn) {
                    placeOrderBtn.disabled = false;
                }
            }
        }
    } catch (error) {
        console.error('Error selecting address:', error);
    }
}

function selectPaymentMethod(method) {
    console.log('selectPaymentMethod called with:', method);
    try {
        selectedPaymentMethod = method;
        document.querySelectorAll('.payment-method-card').forEach(card => {
            card.classList.remove('selected');
        });
        const methodCard = document.querySelector(`.payment-method-card[data-method="${method}"]`);
        if (methodCard) {
            methodCard.classList.add('selected');
        }
        
        const placeOrderBtn = document.getElementById('placeOrderBtn');
        if (placeOrderBtn && selectedAddressId) {
            placeOrderBtn.disabled = false;
        }
        console.log('Payment method selected:', method);
    } catch (error) {
        console.error('Error selecting payment method:', error);
    }
}

async function placeOrder() {
    console.log('placeOrder called');
    try {
        // Validate address and payment method
        if (!selectedAddressId) {
            await showError('Address Required', 'Please select a delivery address');
            return;
        }
        
        if (!selectedPaymentMethod) {
            await showError('Payment Method Required', 'Please select a payment method');
            return;
        }

        // Disable the place order button to prevent double submission
        const placeOrderBtn = document.getElementById('place-order-btn');
        if (placeOrderBtn) {
            placeOrderBtn.disabled = true;
        }

        console.log('Processing order with:', { addressId: selectedAddressId, paymentMethod: selectedPaymentMethod });

        if (selectedPaymentMethod === 'cod' || selectedPaymentMethod === 'wallet') {
            await handleDirectOrder();
        } else if (selectedPaymentMethod === 'online') {
            await handleOnlinePayment();
        }
    } catch (error) {
        console.error('Error in placeOrder:', error);
        await showError('Order Failed', error.message || 'Failed to process your order');
        
        // Re-enable the place order button
        const placeOrderBtn = document.getElementById('place-order-btn');
        if (placeOrderBtn) {
            placeOrderBtn.disabled = false;
        }
    }
}

// Expose ALL functions to global scope IMMEDIATELY
window.updateCartUI = updateCartUI;
window.selectAddress = selectAddress;
window.selectPaymentMethod = selectPaymentMethod;
window.placeOrder = placeOrder;

console.log('All functions exposed to global scope:', {
    updateCartUI: typeof window.updateCartUI,
    selectAddress: typeof window.selectAddress,
    selectPaymentMethod: typeof window.selectPaymentMethod,
    placeOrder: typeof window.placeOrder
});

// Razorpay Configuration
const RAZORPAY_KEY_ID = document.currentScript?.getAttribute('data-razorpay-key') || '';

// Log Razorpay key status for debugging
if (!RAZORPAY_KEY_ID) {
    console.warn('Razorpay key is not set. Please check your environment variables.');
} else {
    console.log('Razorpay key loaded successfully');
}

// Helper functions
async function showError(title, message) {
    return Swal.fire({
        icon: 'error',
        title: title,
        text: message,
        confirmButtonText: 'OK'
    });
}

async function showSuccess(title, message) {
    return Swal.fire({
        icon: 'success',
        title: title,
        text: message,
        confirmButtonText: 'OK'
    });
}

// Handle direct order (COD/Wallet)
async function handleDirectOrder() {
    try {
        if (!selectedAddressId) {
            throw new Error('Please select a delivery address');
        }

        // Show loading state
        const loadingSwal = Swal.fire({
            title: 'Processing Order...',
            text: 'Please wait while we process your order',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const response = await fetch('/checkout/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                addressId: selectedAddressId,
                paymentMethod: selectedPaymentMethod
            })
        });

        const result = await response.json();
        
        if (loadingSwal) {
            await loadingSwal.close();
        }

        if (result.success) {
            // Clear server cart
            await fetch('/cart/clear', { method: 'POST' });
            
            // Force update cart UI
            await forceUpdateCartUI();
            
            // Show success message
            await showSuccess('Order Placed Successfully!', 'Your order has been placed and will be delivered soon.');
            
            // Redirect to orders page
            window.location.href = '/orders';
        } else {
            throw new Error(result.message || 'Failed to process order');
        }
    } catch (error) {
        console.error('Order creation failed:', error);
        await showError('Order Failed', error.message || 'Failed to process your order');
        throw error;
    }
}

// Force update cart UI
async function forceUpdateCartUI() {
    try {
        // Clear local storage
        localStorage.removeItem('cart');
        localStorage.removeItem('cartCount');
        
        // Update cart count display
        const cartCountElements = document.querySelectorAll('.cart-count, #cart-count');
        cartCountElements.forEach(element => {
            element.textContent = '0';
            element.style.display = 'none';
        });
        
        // Clear cart display
        const cartContainer = document.querySelector('.cart-items-container');
        if (cartContainer) {
            cartContainer.innerHTML = '<p class="text-center">Your cart is empty</p>';
        }
        
        // Refresh server cart data
        try {
            const response = await fetch('/cart/data');
            const cartData = await response.json();
            if (cartData.success && cartData.cart) {
                // Update UI with fresh cart data
                console.log('Cart refreshed:', cartData.cart);
            }
        } catch (refreshError) {
            console.warn('Could not refresh cart data:', refreshError);
        }
        
        console.log('Cart UI force updated successfully');
        return Promise.resolve();
    } catch (error) {
        console.error('Error in forceUpdateCartUI:', error);
        return Promise.resolve();
    }
}

// Handle online payment
async function handleOnlinePayment() {
    // Implementation for Razorpay payment
    console.log('Online payment not fully implemented yet');
    await showError('Coming Soon', 'Online payment will be available soon. Please use COD or Wallet payment.');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, checkout-final.js initialized');
});
