// Checkout.js - Clean implementation without duplicates
console.log('Checkout.js loaded - Version 6.0 - Clean unified implementation');

// Global variables
let selectedPaymentMethod = '';
let selectedAddressId = '';

// Utility functions
function updateCartUI() {
    console.log('updateCartUI called');
    return Promise.resolve();
}

// Handle address selection
function selectAddress(addressId) {
    console.log('selectAddress called with:', addressId);
    try {
        // Remove selected class from all address cards
        document.querySelectorAll('.address-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Add selected class to clicked address card
        const selectedCard = document.querySelector(`.address-card[data-address="${addressId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            selectedAddressId = addressId;
            console.log('Address selected:', addressId);
        }
    } catch (error) {
        console.error('Error selecting address:', error);
    }
}

// Handle payment method selection
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
        console.log('Payment method selected:', method);
    } catch (error) {
        console.error('Error selecting payment method:', error);
    }
}

// Show error message
async function showError(title, message) {
    if (typeof Swal !== 'undefined') {
        await Swal.fire({
            icon: 'error',
            title: title || 'Error',
            text: message || 'An unexpected error occurred',
            confirmButtonColor: '#ffbe33'
        });
    }
}

// Handle order placement - Unified implementation
async function placeOrder() {
    console.log('placeOrder called - unified implementation');
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

        const orderTotalEl = document.getElementById('orderTotal');
        if (!orderTotalEl?.dataset?.total) {
            await showError('Error', 'Unable to determine order total');
            return;
        }
        
        const orderTotal = parseFloat(orderTotalEl.dataset.total);
        
        // Check COD limit
        if (selectedPaymentMethod === 'cod' && orderTotal > 1000) {
            await showError('Payment Error', 'COD not available for orders above ₹1000');
            return;
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

        console.log('Processing order with:', { 
            addressId: selectedAddressId, 
            paymentMethod: selectedPaymentMethod 
        });

        // Use single endpoint for all payment methods
        const response = await fetch('/checkout/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                addressId: selectedAddressId,
                paymentMethod: selectedPaymentMethod
            })
        });

        const result = await response.json();
        
        // Close loading dialog
        if (loadingSwal) {
            await loadingSwal.close();
        }

        if (result.success) {
            console.log('Order placed successfully');
            
            // Handle Razorpay payment if online method and order details returned
            if (selectedPaymentMethod === 'online' && result.order && result.order.id) {
                // Initialize Razorpay payment
                const razorpayOptions = {
                    key: result.key || window.RAZORPAY_KEY_ID,
                    amount: result.order.amount,
                    currency: result.order.currency || 'INR',
                    name: 'DERRY Restaurant',
                    description: 'Order Payment',
                    order_id: result.order.id,
                    handler: async function(response) {
                        try {
                            // Verify payment with server
                            const verifyResponse = await fetch('/checkout/verify-payment', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-Requested-With': 'XMLHttpRequest'
                                },
                                credentials: 'same-origin',
                                body: JSON.stringify({
                                    razorpay_order_id: response.razorpay_order_id,
                                    razorpay_payment_id: response.razorpay_payment_id,
                                    razorpay_signature: response.razorpay_signature
                                })
                            });
                            
                            const verifyResult = await verifyResponse.json();
                            
                            if (verifyResult.success) {
                                await showSuccessAndRedirect(verifyResult.orderId);
                            } else {
                                throw new Error(verifyResult.message || 'Payment verification failed');
                            }
                        } catch (error) {
                            console.error('Payment verification failed:', error);
                            await showError('Payment Failed', error.message || 'Failed to verify payment');
                        }
                    },
                    prefill: {
                        name: '',
                        email: '',
                        contact: ''
                    },
                    theme: {
                        color: '#ffbe33'
                    },
                    modal: {
                        ondismiss: function() {
                            showError('Payment Cancelled', 'Payment was cancelled. No order has been created.');
                        }
                    }
                };
                
                if (window.Razorpay) {
                    const rzp = new Razorpay(razorpayOptions);
                    rzp.open();
                } else {
                    throw new Error('Razorpay SDK not loaded');
                }
                return;
            }
            
            // For COD and Wallet payments, show success directly
            await showSuccessAndRedirect(result.orderId);
        } else {
            throw new Error(result.message || 'Failed to process order');
        }
    } catch (error) {
        console.error('Error in placeOrder:', error);
        await showError('Order Failed', error.message || 'Failed to process your order');
    }
}

// Helper function to show success and redirect
async function showSuccessAndRedirect(orderId) {
    // Clear cart on server
    try {
        await fetch('/cart/clear', { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        });
    } catch (clearError) {
        console.warn('Error clearing cart:', clearError);
    }
    
    // Clear local storage
    localStorage.removeItem('cart');
    localStorage.removeItem('cartCount');
    
    // Update cart count in header
    const cartCountElements = document.querySelectorAll('.cart-count, #cart-count, .badge');
    cartCountElements.forEach(el => {
        el.textContent = '0';
        el.style.display = 'none';
    });
    
    // Show success message
    await Swal.fire({
        icon: 'success',
        title: 'Order Placed Successfully!',
        text: 'Your order has been placed and will be delivered soon.',
        confirmButtonColor: '#ffbe33'
    });
    
    // Redirect to orders page
    window.location.href = '/orders?orderPlaced=true';
}

// Expose functions to global scope
window.updateCartUI = updateCartUI;
window.selectAddress = selectAddress;
window.selectPaymentMethod = selectPaymentMethod;
window.placeOrder = placeOrder;

console.log('All checkout functions exposed to global scope:', {
    updateCartUI: typeof window.updateCartUI,
    selectAddress: typeof window.selectAddress,
    selectPaymentMethod: typeof window.selectPaymentMethod,
    placeOrder: typeof window.placeOrder
});

// Initialize event handlers
function initializeEventHandlers() {
    // Address card hover effect
    document.querySelectorAll('.address-card').forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.querySelector('.address-actions')?.classList.add('d-block');
        });
        card.addEventListener('mouseleave', function() {
            this.querySelector('.address-actions')?.classList.remove('d-block');
        });
        
        // Address selection
        card.addEventListener('click', function() {
            const addressId = this.dataset.address;
            selectAddress(addressId);
        });
    });
    
    // Payment method selection
    document.querySelectorAll('.payment-method-card').forEach(card => {
        card.addEventListener('click', function() {
            const method = this.dataset.method;
            selectPaymentMethod(method);
        });
    });
    
    // Place order button
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    if (placeOrderBtn) {
        placeOrderBtn.addEventListener('click', placeOrder);
    }
}

// Handle payment failure
function handlePaymentFailure(error) {
    console.error('Payment failed:', error);
    fetch('/payment/failure', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            error: error.error || 'Unknown error',
            description: error.description || 'Payment processing failed'
        })
    });
}

// Initialize checkout when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize event handlers
    initializeEventHandlers();

    // Initialize place order button
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    if (placeOrderBtn) {
        placeOrderBtn.addEventListener('click', function(e) {
            e.preventDefault();
            placeOrder();
        });
    }

    // Select first address by default if available
    const firstAddress = document.querySelector('.address-card');
    if (firstAddress?.dataset?.address) {
        selectAddress(firstAddress.dataset.address);
    }
    
    // Set default payment method based on order total
    const orderTotalEl = document.getElementById('orderTotal');
    if (orderTotalEl?.dataset?.total) {
        const orderTotal = parseFloat(orderTotalEl.dataset.total);
        if (orderTotal > 1000) {
            const codCard = document.getElementById('codCard');
            if (codCard) {
                codCard.style.setProperty('display', 'none');
            }
            selectPaymentMethod('online');
        } else {
            selectPaymentMethod('cod');
        }
    }
});
