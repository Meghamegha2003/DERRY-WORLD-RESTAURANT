/**
 * Helper functions for order calculations
 */

/**
 * Calculate order totals including subtotal, delivery charges, and discounts
 * @param {Object} cart - The cart object with items and pricing
 * @returns {Promise<Object>} Object containing calculated totals
 */
const { getBestOffer } = require('./offerHelper');

const calculateOrderTotals = async (cart) => {
    try {
        if (!cart || !cart.items || cart.items.length === 0) {
            throw new Error('Cart is empty or invalid');
        }

        // Calculate subtotal from cart items with best offers applied
        let subtotal = 0;
        let totalOfferDiscount = 0;
        
        // Process each item to apply the best offer
        for (const item of cart.items) {
            const { finalPrice, regularPrice } = await getBestOffer(item.product);
            const itemPrice = finalPrice || regularPrice || 0;
            subtotal += itemPrice * item.quantity;
            
            // Calculate total offer discount for this item
            if (finalPrice < regularPrice) {
                totalOfferDiscount += (regularPrice - finalPrice) * item.quantity;
            }
        }

        // Calculate delivery charge (free for orders above 500, else 50)
        const deliveryCharge = subtotal > 500 ? 0 : 50;
        
        // Get coupon discount if applied
        const couponDiscount = cart.couponDiscount || 0;
        
        // Calculate total after all discounts
        const total = Math.max(0, subtotal + deliveryCharge - couponDiscount);

        return {
            subtotal: parseFloat(subtotal.toFixed(2)),
            deliveryCharge: parseFloat(deliveryCharge.toFixed(2)),
            couponDiscount: parseFloat(couponDiscount.toFixed(2)),
            offerDiscount: parseFloat(totalOfferDiscount.toFixed(2)),
            total: parseFloat(total.toFixed(2))
        };
    } catch (error) {
        console.error('Error in calculateOrderTotals:', error);
        throw error;
    }
};

/**
 * Get the next available order status based on current status
 * @param {string} currentStatus - Current order status
 * @returns {string[]} Array of next available statuses
 */
const getNextStatuses = (currentStatus) => {
    const statusFlow = {
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered', 'Cancelled'],
        'Delivered': ['Returned'],
        'Returned': [],
        'Cancelled': []
    };
    
    return statusFlow[currentStatus] || [];
};

/**
 * Get CSS class for order status badge
 * @param {string} status - Order status
 * @returns {string} CSS class for the status badge
 */
const getStatusBadgeClass = (status) => {
    const statusClasses = {
        'Pending': 'badge-warning',
        'Processing': 'badge-info',
        'Shipped': 'badge-primary',
        'Delivered': 'badge-success',
        'Returned': 'badge-secondary',
        'Cancelled': 'badge-danger'
    };
    
    return statusClasses[status] || 'badge-secondary';
};

module.exports = {
    calculateOrderTotals,
    getNextStatuses,
    getStatusBadgeClass
};
