const Product = require("../models/productSchema");
const Offer = require('../models/offerSchema');

class OfferService {
    static async getBestOffer(product) {
        try {
            // Get product-specific offers
            const now = new Date();
            // Ensure category id is always correct
            const categoryId = product.category?._id || product.category;

            const productOffers = await Offer.find({
                targetProducts: product._id,
                isActive: true,
                validFrom: { $lte: now },
                validUntil: { $gte: now }
            });

            const categoryOffers = await Offer.find({
                targetCategories: categoryId,
                isActive: true,
                validFrom: { $lte: now },
                validUntil: { $gte: now }
            });

            // Combine all applicable offers
            const allOffers = [...productOffers, ...categoryOffers];

            // If no offers found, return original prices
            if (!allOffers.length) {
                return {
                    regularPrice: product.regularPrice,
                    salesPrice: product.salesPrice,
                    bestOffer: null,
                    finalPrice: product.salesPrice || product.regularPrice
                };
            }

            // Always use sales price as base if it exists, otherwise regular price
            let basePrice = (product.salesPrice && product.salesPrice > 0) ? product.salesPrice : product.regularPrice;

            // Find the offer that gives the maximum discount
            let bestOffer = null;
            let maxDiscount = 0;
            let finalPrice = basePrice;

            for (const offer of allOffers) {
                let discountAmount;

                if (offer.discountType === 'percentage') {
                    discountAmount = (basePrice * offer.discountValue) / 100;
                    if (offer.maxDiscount) {
                        discountAmount = Math.min(discountAmount, offer.maxDiscount);
                    }
                } else {
                    discountAmount = offer.discountValue;
                }

                // Check if this offer gives better discount
                if (discountAmount > maxDiscount) {
                    maxDiscount = discountAmount;
                    bestOffer = offer;
                    finalPrice = Math.max(basePrice - discountAmount, 0);
                }
            }

            return {
                regularPrice: product.regularPrice,
                salesPrice: product.salesPrice,
                bestOffer,
                finalPrice
            };
        } catch (error) {
            return {
                regularPrice: product.regularPrice,
                salesPrice: product.salesPrice,
                bestOffer: null,
                finalPrice: product.salesPrice || product.regularPrice
            };
        }
    }

    static async getProductWithOffer(productId) {
        try {
            const product = await Product.findById(productId)
                .populate('category')
                .lean();

            if (!product) {
                throw new Error('Product not found');
            }

            const offerDetails = await this.getBestOffer(product);
            return {
                ...product,
                offerDetails
            };
        } catch (error) {
            throw error;
        }
    }

    static async updateProductPrices(offer) {
        try {
            // Get all products affected by this offer
            const products = await Product.find({
                $or: [
                    { _id: { $in: offer.targetProducts || [] } },
                    { category: { $in: offer.targetCategories || [] } }
                ]
            });

            // Update each product's offer price
            for (const product of products) {
                const offerResult = await this.getBestOffer(product);
                
                // Only update if there's a valid offer price
                if (offerResult.bestOffer) {
                    product.offerPrice = offerResult.finalPrice;
                    await product.save();
                }
            }

            return true;
        } catch (error) {
            throw error;
        }
    }

    static async calculateOrderTotals(cart) {
        let subtotal = 0;
        let total = 0;
        let totalDiscount = 0;

        for (const item of cart.items) {
            const product = item.product;
            const quantity = item.quantity;
            
            // Get the best offer for the product
            const bestOffer = await this.getBestOffer(product);
            
            let itemPrice = product.regularPrice;
            if (product.salesPrice && product.salesPrice < itemPrice) {
                itemPrice = product.salesPrice;
            }

            let discountedPrice = itemPrice;
            if (bestOffer && bestOffer.bestOffer) {
                let discountAmount;

                if (bestOffer.bestOffer.discountType === 'percentage') {
                    discountAmount = (itemPrice * bestOffer.bestOffer.discountValue) / 100;
                    if (bestOffer.bestOffer.maxDiscount) {
                        discountAmount = Math.min(discountAmount, bestOffer.bestOffer.maxDiscount);
                    }
                } else {
                    discountAmount = bestOffer.bestOffer.discountValue;
                }
                discountedPrice = itemPrice - discountAmount;
                totalDiscount += (discountAmount * quantity);
            }

            subtotal += (itemPrice * quantity);
            total += (discountedPrice * quantity);
        }

        return {
            subtotal: parseFloat(subtotal.toFixed(2)),
            totalDiscount: parseFloat(totalDiscount.toFixed(2)),
            total: parseFloat(total.toFixed(2))
        };
    }
}

module.exports = OfferService;