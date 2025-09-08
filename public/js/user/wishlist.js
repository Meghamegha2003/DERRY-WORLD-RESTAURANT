// Function to toggle wishlist
async function toggleWishlist(productId, button) {
    try {
        if (!button) {
            throw new Error('Button element not found');
        }

        // Disable button to prevent double-clicks
        button.disabled = true;

        // Show loading
        const loadingToast = Swal.mixin({
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 1000,
            timerProgressBar: true,
            customClass: {
                popup: 'colored-toast'
            }
        });

        await loadingToast.fire({
            icon: 'info',
            title: 'Processing...'
        });

        // Send request to toggle wishlist status
        const response = await fetch(`/wishlist/toggle/${productId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // Handle redirect responses
        if (response.redirected) {
            window.location.href = response.url;
            return;
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Failed to update wishlist');
        }

        // Update button state based on server response
        const newState = data.action === 'added';
        button.classList.toggle('active', newState);
        const heartIcon = button.querySelector('i');
        if (heartIcon) {
            heartIcon.className = newState ? 'fas fa-heart text-warning' : 'far fa-heart';
        }
        button.title = newState ? 'Remove from Wishlist' : 'Add to Wishlist';

        // Show success notification
        const Toast = Swal.mixin({
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true,
            customClass: {
                popup: 'colored-toast'
            }
        });

        Toast.fire({
            icon: 'success',
            title: data.message
        });

        // Update wishlist count in header
        const wishlistCountElement = document.getElementById('wishlistCount');
        if (wishlistCountElement) {
            const currentCount = parseInt(wishlistCountElement.textContent) || 0;
            wishlistCountElement.textContent = newState ? currentCount + 1 : currentCount - 1;
        }
    } catch (error) {
        
        // Show error notification
        const Toast = Swal.mixin({
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            customClass: {
                popup: 'colored-toast'
            }
        });

        Toast.fire({
            icon: 'error',
            title: error.message || 'Something went wrong! Please try again.'
        });

        // Reset button state on error
        const isActive = button.classList.contains('active');
        const heartIcon = button.querySelector('i');
        if (heartIcon) {
            heartIcon.className = isActive ? 'fas fa-heart text-warning' : 'far fa-heart';
        }
    } finally {
        // Re-enable button
        button.disabled = false;
    }
}

// Function to remove from wishlist
async function removeFromWishlist(productId, button) {
    try {
        if (!button) {
            throw new Error('Button element not found');
        }

        // Disable button to prevent double-clicks
        button.disabled = true;

        // Show confirmation dialog
        const result = await Swal.fire({
            title: 'Remove from Wishlist?',
            text: 'Are you sure you want to remove this item?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, remove it',
            cancelButtonText: 'Cancel'
        });

        if (!result.isConfirmed) {
            button.disabled = false;
            return;
        }

        // Show loading
        const loadingToast = Swal.mixin({
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 1000,
            timerProgressBar: true,
            customClass: {
                popup: 'colored-toast'
            }
        });

        await loadingToast.fire({
            icon: 'info',
            title: 'Removing...'
        });

        // Send DELETE request
        const response = await fetch(`/wishlist/${productId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Failed to remove from wishlist');
        }

        // Remove the product card from the UI with animation
        const productCard = button.closest('.wishlist-card').parentElement;
        if (productCard) {
            productCard.style.transition = 'all 0.3s ease';
            productCard.style.transform = 'scale(0.9)';
            productCard.style.opacity = '0';
            
            setTimeout(() => {
                productCard.remove();
                
                // Update wishlist count
                const countElement = document.querySelector('.wishlist-header .text-muted span');
                if (countElement) {
                    const currentCount = parseInt(countElement.textContent) || 0;
                    if (currentCount > 0) {
                        countElement.textContent = `${currentCount - 1} items saved`;
                    }
                }

                // Check if wishlist is empty
                const wishlistContainer = document.getElementById('wishlist-items-container');
                if (!wishlistContainer || !wishlistContainer.children.length) {
                    // Show empty state
                    const container = document.querySelector('.container');
                    if (container) {
                        container.innerHTML = `
                            <div class="empty-wishlist">
                                <div class="empty-content">
                                    <div class="empty-icon mb-4">
                                        <i class="far fa-heart"></i>
                                    </div>
                                    <h3 class="fw-semibold mb-3">No Saved Items</h3>
                                    <p class="text-muted mb-4">Your wishlist is currently empty. Discover our curated selection of dishes and save your favorites for later.</p>
                                    <a href="/menu" class="btn btn-primary explore-btn">
                                        View Menu
                                    </a>
                                </div>
                            </div>
                        `;
                    }
                }
            }, 300);
        }

        // Show success notification
        const Toast = Swal.mixin({
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true,
            customClass: {
                popup: 'colored-toast'
            }
        });

        Toast.fire({
            icon: 'success',
            title: 'Removed from wishlist'
        });

        // Update wishlist count in header
        const wishlistCountElement = document.getElementById('wishlistCount');
        if (wishlistCountElement) {
            const currentCount = parseInt(wishlistCountElement.textContent) || 0;
            if (currentCount > 0) {
                wishlistCountElement.textContent = currentCount - 1;
            }
        }
    } catch (error) {
        
        // Show error notification
        const Toast = Swal.mixin({
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            customClass: {
                popup: 'colored-toast'
            }
        });

        Toast.fire({
            icon: 'error',
            title: error.message || 'Failed to remove from wishlist. Please try again.'
        });
    } finally {
        // Re-enable button
        button.disabled = false;
    }
}

// Function to initialize wishlist buttons
function initWishlistButtons() {
    const wishlistButtons = document.querySelectorAll('.wishlist-btn');
    wishlistButtons.forEach(button => {
        const productId = button.dataset.productId;
        if (productId) {
            button.onclick = () => toggleWishlist(productId, button);
        }
    });
}

// Function to initialize delete buttons
function initDeleteButtons() {
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach(button => {
        const productId = button.dataset.productId;
        if (productId) {
            button.onclick = () => removeFromWishlist(productId, button);
        }
    });
}

// Initialize wishlist and delete buttons when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initWishlistButtons();
    initDeleteButtons();
});
