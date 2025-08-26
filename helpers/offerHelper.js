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
        const salePrice = product.salesPrice && product.salesPrice < product.regularPrice 
            ? product.salesPrice 
            : null;

       
        
        const offers = await Offer.find({
            isActive: true,
            validFrom: { $lte: currentDate },
            validUntil: { $gte: currentDate },
            $or: [
                { targetProducts: product._id },
                { targetCategories: categoryId }
            ]
        }).sort({ discountValue: -1 });
        
        console.log('Found', offers.length, 'offers');
        offers.forEach((offer, i) => {
            console.log(`\nOffer ${i + 1}:`);
            console.log('Name:', offer.name);
            console.log('Type:', offer.type);
            console.log('Discount Type:', offer.discountType);
            console.log('Discount Value:', offer.discountValue);
            console.log('Max Discount:', offer.maxDiscount);
            console.log('Target Products:', offer.targetProducts);
            console.log('Target Categories:', offer.targetCategories);
        });

        if (!offers || offers.length === 0) {
            const finalPrice = salePrice || product.regularPrice;
            return {
                hasOffer: false,
                regularPrice: product.regularPrice,
                finalPrice: finalPrice,
                discountPercentage: salePrice ? 
                    Math.round(((product.regularPrice - salePrice) / product.regularPrice) * 100) : 0,
                offer: null
            };
        }

        const bestOffer = offers.reduce((best, current) => {
            const basePrice = salePrice !== null ? salePrice : product.regularPrice;
            let currentPrice = basePrice;
            
            if (current.discountType === 'percentage') {
                const discount = (basePrice * current.discountValue) / 100;
                const maxDiscount = current.maxDiscount || Infinity;
                currentPrice = basePrice - Math.min(discount, maxDiscount);
            } else {
                currentPrice = Math.max(0, basePrice - current.discountValue);
            }

            if (!best.price || currentPrice < best.price) {
                return { 
                    offer: current, 
                    price: currentPrice,
                    discount: basePrice - currentPrice
                };
            }
            return best;
        }, { offer: null, price: null, discount: 0 });

       
        let finalPrice;
        let hasOffer = false;
        let discountPercentage = 0;
        const basePrice = salePrice !== null ? salePrice : product.regularPrice;

        if (bestOffer.offer) {
            finalPrice = bestOffer.price;
            hasOffer = true;
            discountPercentage = Math.round((bestOffer.discount / basePrice) * 100);
        } else if (salePrice !== null) {
            finalPrice = salePrice;
            discountPercentage = Math.round(((product.regularPrice - salePrice) / product.regularPrice) * 100);
        } else {
            finalPrice = product.regularPrice;
        }

        const result = {
            hasOffer,
            regularPrice: product.regularPrice,
            finalPrice: finalPrice,
            discountPercentage: discountPercentage,
            offer: hasOffer ? {
                type: bestOffer.offer.type,
                discountType: bestOffer.offer.discountType,
                discountValue: bestOffer.offer.discountValue,
                maxDiscount: bestOffer.offer.maxDiscount,
                name: bestOffer.offer.name || 'Special Offer'
            } : null
        };
        
       
        
        return result;
    } catch (error) {
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