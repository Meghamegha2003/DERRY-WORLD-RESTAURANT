// Global variables
let selectedPaymentMethod = '';
let selectedAddressId = '';
let swalInstance = null;

// Razorpay Configuration
const RAZORPAY_KEY_ID = document.currentScript?.getAttribute('data-razorpay-key') || '';

// Log Razorpay key status for debugging
if (!RAZORPAY_KEY_ID) {
    console.warn('Razorpay key is not set. Please check your environment variables.');
} else {
    console.log('Razorpay key loaded successfully');
}

// Handle address selection
function selectAddress(addressId) {
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
            
            // Enable place order button if payment method is already selected
            if (selectedPaymentMethod) {
                document.getElementById('placeOrderBtn').disabled = false;
            }
        }
    } catch (error) {
        console.error('Error selecting address:', error);
    }
}

// Expose functions to global scope
window.selectAddress = selectAddress;
window.selectPaymentMethod = selectPaymentMethod;
window.placeOrder = placeOrder;
window.verifyPayment = verifyPayment;

// Show error message
async function showError(title, message) {
    if (swalInstance) {
        await swalInstance.close();
        swalInstance = null;
    }
    
    if (typeof Swal !== 'undefined') {
        await Swal.fire({
            icon: 'error',
            title: title || 'Error',
            text: message || 'An unexpected error occurred',
            confirmButtonColor: '#ffbe33'
        });
    }
}

// Handle payment method selection
function selectPaymentMethod(method) {
    try {
        selectedPaymentMethod = method;
        document.querySelectorAll('.payment-method-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelector(`.payment-method-card[data-method="${method}"]`)?.classList.add('selected');
        
        // Enable place order button if address is already selected
        const placeOrderBtn = document.getElementById('placeOrderBtn');
        if (placeOrderBtn && selectedAddressId) {
            placeOrderBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error selecting payment method:', error);
    }
}


// Handle direct order (e.g., COD)
async function handleDirectOrder() {
    try {
        if (!selectedAddressId) {
            throw new Error('Please select a delivery address');
        }

        console.log('Sending checkout request with:', {
            addressId: selectedAddressId,
            paymentMethod: selectedPaymentMethod || 'cod'
        });

        const response = await fetch('/checkout/process', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || ''
            },
            body: JSON.stringify({
                addressId: selectedAddressId,
                paymentMethod: selectedPaymentMethod || 'cod'  // Default to cod if not specified
            })
        });

        const result = await response.json().catch(e => ({}));
        
        if (!response.ok) {
            console.error('Checkout failed with status:', response.status, 'Response:', result);
            throw new Error(result.message || result.error || 'Failed to process checkout');
        }
        
        // If cart was cleared on the server, update the UI accordingly
        if (result.cartCleared) {
            updateCartUI();
        }

        try {
            // Clear cart on the server
            const clearResponse = await fetch('/cart/clear', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || ''
                }
            });
            
            if (!clearResponse.ok) {
                console.warn('Failed to clear server cart:', await clearResponse.text());
            }
        } catch (clearError) {
            console.warn('Error clearing server cart:', clearError);
        }
        
        // Function to force update cart UI and sync with server
        async function forceUpdateCartUI() {
            console.log('Force updating cart UI...');
            
            try {
                // 1. Clear local storage
                localStorage.removeItem('cart');
                localStorage.removeItem('appliedCoupon');
                
                // 2. Update cart count in header
                const cartCountElements = document.querySelectorAll('.cart-count');
                if (cartCountElements && cartCountElements.length > 0) {
                    cartCountElements.forEach(el => {
                        el.textContent = '0';
                        el.style.display = 'none';
                    });
                }
                
                // 3. Clear cart items display if on cart page
                const cartItemsContainer = document.querySelector('.cart-items');
                if (cartItemsContainer) {
                    cartItemsContainer.innerHTML = '<div class="text-center py-5"><p>Your cart is empty</p></div>';
                }
                
                // 4. Update cart summary if on cart page
                const cartSummary = document.querySelector('.cart-summary');
                if (cartSummary) {
                    const totalElements = cartSummary.querySelectorAll('.total-amount');
                    const subTotalElements = cartSummary.querySelectorAll('.subtotal-amount');
                    const discountElements = cartSummary.querySelectorAll('.discount-amount');
                    
                    totalElements.forEach(el => el.textContent = '0.00');
                    subTotalElements.forEach(el => el.textContent = '0.00');
                    discountElements.forEach(el => el.textContent = '0.00');
                }
                
                // 5. Force a refresh of the cart data from the server
                try {
                    const response = await fetch('/api/cart', {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0'
                        }
                    });
                    
                    if (response.ok) {
                        const cartData = await response.json();
                        console.log('Refreshed cart data from server:', cartData);
                        
                        // If cart is not empty on server, clear it
                        if (cartData.items && cartData.items.length > 0) {
                            console.log('Cart still has items on server, forcing clear...');
                            await fetch('/cart/clear', {
                                method: 'POST',
                                credentials: 'same-origin',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json',
                                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || ''
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.warn('Error refreshing cart data:', error);
                }
                
                console.log('Cart UI force update complete');
                return true;
                
            } catch (error) {
                console.error('Error in forceUpdateCartUI:', error);
                return false;
            }
        }
        
        // Force update cart UI and sync with server
        await forceUpdateCartUI();

        // Show success message and redirect
        const confirmResult = await Swal.fire({
            title: 'Order Placed!',
            text: 'Your order has been placed successfully!',
            icon: 'success',
            showCancelButton: true,
            confirmButtonColor: '#ffbe33',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'View Order',
            cancelButtonText: 'Continue Shopping',
            allowOutsideClick: false
        });

        if (confirmResult.isConfirmed) {
            window.location.href = `/orders/${result.orderId || result.order?._id}`;
        } else {
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Order creation failed:', error);
        await showError('Order Failed', error.message || 'Failed to process your order');
        throw error;
    }
}

// Handle Razorpay payment
async function handleRazorpayPayment(paymentData, amount) {
    try {
        console.log('Initializing Razorpay with data:', {
            key_id: paymentData.key_id,
            order_id: paymentData.order_id,
            amount: paymentData.amount
        });

        if (!paymentData.key_id) {
            console.error('Razorpay key is missing in payment data');
            throw new Error('Payment gateway configuration error. Please try again later.');
        }

        if (!window.Razorpay) {
            console.error('Razorpay SDK not loaded');
            throw new Error('Payment system is not available. Please refresh the page and try again.');
        }

        const options = {
            key: paymentData.key_id,
            amount: paymentData.amount,
            currency: paymentData.currency || 'INR',
            name: 'DERRY Restaurant',
            description: 'Order Payment',
            order_id: paymentData.order_id,
            handler: async function(response) {
                try {
                    await verifyPayment(response, amount);
                } catch (error) {
                    console.error('Payment verification failed:', error);
                    await showError('Payment Failed', 'Failed to verify your payment. Please check your payment status or contact support.');
                }
            },
            prefill: {
                name: document.getElementById('userName')?.value || '',
                email: document.getElementById('userEmail')?.value || '',
                contact: document.getElementById('userPhone')?.value || ''
            },
            theme: {
                color: '#ffbe33'
            },
            modal: {
                ondismiss: async function() {
                    await showError('Payment Cancelled', 'You cancelled the payment. No order has been created.');
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.open();
    } catch (error) {
        console.error('Razorpay initialization error:', error);
        throw error;
    }
}

// Verify payment with server
async function verifyPayment(paymentResponse, amount) {
    try {
        // Show loading state
        const loadingSwal = Swal.fire({
            title: 'Verifying Payment',
            text: 'Please wait while we verify your payment...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            // Send payment verification to server
            const response = await fetch('/payment/verify', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
                },
                body: JSON.stringify({
                    razorpay_order_id: paymentResponse.razorpay_order_id,
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_signature: paymentResponse.razorpay_signature,
                    amount: amount
                })
            });

            // Get the response text first to handle potential HTML errors
            const responseText = await response.text();
            let result;
            
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('Failed to parse response as JSON:', responseText);
                throw new Error('Invalid response from server. Please try again.');
            }
            
            if (!response.ok || !result.success) {
                console.error('Payment verification failed:', result);
                throw new Error(result.message || 'Payment verification failed');
            }

            // Close loading dialog
            await loadingSwal.close();

            // Clear cart and coupon from localStorage
            localStorage.removeItem('cart');
            localStorage.removeItem('appliedCoupon');
            
            // Update cart count in the header
            const cartCountElements = document.querySelectorAll('.cart-count');
            if (cartCountElements && cartCountElements.length > 0) {
                cartCountElements.forEach(el => {
                    el.textContent = '0';
                    el.style.display = 'none';
                });
            }

            // Show success message
            await Swal.fire({
                title: 'Payment Successful!',
                text: 'Your order has been placed successfully!',
                icon: 'success',
                showCancelButton: true,
                confirmButtonColor: '#ffbe33',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'View Order',
                cancelButtonText: 'Continue Shopping',
                allowOutsideClick: false
            });

            // Redirect to order details page
            window.location.href = `/orders/${result.order?._id || result.orderId || ''}`;
            
        } catch (error) {
            await loadingSwal.close();
            throw error;
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        throw error;
    }
}

// Handle order placement
async function placeOrder() {
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
    
    // For COD, create order directly
    if (selectedPaymentMethod === 'cod') {
        if (orderTotal > 1000) {
            await showError('Payment Error', 'COD not available for orders above ₹1000');
            return;
        }
        await handleDirectOrder();
        return;
    }
    
    // For Wallet payment
    if (selectedPaymentMethod === 'wallet') {
        try {
            let response;
            try {
                console.log('Initiating wallet payment with address ID:', selectedAddressId);
                const requestUrl = '/payment/wallet';
                const requestOptions = {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        addressId: selectedAddressId
                    })
                };
                console.log('Sending request to:', requestUrl, 'with options:', requestOptions);
                
                response = await fetch(requestUrl, requestOptions);
                console.log('Received response status:', response.status);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Server responded with error:', errorText);
                    throw new Error(`Server error: ${response.status} ${response.statusText}`);
                }
            } catch (error) {
                console.error('Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    response: error.response,
                    status: error.status,
                    statusText: error.statusText
                });
                throw new Error('Unable to process wallet payment. Please check your connection and try again.');
            }

            let result;
            try {
                result = await response.json();
                console.log('Wallet payment response:', result);
                
                if (!response.ok) {
                    throw new Error(result.message || 'Failed to process wallet payment');
                }
            } catch (jsonError) {
                console.error('Error parsing JSON response:', jsonError);
                throw new Error('Invalid response from server. Please try again.');
            }

            // Clear cart and coupon from localStorage
            localStorage.removeItem('cart');
            localStorage.removeItem('appliedCoupon');
            
            // Update cart count in the header
            const cartCountElements = document.querySelectorAll('.cart-count');
            if (cartCountElements && cartCountElements.length > 0) {
                cartCountElements.forEach(el => {
                    el.textContent = '0';
                    el.style.display = 'none';
                });
            }

            // Show success message and redirect to order details
            const confirmResult = await Swal.fire({
                title: 'Order Placed!',
                text: 'Your order has been placed successfully using wallet balance!',
                icon: 'success',
                showCancelButton: true,
                confirmButtonColor: '#ffbe33',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'View Order',
                cancelButtonText: 'Continue Shopping',
                allowOutsideClick: false
            });

            if (confirmResult.isConfirmed) {
                // Redirect to order details page
                window.location.href = result.redirectUrl || `/orders/${result.order?._id || result.orderId}`;
            } else {
                // Redirect to home page
                window.location.href = '/';
            }
            return;
            
        } catch (error) {
            console.error('Wallet payment error:', error);
            await showError('Payment Failed', error.message || 'Failed to process wallet payment');
            return;
        }
    }

    // Show loading state
    const loadingSwal = Swal.fire({
        title: 'Creating Order',
        text: 'Please wait while we prepare your payment...',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        console.log('Creating Razorpay order with:', {
            addressId: selectedAddressId,
            paymentMethod: selectedPaymentMethod,
            amount: Math.round(orderTotal * 100)
        });

        // For online payment, create Razorpay order
        let response;
        try {
            response = await fetch('/payment/razorpay/create', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    addressId: selectedAddressId,
                    paymentMethod: selectedPaymentMethod,
                    amount: Math.round(orderTotal * 100) // Convert to paise
                })
            });
        } catch (error) {
            console.error('Network error during fetch:', error);
            throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
        }

        // First, get the response as text
        const responseText = await response.text();
        
        // Try to parse it as JSON
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Error parsing response:', parseError);
            throw new Error('Invalid response from server. Please try again.');
        }
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to create payment');
        }
        
        // Close loading dialog
        await loadingSwal.close();
        
        // Handle Razorpay payment for online method
        if (selectedPaymentMethod === 'online') {
            if (data.success && data.order && data.order.id) {
                // The server returns the order details in data.order
                const razorpayData = {
                    key_id: RAZORPAY_KEY_ID,
                    order_id: data.order.id,
                    amount: data.order.amount,
                    currency: data.order.currency || 'INR',
                    name: 'DERRY Restaurant',
                    description: 'Order Payment'
                };
                
                if (!razorpayData.key_id) {
                    console.error('Razorpay key is missing. Key ID:', RAZORPAY_KEY_ID);
                    throw new Error('Payment processing configuration error. Please try again later.');
                }
            
                await handleRazorpayPayment(razorpayData, orderTotal);
                return;
            }
            throw new Error('Invalid payment gateway response. Please try again.');
        }
        
        throw new Error('Unsupported payment method');
    } catch (error) {
        console.error('Error in placeOrder:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            response: error.response,
            status: error.status,
            statusText: error.statusText
        });
        
        if (loadingSwal) {
            await loadingSwal.close();
        }
        
        let errorMessage = 'Failed to place order. Please try again.';
        
        // Handle different types of errors
        if (error.name === 'TypeError') {
            if (error.message === 'Failed to fetch') {
                errorMessage = 'Network error: Could not connect to the server. Please check your internet connection and try again.';
            } else if (error.message.includes('JSON.parse')) {
                errorMessage = 'Error processing server response. Please try again or contact support if the issue persists.';
            }
        } else if (error.response) {
            // Handle HTTP error responses
            if (error.response.status === 401) {
                errorMessage = 'Your session has expired. Please log in again.';
            } else if (error.response.status === 403) {
                errorMessage = 'You do not have permission to perform this action.';
            } else if (error.response.status === 404) {
                errorMessage = 'The requested resource was not found.';
            } else if (error.response.status >= 500) {
                errorMessage = 'A server error occurred. Please try again later.';
            }
        } else if (error.message) {
            // Use the error message from the server if available
            errorMessage = error.message;
        }
        
        // Show error to user
        await showError('Error', errorMessage);
        
        // Re-enable the place order button
        const placeOrderBtn = document.getElementById('place-order-btn');
        if (placeOrderBtn) {
            placeOrderBtn.disabled = false;
        }
    }
}

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
