document.addEventListener('DOMContentLoaded', function() {
    // Handle wishlist functionality
    function initWishlistButtons() {
        const wishlistButtons = document.querySelectorAll('.wishlist-btn');
        wishlistButtons.forEach(btn => {
            btn.addEventListener('click', async function(e) {
                e.preventDefault();
                if (!this.dataset.productId) return;

                try {
                    const productId = this.dataset.productId;
                    const response = await fetch(`/wishlist/toggle/${productId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    const data = await response.json();
                    if (data.success) {
                        // Toggle wishlist icon
                        const icon = this.querySelector('i');
                        if (icon) {
                            icon.classList.toggle('bi-heart');
                            icon.classList.toggle('bi-heart-fill');
                        }
                        // Show success message
                        Swal.fire({
                            icon: 'success',
                            title: data.message,
                            showConfirmButton: false,
                            timer: 1500
                        });
                    } else {
                        throw new Error(data.message);
                    }
                } catch (error) {
                    console.error('Error toggling wishlist:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Oops...',
                        text: error.message || 'Failed to update wishlist'
                    });
                }
            });
        });
    }

    // Initialize countdown timers
    function initCountdownTimers() {
        const timerElements = document.querySelectorAll('[data-countdown]');
        timerElements.forEach(element => {
            const endTime = new Date(element.dataset.countdown).getTime();
            
            const timer = setInterval(() => {
                const now = new Date().getTime();
                const distance = endTime - now;

                if (distance < 0) {
                    clearInterval(timer);
                    element.innerHTML = 'EXPIRED';
                    return;
                }

                const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);

                element.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
            }, 1000);
        });
    }

    // Initialize everything
    initWishlistButtons();
    initCountdownTimers();
});