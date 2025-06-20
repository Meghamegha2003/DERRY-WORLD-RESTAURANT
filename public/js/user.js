// Handle user logout with SweetAlert2
function handleLogout() {
    Swal.fire({
        title: 'Ready to Leave?',
        text: "Are you sure you want to logout?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, logout!',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            // Send logout request
            fetch('/logout', {
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
                        title: 'Logged Out!',
                        text: 'You have been successfully logged out.',
                        icon: 'success',
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => {
                        window.location.href = '/login';
                    });
                } else {
                    throw new Error(data.message || 'Logout failed');
                }
            })
            .catch(error => {
                Swal.fire({
                    title: 'Error!',
                    text: error.message || 'Something went wrong during logout.',
                    icon: 'error',
                    confirmButtonText: 'Ok'
                });
            });
        }
    });
}

// Enhanced Image zoom functionality
document.addEventListener('DOMContentLoaded', function() {
    const zoomContainer = document.querySelector('.zoom-container');
    if (!zoomContainer) return;

    const mainImage = zoomContainer.querySelector('.main-image');
    const magnifier = zoomContainer.querySelector('.magnifier');
    const zoomedImage = document.querySelector('.zoomed-image');
    const zoomModal = document.getElementById('zoomModal');
    const zoomModalImage = document.getElementById('zoomModalImage');
    
    let isZooming = false;
    let isTouchDevice = 'ontouchstart' in window;
    let zoomHintTimeout;

    // Show zoom hint for touch devices
    if (isTouchDevice) {
        const hint = document.createElement('div');
        hint.className = 'zoom-hint';
        hint.textContent = 'Tap to zoom';
        zoomContainer.appendChild(hint);

        // Show hint briefly
        setTimeout(() => {
            hint.classList.add('show');
            zoomHintTimeout = setTimeout(() => {
                hint.classList.remove('show');
            }, 2000);
        }, 1000);
    }

    function getRelativePos(e) {
        const rect = zoomContainer.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function updateZoom(e) {
        if (!isZooming) return;

        const pos = getRelativePos(e);
        const magnifierSize = 150;
        
        // Update magnifier position
        let magnifierX = pos.x - magnifierSize / 2;
        let magnifierY = pos.y - magnifierSize / 2;

        // Constrain magnifier within container
        magnifierX = Math.max(0, Math.min(magnifierX, zoomContainer.offsetWidth - magnifierSize));
        magnifierY = Math.max(0, Math.min(magnifierY, zoomContainer.offsetHeight - magnifierSize));

        magnifier.style.left = magnifierX + 'px';
        magnifier.style.top = magnifierY + 'px';

        // Calculate zoom background position
        const zoomX = (magnifierX / zoomContainer.offsetWidth) * 100;
        const zoomY = (magnifierY / zoomContainer.offsetHeight) * 100;

        zoomedImage.style.backgroundImage = `url(${mainImage.src})`;
        zoomedImage.style.backgroundPosition = `${-zoomX * 4}% ${-zoomY * 4}%`;
        zoomedImage.style.backgroundSize = '400%';
    }

    // Desktop hover zoom
    if (!isTouchDevice) {
        zoomContainer.addEventListener('mouseenter', function(e) {
            if (window.innerWidth <= 1200) return;
            isZooming = true;
            magnifier.style.opacity = '1';
            zoomedImage.style.opacity = '1';
            updateZoom(e);
        });

        zoomContainer.addEventListener('mousemove', function(e) {
            if (window.innerWidth <= 1200) return;
            updateZoom(e);
        });

        zoomContainer.addEventListener('mouseleave', function() {
            isZooming = false;
            magnifier.style.opacity = '0';
            zoomedImage.style.opacity = '0';
        });
    }

    // Modal zoom functionality
    function openZoomModal(imageSrc) {
        const loading = document.querySelector('.zoom-loading');
        if (loading) loading.style.display = 'block';

        zoomModal.style.display = 'block';
        setTimeout(() => zoomModal.classList.add('active'), 10);
        
        // Preload image
        const img = new Image();
        img.onload = function() {
            if (loading) loading.style.display = 'none';
            zoomModalImage.src = imageSrc;
        };
        img.src = imageSrc;
    }

    function closeZoomModal() {
        zoomModal.classList.remove('active');
        setTimeout(() => {
            zoomModal.style.display = 'none';
            zoomModalImage.src = '';
        }, 300);
    }

    // Close modal on background click
    zoomModal.addEventListener('click', function(e) {
        if (e.target === zoomModal) {
            closeZoomModal();
        }
    });

    // Close modal on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && zoomModal.classList.contains('active')) {
            closeZoomModal();
        }
    });

    // Handle touch events for mobile zoom
    if (isTouchDevice) {
        zoomContainer.addEventListener('click', function() {
            openZoomModal(mainImage.src);
        });
    }

    // Clean up
    return () => {
        if (zoomHintTimeout) {
            clearTimeout(zoomHintTimeout);
        }
    };
});