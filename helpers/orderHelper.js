
const { getBestOffer } = require('./offerHelper');

const calculateOrderTotals = async (cart) => {
    try {
        if (!cart || !cart.items || cart.items.length === 0) {
            throw new Error('Cart is empty or invalid');
        }

        let subtotal = 0;
        let totalOfferDiscount = 0;
        
        for (const item of cart.items) {
            const { finalPrice, regularPrice } = await getBestOffer(item.product);
            const itemPrice = finalPrice || regularPrice || 0;
            subtotal += itemPrice * item.quantity;
            
            if (finalPrice < regularPrice) {
                totalOfferDiscount += (regularPrice - finalPrice) * item.quantity;
            }
        }

        const deliveryCharge = subtotal > 500 ? 0 : 50;
        
        const couponDiscount = cart.couponDiscount || 0;
        
        const total = Math.max(0, subtotal + deliveryCharge - couponDiscount);

        return {
            subtotal: parseFloat(subtotal.toFixed(2)),
            deliveryCharge: parseFloat(deliveryCharge.toFixed(2)),
            couponDiscount: parseFloat(couponDiscount.toFixed(2)),
            offerDiscount: parseFloat(totalOfferDiscount.toFixed(2)),
            total: parseFloat(total.toFixed(2))
        };
    } catch (error) {
        throw error;
    }
};


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
