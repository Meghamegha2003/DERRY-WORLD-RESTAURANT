// Client-side JS for foodDetails.ejs

// Ensure addToCart is available immediately
if (typeof window.addToCart === 'undefined') {
    // Add to Cart function - Define globally first
    window.addToCart = async function(productId, event) {
    const addButton = event ? event.currentTarget : document.querySelector('.btn-add-cart');
    addButton.disabled = true;
    addButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Adding...';

    try {
        const res = await fetch(`/cart/add/${productId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: 1 }),
            credentials: 'include'
        });

        if (!res.ok) throw new Error('Failed to add to cart');
        const data = await res.json();

        // ✅ Show success message and then reload the page
        Swal.fire({
            icon: 'success',
            title: 'Added to Cart!',
            showConfirmButton: false,
            timer: 1000
        }).then(() => {
            window.location.reload();
        });

    } catch (err) {
        addButton.disabled = false;
        addButton.innerHTML = '<i class="fas fa-shopping-cart me-2"></i>Add to Cart';
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'Failed to add item to cart.',
            confirmButtonColor: '#ffbe33'
        });
    }
    };
}

// Initialize page functionality
(function () {
  const PRODUCT_ID = document
    .querySelector("[data-product-id]")
    .getAttribute("data-product-id");


  // Polling for updates
  (function pollUpdate() {
    async function update() {
      try {
        const res = await fetch(`/api/food/${PRODUCT_ID}/status`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Bad response");
        const data = await res.json();
        if (!data.success) throw new Error("API error");
        // price update
        const priceWrap = document.querySelector(
          ".price-section .price-wrapper"
        );
        if (priceWrap) {
          let html;
          if (
            data.product.offerDetails &&
            data.product.offerDetails.finalPrice < data.product.regularPrice
          ) {
            html = `<span class="regular-price strike">₹${
              data.product.regularPrice
            }</span><span class="sale-price">₹${Math.round(
              data.product.offerDetails.finalPrice
            )}</span>`;
          } else if (data.product.salesPrice < data.product.regularPrice) {
            html = `<span class="regular-price strike">₹${
              data.product.regularPrice
            }</span><span class="sale-price">₹${Math.round(
              data.product.salesPrice
            )}</span>`;
          } else {
            html = `<span class="current-price">₹${data.product.regularPrice}</span>`;
          }
          priceWrap.innerHTML = html;
        }
        // cart status update
        const btn = document.querySelector(".btn-add-cart");
        if (data.product.inCart) {
          btn.disabled = false;
          btn.innerHTML =
            '<i class="fas fa-shopping-cart me-2"></i>View in Cart';
          btn.onclick = () => (window.location.href = "/cart");
        }
      } catch (e) {
        // Polling error - silently continue
      }
    }
    update();
    setInterval(update, 10000);
  })();

  // Global variables for zoom functionality
  let zoomInitialized = false;
  let thumbnailsInitialized = false;

  // Zoom & thumbnails functionality - simplified approach
  function initializeZoom() {
    if (zoomInitialized) return;
    
    const zoomLevel = 3;
    const mainImage = document.querySelector(".main-image");
    const zoomLens = document.querySelector(".zoom-lens");
    const zoomResult = document.querySelector(".zoom-result");
    const container = document.querySelector(".product-image-container");
    
    if (!mainImage || !zoomLens || !zoomResult || !container) {
      return;
    }

    function moveLens(e) {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const lensWidth = 80;
      const lensHeight = 80;
      
      const x = Math.min(
        Math.max(e.clientX - rect.left - lensWidth / 2, 0),
        rect.width - lensWidth
      );
      const y = Math.min(
        Math.max(e.clientY - rect.top - lensHeight / 2, 0),
        rect.height - lensHeight
      );
      
      zoomLens.style.left = x + "px";
      zoomLens.style.top = y + "px";
      zoomResult.style.backgroundImage = `url('${mainImage.src}')`;
      zoomResult.style.backgroundSize = `${
        mainImage.offsetWidth * zoomLevel
      }px ${mainImage.offsetHeight * zoomLevel}px`;
      zoomResult.style.backgroundPosition = `-${x * zoomLevel}px -${
        y * zoomLevel
      }px`;
    }

    function showZoom() {
      if (window.innerWidth > 1200) {
        zoomLens.style.display = "block";
        zoomResult.style.display = "block";
      }
    }

    function hideZoom() {
      zoomLens.style.display = "none";
      zoomResult.style.display = "none";
    }

    // Store functions globally for cleanup
    window.zoomFunctions = { moveLens, showZoom, hideZoom };

    container.addEventListener("mousemove", moveLens);
    container.addEventListener("mouseenter", showZoom);
    container.addEventListener("mouseleave", hideZoom);

    zoomInitialized = true;
  }

  function initializeThumbnails() {
    if (thumbnailsInitialized) return;
    
    const mainImage = document.querySelector(".main-image");
    const zoomResult = document.querySelector(".zoom-result");
    
    if (!mainImage) return;

    document.querySelectorAll(".thumbnail").forEach((thumb) => {
      thumb.addEventListener("click", function(e) {
        e.preventDefault();
        
        if (this.src) {
          mainImage.src = this.src;
          
          if (zoomResult) {
            zoomResult.style.backgroundImage = `url('${this.src}')`;
          }
          
          document.querySelectorAll(".thumbnail").forEach((t) => {
            t.classList.remove("active");
          });
          this.classList.add("active");
        }
      });
    });

    thumbnailsInitialized = true;
  }

  function resetZoomAndThumbnails() {
    zoomInitialized = false;
    thumbnailsInitialized = false;
    
    // Clean up zoom result
    const zoomResult = document.querySelector(".zoom-result");
    const zoomLens = document.querySelector(".zoom-lens");
    if (zoomResult) zoomResult.style.display = "none";
    if (zoomLens) zoomLens.style.display = "none";
    
    // Re-initialize
    setTimeout(() => {
      initializeZoom();
      initializeThumbnails();
    }, 50);
  }

  // Initialize on page load
  document.addEventListener('DOMContentLoaded', function() {
    initializeZoom();
    initializeThumbnails();
  });

  // Also initialize immediately if DOM is already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initializeZoom();
      initializeThumbnails();
    });
  } else {
    initializeZoom();
    initializeThumbnails();
  }

  // Watch for cart button changes and reset zoom/thumbnails
  setInterval(function() {
    const button = document.querySelector('.btn-add-cart');
    if (button && (button.textContent.includes('View in Cart') || button.textContent.includes('Out of Stock') || button.textContent.includes('Unavailable'))) {
      if (!thumbnailsInitialized || !zoomInitialized) {
        resetZoomAndThumbnails();
      }
    }
  }, 1000);
})();
