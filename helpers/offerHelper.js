const Offer = require("../models/offerSchema");

const getBestOffer = async (product) => {
    try {
        if (!product || !product._id) {
            console.error("Invalid product object:", product);
            return {
                hasOffer: false,
                regularPrice: product?.regularPrice || 0,
                finalPrice: product?.salesPrice || product?.regularPrice || 0,
                discountPercentage: 0,
                offer: null
            };
        }

        const currentDate = new Date();
        const categoryId = product.category ? product.category._id || product.category : null;

        // Fetch all applicable offers (product & category)
        const offers = await Offer.find({
            isActive: true,
            validFrom: { $lte: currentDate },
            validUntil: { $gte: currentDate },
            $or: [
                { targetProducts: product._id },
                { targetCategories: categoryId }
            ]
        }).sort({ discountValue: -1 }); // Sort by highest discount first

        if (!offers || offers.length === 0) {
            return {
                hasOffer: false,
                regularPrice: product.regularPrice,
                finalPrice: product.salesPrice || product.regularPrice,
                discountPercentage: product.salesPrice ? 
                    Math.round(((product.regularPrice - product.salesPrice) / product.regularPrice) * 100) : 0,
                bestOffer: null
            };
        }

        // Get base price (use sales price if available, otherwise regular price)
        const basePrice = product.salesPrice && product.salesPrice < product.regularPrice
            ? product.salesPrice
            : product.regularPrice;

        // Calculate discount for each offer and find the best one
        const bestOffer = offers.reduce((best, current) => {
            let currentDiscount = 0;
            
            if (current.discountType === 'percentage') {
                currentDiscount = (basePrice * current.discountValue) / 100;
                if (current.maxDiscount) {
                    currentDiscount = Math.min(currentDiscount, current.maxDiscount);
                }
            } else { // fixed amount
                currentDiscount = Math.min(current.discountValue, basePrice); // Don't exceed item price
            }

            if (!best.discount || currentDiscount > best.discount) {
                return { offer: current, discount: currentDiscount };
            }
            return best;
        }, { offer: null, discount: 0 });

        if (!bestOffer.offer) {
            return {
                hasOffer: false,
                regularPrice: product.regularPrice,
                finalPrice: basePrice,
                discountPercentage: product.salesPrice ? 
                    Math.round(((product.regularPrice - product.salesPrice) / product.regularPrice) * 100) : 0,
                bestOffer: null
            };
        }

        const discountPercentage = Math.round((bestOffer.discount / basePrice) * 100);
        const finalPrice = Math.max(0, basePrice - bestOffer.discount);

        return {
            hasOffer: true,
            regularPrice: product.regularPrice,
            finalPrice: finalPrice,
            discountPercentage: discountPercentage,
            offer: {
                type: bestOffer.offer.type,
                discountType: bestOffer.offer.discountType,
                discountValue: bestOffer.offer.discountValue,
                maxDiscount: bestOffer.offer.maxDiscount
            }
        };
    } catch (error) {
        console.error("Error calculating best offer:", error);
        return {
            hasOffer: false,
            regularPrice: product?.regularPrice || 0,
            finalPrice: product?.salesPrice || product?.regularPrice || 0,
            discountPercentage: 0,
            offer: null
        };
    }
};

module.exports = { getBestOffer };