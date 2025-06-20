const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const jwt = require('jsonwebtoken');
const Order = require('../../models/orderSchema');
const Category = require('../../models/categorySchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const OfferService = require('../../services/offerService');  // Added this line
const mongoose = require('mongoose'); // Import mongoose
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema'); // Added Wallet model import

// Initialize Razorpay
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? 
  new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  }) : null;

// Utility to get unique product count
function getUniqueProductCount(cart) {
  if (!cart || !cart.items) return 0;
  return new Set(cart.items.filter(item => item && item.product).map(item => item.product.toString())).size;
}

const calculateCartCount = async (userId) => {
  try {
    if (!userId) return 0;
    
    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.items) return 0;
    
    // Filter out any invalid items and get unique product count
    const validItems = cart.items.filter(item => 
      item && item.product && item.quantity > 0
    );
    
    // Return the number of unique products
    return getUniqueProductCount(cart);
  } catch (error) {
    console.error('Error calculating cart count:', error);
    return 0;
  }
};

const renderProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;
    let isInWishlist = false;
    let cartItems = [];
    let cartCount = 0;

    // Get product details
    const product = await Product.findById(productId)
      .populate('category')
      .populate('ratings.user', 'name');

    if (!product) {
      return res.status(404).render('error', { 
        message: 'Product not found',
        user: req.user,
        cartCount
      });
    }

    // Get related products
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isBlocked: false,
      isListed: true
    }).limit(4);

    if (req.user) {
      const user = await User.findById(req.user._id);
      
      // Check if product is in wishlist
      isInWishlist = user.wishlist && 
        user.wishlist.some(item => item.product && item.product.toString() === productId);

      // Get cart items safely
      const cart = await Cart.findOne({ user: req.user._id });
      if (cart && cart.items && Array.isArray(cart.items)) {
        cartItems = cart.items.map(item => item.product.toString());
        cartCount = await calculateCartCount(req.user._id);
      }
    }

    let isInCart = false;
    if (req.user && cartItems.includes(product._id.toString())) {
      isInCart = true;
    }
    res.render('user/foodDetails', {
      offers,
      product,
      relatedProducts,
      isInWishlist,
      cartItems,
      cartCount,
      user: req.user,
      path: '/food',
      isInCart
    });

  } catch (error) {
    console.error('Error in renderProductDetails:', error);
    res.status(500).render('error', {
      message: 'Error loading product details',
      error: process.env.NODE_ENV === 'development' ? error : {},
      user: req.user,
      cartCount: 0
    });
  }
};

const submitRating = async (req, res) => {
  try {
    const productId = req.params.id;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Invalid rating value' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user has already rated this product
    const existingRatingIndex = product.ratings.findIndex(r => r.user.toString() === req.user._id.toString());

    if (existingRatingIndex !== -1) {
      // Update existing rating
      product.ratings[existingRatingIndex] = {
        user: req.user._id,
        rating: rating,
        review: comment || '',
        createdAt: new Date()
      };
    } else {
      // Add new rating
      product.ratings.push({
        user: req.user._id,
        rating: rating,
        review: comment || '',
        createdAt: new Date()
      });
    }

    // Let the pre-save middleware handle the average calculation
    await product.save();

    res.status(200).json({
      message: 'Rating submitted successfully',
      averageRating: product.averageRating,
      totalRatings: product.totalRatings
    });
  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({
      message: 'Failed to submit rating',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

const calculateCartTotal = async (cart) => {
    let subtotal = 0;
    let deliveryCharge = 40; // Default delivery charge

    if (!cart || !cart.items) {
        return {
            subtotal: 0,
            deliveryCharge: 0,
            total: '0.00'
        };
    }

    // Calculate subtotal
    for (const item of cart.items) {
        if (!item || !item.product) continue;
        
        // Handle both populated and unpopulated product references
        const productId = typeof item.product === 'object' ? item.product._id : item.product;
        if (!productId) continue;

        const product = await Product.findById(productId).populate('category');
        if (product) {
            let itemPrice;
            
            // Get the best offer (either product or category offer)
            const bestOffer = await OfferService.getBestOffer(product);
            
            if (bestOffer && bestOffer.hasOffer) {
                itemPrice = bestOffer.finalPrice;
            }
            // Then check for sales price
            else if (product.salesPrice && product.salesPrice !== product.regularPrice) {
                itemPrice = product.salesPrice;
            }
            // Finally use regular price
            else {
                itemPrice = product.regularPrice;
            }

            subtotal += itemPrice * item.quantity;
        }
    }

    // Apply free delivery for orders above ₹500
    if (subtotal >= 500) {
        deliveryCharge = 0;
    }

    return {
        subtotal,
        deliveryCharge,
        total: (subtotal + deliveryCharge).toFixed(2)
    };
};

const getCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name price salesPrice productImage'
            });

        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cartItems = cart.items || [];
        const total = cartItems.reduce((sum, item) => {
            const price = item.product.salesPrice || item.product.regularPrice;
            return sum + (price * item.quantity);
        }, 0);

        res.json({
            success: true,
            cart: cartItems,
            total,
            cartCount: getUniqueProductCount(cart) // Update to count unique items
        });
    } catch (error) {
        console.error('Error fetching cart data:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch cart data' });
    }
};

const addToCart = async (req, res) => {
    try {
        const productId = req.params.productId;
        const { quantity = 1 } = req.body;
        const userId = req.user._id;

        // Validate product exists and is available
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        if (product.isBlocked || !product.isListed) {
            return res.status(400).json({ success: false, message: 'Product is not available' });
        }

        // Check stock availability
        if (product.quantity < quantity) {
            return res.status(400).json({ success: false, message: `Only ${product.quantity} items available in stock` });
        }

        // Get current offer details for the product
        const offerDetails = await OfferService.getBestOffer(product);
        const productPrice = offerDetails.hasOffer ? offerDetails.finalPrice : product.regularPrice;

        // Find or create cart
        let cart = await Cart.findOne({ user: userId });
        
        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
        }

        // Check if product already exists in cart
        const existingItem = cart.items.find(item => item.product.toString() === productId);

        if (existingItem) {
            // Update quantity if product exists
            existingItem.quantity = quantity;
            existingItem.price = productPrice;
            existingItem.originalPrice = product.regularPrice;
            existingItem.discountPercentage = offerDetails.hasOffer ? offerDetails.discountPercentage : 0;
            
        } else {
            // Add new item if product doesn't exist
            cart.items.push({
                product: productId,
                quantity: quantity,
                price: productPrice,
                originalPrice: product.regularPrice,
                discountPercentage: offerDetails.hasOffer ? offerDetails.discountPercentage : 0
            });
            
        }

        // Calculate cart totals
        const totals = cart.calculateTotals();
        cart.subtotal = totals.subtotal;
        cart.total = totals.total;

        // Save cart
        await cart.save();
        

        // Get unique product count
        const cartCount = getUniqueProductCount(cart);

        // Return updated cart details
        return res.json({
            success: true,
            message: 'Product added to cart successfully',
            cart: {
                items: cart.items,
                subtotal: totals.subtotal,
                total: totals.total,
                deliveryCharge: totals.deliveryCharge,
                couponDiscount: totals.couponDiscount,
                totalSavings: totals.totalSavings,
                itemCount: cartCount // Use unique product count
            },
            cartCount: cartCount // Add this at the top level for frontend
        });

    } catch (error) {
        console.error('Error in addToCart:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateCart = async (req, res) => {
    try {
        const userId = req.user._id;  // Convert ObjectId to string
        // Get productId from URL params and quantity from request body
        const productId = req.params.productId;
        const { quantity } = req.body;

        // Validate inputs
        if (!quantity) {
            return res.status(400).json({
                success: false,
                message: 'Quantity is required'
            });
        }

        // Convert quantity to number
        const quantityNum = parseInt(quantity);
        if (isNaN(quantityNum) || quantityNum < 1 || quantityNum > 5) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be between 1 and 5'
            });
        }

        // Find product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Ensure cart exists before availability checks
        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
        }

        // Remove and notify if product unavailable
        if (product.isBlocked || !product.isListed) {
            cart.items = cart.items.filter(item => item.product.toString() !== productId || item.product._id?.toString() !== productId);
            await cart.save();
            return res.status(400).json({
                success: false,
                error: 'This product is no longer available and has been removed from your cart.'
            });
        }

        // Check if requested quantity is available
        if (quantityNum > product.quantity) {
            return res.status(400).json({
                success: false,
                message: `Only ${product.quantity} items available in stock`
            });
        }

        // Cart is already loaded above
        // Calculate price and discount based on product
        const currentPrice = product.salesPrice || product.regularPrice;
        const originalPrice = product.regularPrice;
        const discountPercentage = product.salesPrice ? 
            Math.round((1 - product.salesPrice/product.regularPrice) * 100) : 0;

        // Find item in cart using ObjectId comparison
        const cartItemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId.toString()
        );

        if (cartItemIndex > -1) {
            // Update existing item
            cart.items[cartItemIndex].quantity = quantityNum;
            cart.items[cartItemIndex].price = currentPrice;
            cart.items[cartItemIndex].originalPrice = originalPrice;
            cart.items[cartItemIndex].discountPercentage = discountPercentage;
        } else {
            // Add new item
            cart.items.push({
                product: productId.toString(),  // Store product ID as string
                quantity: quantityNum,
                price: currentPrice,
                originalPrice: originalPrice,
                discountPercentage: discountPercentage
            });
        }

        // Save the updated cart
        await cart.save();

        // Calculate new cart count and totals
        const cartCount = getUniqueProductCount(cart);
        const totals = cart.calculateTotals();

        // Update res.locals and req.user
        res.locals.cartCount = cartCount;
        req.user.cartCount = cartCount;

        res.json({
            success: true,
            message: 'Cart updated successfully',
            cartCount,
            totals
        });

    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update cart',
            error: error.message
        });
    }
};

const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user._id;


        // Find the cart
        const cart = await Cart.findOne({ user: userId });

        if (!cart) {
            return res.status(404).json({
                success: false,
                error: 'Cart not found'
            });
        }

        // Find the item index
        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Product not found in cart'
            });
        }

        // Remove the item
        cart.items.splice(itemIndex, 1);

        // Save cart
        await cart.save();

        // Calculate new totals
        const totals = cart.calculateTotals();

        // Return updated cart info
        res.json({
            success: true,
            subtotal: totals.subtotal,
            total: totals.total,
            deliveryCharge: totals.deliveryCharge,
            itemCount: getUniqueProductCount(cart)
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to remove item from cart'
        });
    }
};

const placeOrder = async (req, res) => {
  try {
       const { addressId, paymentMethod } = req.body;
    const userId = req.user._id.toString();

    const user = await User.findById(userId);
    const cart = await Cart.findOne({ user: userId });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }

    // Calculate total
    const total = cart.items.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    // Create order
    const order = new Order({
      user: userId,
      items: cart.items,
      address: address,
      total: total,
      paymentMethod: paymentMethod,
      status: 'Pending'
    });

    await order.save();
    
    // Clear cart
    const cartToClear = await Cart.findOne({ user: userId });
    if (cartToClear) {
      cartToClear.items = [];
      cartToClear.totalAmount = 0;
      await cartToClear.save();
    }

    res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: order._id
    });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ success: false, message: 'Error placing order' });
  }
};

const getWishlist = async (req, res) => {
    try {
        const userId = req.user._id;

        // Get user with populated wishlist
        const user = await User.findById(userId)
            .populate({
                path: 'wishlist.product',
                model: 'Product',
                select: 'name productImage salesPrice regularPrice description isBlocked ratings',
                populate: {
                    path: 'ratings',
                    model: 'Rating'
                }
            });

        if (!user) {
            return res.redirect('/');
        }

        // Get cart count
        const cartCount = await calculateCartCount(userId);

        // Filter out any wishlist items where the product has been deleted
        const validWishlist = user.wishlist
            .filter(item => item.product && !item.product.isBlocked)
            .map(item => item.product);

        res.render('user/wishlist', {
        offers,
            wishlistItems: validWishlist || [],
            user: req.user,
            cartCount,
            path: '/wishlist'
        });
    } catch (error) {
        console.error('Error getting wishlist:', error);
        res.status(500).render('user/error', {
            message: 'Unable to get wishlist',
            error: process.env.NODE_ENV === 'development' ? error : {},
            cartCount: 0,
            user: req.user,
            path: '/wishlist'
        });
    }
};

const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if product is already in wishlist
    const isInWishlist = user.wishlist.some(item => item.product && item.product.toString() === productId);
    if (isInWishlist) {
      return res.status(400).json({
        success: false,
        message: 'Product is already in wishlist'
      });
    }

    // Add to wishlist
    user.wishlist.push({ product: productId });
    await user.save();

    res.json({
      success: true,
      action: 'added',
      message: 'Product added to wishlist'
    });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).render('user/error', {
      message: 'Unable to add product to wishlist',
      error: process.env.NODE_ENV === 'development' ? error : {},
      cartCount: 0,
      user: req.user
    });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.body;  // Get productId from request body
    const userId = req.user._id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove from wishlist
    user.wishlist = user.wishlist.filter(item => item.product.toString() !== productId);
    await user.save();

    res.json({
      success: true,
      action: 'removed',
      message: 'Product removed from wishlist'
    });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).render('user/error', {
      message: 'Unable to remove product from wishlist',
      error: process.env.NODE_ENV === 'development' ? error : {},
      cartCount: 0,
      user: req.user
    });
  }
};

const toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Find user and populate wishlist
    const user = await User.findById(userId).populate('wishlist.product');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Initialize wishlist array if it doesn't exist
    if (!user.wishlist) {
      user.wishlist = [];
    }

    // Check if product is already in wishlist
    const isInWishlist = user.wishlist.some(item => 
      item && item.product && item.product._id.toString() === productId
    );

    if (isInWishlist) {
      // Remove from wishlist
      user.wishlist = user.wishlist.filter(item => 
        item && item.product && item.product._id.toString() !== productId
      );
      await user.save();
      
      // Get updated wishlist with populated data
      const updatedUser = await User.findById(userId).populate('wishlist.product');
      
      return res.json({
        success: true,
        action: 'removed',
        message: 'Product removed from wishlist',
        wishlist: updatedUser.wishlist.map(item => item.product)
      });
    } else {
      // Add to wishlist
      user.wishlist.push({ product: productId });
      await user.save();
      
      // Get updated wishlist with populated data
      const updatedUser = await User.findById(userId).populate('wishlist.product');
      
      return res.json({
        success: true,
        action: 'added',
        message: 'Product added to wishlist',
        wishlist: updatedUser.wishlist.map(item => item.product)
      });
    }
  } catch (error) {
    console.error('Error in toggleWishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to update wishlist',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

const renderCheckoutPage = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        
        // Get user with wallet
        const user = await User.findById(userId).populate('wallet');
        
        // Get wallet balance
        let walletBalance = 0;
        if (user.wallet) {
            const wallet = await Wallet.findById(user.wallet._id);
            if (wallet) {
                walletBalance = wallet.balance;
            }
        }
        
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart || !cart.items || cart.items.length === 0) {
            req.flash('error', 'Your cart is empty');
            return res.redirect('/cart');
        }

        // Calculate prices with offers for each item
        const itemsWithOffers = await Promise.all(cart.items.map(async (item) => {
            // Get the product details and best offer
            const offerDetails = await OfferService.getBestOffer(item.product);
            
            // Calculate the final price considering offers (must match UI logic)
            let finalPrice;
            if (offerDetails && offerDetails.finalPrice) {
                finalPrice = offerDetails.finalPrice;
            } else if (item.product.salesPrice && item.product.salesPrice < item.product.regularPrice) {
                finalPrice = item.product.salesPrice;
            } else {
                finalPrice = item.product.regularPrice;
            }
            
            const productObj = {
                ...item.product.toObject(),
                displayImage: item.product.productImage && item.product.productImage.length > 0 
                    ? item.product.productImage[0] 
                    : '/images/placeholder.jpg',
                offerDetails
            };

            // Update the cart item's price to reflect any offers
            item.price = finalPrice;
            item.originalPrice = item.product.regularPrice;
            item.discountPercentage = ((item.originalPrice - finalPrice) / item.originalPrice) * 100;

            return {
                product: productObj,
                quantity: item.quantity,
                price: item.price,
                originalPrice: item.originalPrice,
                discountPercentage: item.discountPercentage
            };
        }));

       
        // Save the updated cart with new prices
        await cart.save();

        // Calculate totals
        const totals = cart.calculateTotals();
       
        // Add totals to cart object
        cart.subtotal = totals.subtotal;
        cart.deliveryCharge = totals.deliveryCharge;
        cart.total = totals.total;

        // Get unique product count
        const cartCount = getUniqueProductCount(cart);

        res.render('user/checkout', {
            offers,
            user: {
                name: user.name,
                email: user.email,
                wallet: walletBalance
            },
            addresses: user.addresses || [],
            cart: {
                ...cart.toObject(),
                items: itemsWithOffers
            },
            subtotal: totals.subtotal,
            deliveryCharge: totals.deliveryCharge,
            total: totals.total,
            pageTitle: 'Checkout'
        });
    } catch (error) {
        console.error('Error rendering checkout page:', error);
        req.flash('error', 'Failed to load checkout page');
        res.redirect('/cart');
    }
};

const processCheckout = async (req, res) => {
  try {
    const { addressId, paymentMethod } = req.body;
    const userId = req.user._id.toString();

    // Validate address
    if (!addressId) {
      return res.status(400).json({ error: 'Please select a delivery address' });
    }

    // Get user with cart items and selected address
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ user: userId }).populate('items.product');

    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    // Validate cart
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Find selected address
    const deliveryAddress = user.addresses.find(addr => addr._id.toString() === addressId);
    if (!deliveryAddress) {
      return res.status(400).json({ error: 'Selected address not found' });
    }

    // Check product availability
    const unavailableProducts = [];
    for (const item of cart.items) {
      const product = await Product.findById(item.product._id);
      if (!product || !product.isListed || product.isBlocked || product.quantity < item.quantity) {
        unavailableProducts.push({
          name: product ? product.name : 'Unknown Product',
          reason: !product ? 'Product not found' :
                  !product.isListed ? 'No longer available' :
                  product.isBlocked ? 'Product unavailable' :
                  `Only ${product.quantity} items available`
        });
      }
    }

    if (unavailableProducts.length > 0) {
      return res.status(400).json({
        error: 'Some products in your cart are unavailable',
        unavailableProducts: unavailableProducts.map(p => `${p.name} - ${p.reason}`)
      });
    }

    // Calculate total amount with offers
    let subtotal = 0;
    const orderItems = await Promise.all(cart.items.map(async (item) => {
      // Get the product details and best offer
      const product = await Product.findById(item.product._id);
      if (!product) {
        throw new Error(`Product not found: ${item.product._id}`);
      }

      // Calculate price with offer
      const offerDetails = await OfferService.getBestOffer(product);
      const priceAfterOffer = offerDetails.finalPrice;
      const total = priceAfterOffer * item.quantity;
      subtotal += total;
      
      // Ensure productImage is always an array
      const images = Array.isArray(product.productImage) 
        ? product.productImage 
        : product.productImage ? [product.productImage] : [];
      
      return {
        product: product._id,
        quantity: item.quantity,
        price: priceAfterOffer,
        originalPrice: product.salesPrice,
        total: total,
        name: product.name,
        image: images
      };
    }));

    const deliveryCharge = subtotal >= 500 ? 0 : 40;
    const total = subtotal - (cart.couponDiscount || 0) + deliveryCharge;

    // Format address according to schema
    const formattedAddress = {
      addressType: deliveryAddress.addressType || 'Home',
      fullName: deliveryAddress.fullName,
      phone: deliveryAddress.phone,
      addressLine1: deliveryAddress.addressLine1,
      addressLine2: deliveryAddress.addressLine2,
      city: deliveryAddress.city,
      state: deliveryAddress.state,
      pincode: deliveryAddress.pincode
    };

    // Convert payment method to lowercase to match enum
    const formattedPaymentMethod = paymentMethod.toLowerCase();

    // Create order in database
    const order = new Order({
      user: userId,
      items: orderItems.map(item => ({
        product: item.product,
        quantity: item.quantity,
        price: item.price,
        status: 'Processing'
      })),
      shippingAddress: formattedAddress,
      subtotal: subtotal,
      couponDiscount: cart.couponDiscount || 0,
      couponCode: cart.appliedCoupon,
      deliveryCharge: deliveryCharge,
      total: total,
      paymentMethod: formattedPaymentMethod,
      paymentStatus: formattedPaymentMethod === 'cod' ? 'Pending' : 'Pending',
      status: 'Processing'
    });
    await order.save();

    if (formattedPaymentMethod === 'online') {
      return res.json({
        success: true,
        orderId: order._id.toString(),
        total: total
      });
    } else {
      // For COD, clear cart and return success
      const cartToClear = await Cart.findOne({ user: userId });
      if (cartToClear) {
        cartToClear.items = [];
        cartToClear.totalAmount = 0;
        cartToClear.couponDiscount = 0;
        cartToClear.appliedCoupon = null;
        await cartToClear.save();
      }

      return res.json({ 
        success: true,
        message: 'Order placed successfully',
        orderId: order._id.toString()
      });
    }
  } catch (error) {
    console.error('Checkout Error:', error);
    res.status(500).json({ error: 'Failed to process checkout. Please try again.' });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  try {
    // Check if Razorpay is configured
    if (!razorpay) {
      return res.status(400).json({ 
        error: 'Online payment is not available at the moment.' 
      });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Find and update order
      const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      order.paymentStatus = 'COMPLETED';
      order.razorpayPaymentId = razorpay_payment_id;
      await order.save();

      // Clear cart
      const cart = await Cart.findOne({ user: req.user._id.toString() });
      if (cart) {
        cart.items = [];
        cart.totalAmount = 0;
        await cart.save();
      }

      return res.json({ success: true });
    } else {
      return res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Payment Verification Error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

const checkProductInCart = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user._id.toString();

        const cart = await Cart.findOne({ user: userId });
        const inCart = cart ? cart.items.some(item => item.product.toString() === productId) : false;

        res.json({ inCart });
    } catch (error) {
        console.error('Error checking cart status:', error);
        res.status(500).json({ 
            error: 'Failed to check cart status',
            inCart: false 
        });
    }
};

const getCartPage = async (req, res) => {
   
    try {
        if (!req.user) {
            return res.redirect('/login');
        }

       
        const cart = await Cart.findOne({ user: req.user._id })
            .populate({
                path: 'items.product',
                select: 'name regularPrice salesPrice productImage category isListed isBlocked quantity',
                populate: [{
                    path: 'category',
                    model: 'Category', // ensure correct model for population
                    select: 'name isBlocked' // Ensure isBlocked is populated
                }]
            });
       

        
        if (!cart || !cart.items || cart.items.length === 0) {
           
            return res.render('user/cart', {
                cartItems: [],
                cart: null,
                subtotal: 0,
                deliveryCharge: 0,
                total: 0,
                user: req.user,
                cartCount: 0,
                path: '/cart'
            });
        }

        

        // Identify and remove items whose category is blocked
        const blockedItems = cart.items.filter(item => item?.product?.category?.isBlocked === true);
        if (blockedItems.length > 0) {
            const blockedIds = blockedItems.map(i => i.product._id.toString());
           
            cart.items = cart.items.filter(item => !blockedIds.includes(item.product._id.toString()));
            await cart.save();
            req.flash && req.flash('info', 'Some items were removed from your cart because their category is blocked.');
        }

        // Filter out unavailable items (do not filter out blocked categories, just unavailable/zero-quantity)
        cart.items = cart.items.filter(item => 
            item.product && 
            !item.product.isBlocked &&
            item.product.isListed && 
            item.product.quantity > 0
        );

        // Process cart items and get offer details
        const cartItems = await Promise.all(cart.items.map(async (item) => {
            // Get offer details for the product
            const offerDetails = await OfferService.getBestOffer(item.product);
             
            // Calculate the final price considering offers (must match UI logic)
            let finalPrice;
            if (offerDetails && offerDetails.finalPrice) {
                finalPrice = offerDetails.finalPrice;
            } else if (item.product.salesPrice && item.product.salesPrice < item.product.regularPrice) {
                finalPrice = item.product.salesPrice;
            } else {
                finalPrice = item.product.regularPrice;
            }
            
            const productObj = {
                ...item.product.toObject(),
                displayImage: item.product.productImage && item.product.productImage.length > 0 
                    ? item.product.productImage[0] 
                    : '/images/placeholder.jpg',
                offerDetails
            };

            // Update the cart item's price to reflect any offers
            item.price = finalPrice;
            item.originalPrice = item.product.regularPrice;
            item.discountPercentage = ((item.originalPrice - finalPrice) / item.originalPrice) * 100;

            return {
                product: productObj,
                quantity: item.quantity,
                price: item.price,
                originalPrice: item.originalPrice,
                discountPercentage: item.discountPercentage
            };
        }));

        
        // Save the updated cart with new prices
        await cart.save();

        // Calculate totals
        const totals = cart.calculateTotals();
       
        // Add totals to cart object
        cart.subtotal = totals.subtotal;
        cart.deliveryCharge = totals.deliveryCharge;
        cart.total = totals.total;

        // Get unique product count
        const cartCount = getUniqueProductCount(cart);

        res.render('user/cart', {
            cartItems,
            cart,
            subtotal: totals.subtotal,
            deliveryCharge: totals.deliveryCharge,
            total: totals.total,
            user: req.user,
            cartCount: cartCount, // Use unique product count
            path: '/cart'
        });
    } catch (error) {
        console.error('[ERROR] Error in getCartPage:', error);
        res.status(500).render('error', {
            error: 'Failed to load cart page',
            user: req.user,
            cartCount: 0
        });
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.user._id;  // No need to convert to string

        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a coupon code'
            });
        }

        // Find cart and populate product details
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Find coupon
        const coupon = await Coupon.findOne({
            code: couponCode.toUpperCase(),
            isActive: true
        });

        if (!coupon) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon code'
            });
        }

        // Validate coupon
        if (!coupon.isValid()) {
            return res.status(400).json({
                success: false,
                message: 'Coupon is not valid'
            });
        }

        // Calculate cart totals before applying coupon
        const cartTotals = await calculateCartTotal(cart);
        
        // Check minimum purchase using correct schema field
        if (cartTotals.subtotal < coupon.minPurchase) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minPurchase} required for this coupon`
            });
        }

        // Calculate discount using schema's method and correct field names
        let discount;
        try {
            discount = coupon.calculateDiscount(cartTotals.subtotal);
        } catch (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Invalid discount calculation'
            });
        }
        // Save all coupon info to cart.appliedCoupon
        cart.appliedCoupon = {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            minPurchase: coupon.minPurchase,
            maxDiscount: coupon.maxDiscount,
            couponId: coupon._id
        };
        cart.couponDiscount = discount;
        await cart.save();

        // Increment coupon usage
        coupon.usedCount += 1;
        await coupon.save();

        // Calculate final cart totals
        const updatedCart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });
        const updatedCartTotals = await calculateCartTotal(updatedCart);

        // Return response with complete cart data
        res.json({
            success: true,
            message: 'Coupon applied successfully',
            cart: {
                subtotal: updatedCartTotals.subtotal,
                deliveryCharge: updatedCartTotals.deliveryCharge,
                total: updatedCartTotals.total,
                appliedCoupon: updatedCart.appliedCoupon,
                couponDiscount: updatedCart.couponDiscount
            }
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply coupon'
        });
    }
};

const removeCoupon = async (req, res) => {
    try {
        const userId = req.user._id.toString();

        // Find cart
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // If there was a coupon applied, decrement its usage count
        if (cart.appliedCoupon) {
            const coupon = await Coupon.findOne({ code: cart.appliedCoupon.code });
            if (coupon && coupon.usedCount > 0) {
                coupon.usedCount -= 1;
                await coupon.save();
            }
        }

        // Remove coupon from cart
        cart.appliedCoupon = null;
        cart.couponDiscount = 0;
        await cart.save();

        res.json({
            success: true,
            message: 'Coupon removed successfully'
        });

    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove coupon'
        });
    }
};

const getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.user._id.toString();

        // Find cart to get subtotal
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        const { subtotal } = await calculateCartTotal(cart);

        // Find valid coupons
        const now = new Date();
        const coupons = await Coupon.find({
            isActive: true,
            startDate: { $lte: now },
            expiryDate: { $gt: now },
            minimumPurchase: { $lte: subtotal }
        }).select('code description discountType discountAmount minimumPurchase maxDiscount usedCount usageLimit');

        // Filter coupons based on usage limit in JavaScript
        const availableCoupons = coupons.filter(coupon => coupon.usedCount < coupon.usageLimit);

        res.json({
            success: true,
            coupons: availableCoupons.map(coupon => ({
                code: coupon.code,
                description: `${coupon.discountType === 'percentage' ? coupon.discountAmount + '% off' : '₹' + coupon.discountAmount + ' off'}`,
                discountType: coupon.discountType,
                discountAmount: coupon.discountAmount,
                minimumPurchase: coupon.minimumPurchase,
                maxDiscount: coupon.maxDiscount
            }))
        });

    } catch (error) {
        console.error('Error getting available coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get available coupons'
        });
    }
};

const calculateCartSummary = (cart) => {
    const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryCharge = subtotal >= 500 ? 0 : 40;
    const couponDiscount = cart.couponDiscount || 0;
    const total = subtotal - couponDiscount + deliveryCharge;
    return {
        subtotal,
        deliveryCharge,
        couponDiscount,
        total,
        appliedCoupon: cart.appliedCoupon || null
    };
};

const incrementCartItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId } = req.params;

        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cartItem = cart.items.find(item => item.product._id.toString() === productId);
        if (!cartItem) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        // Check stock
        if (cartItem.quantity >= 5) {
            return res.status(400).json({ success: false, message: 'Maximum quantity reached' });
        }
        if (cartItem.product.quantity <= cartItem.quantity) {
            return res.status(400).json({ success: false, message: 'No more stock available' });
        }

        cartItem.quantity += 1;
        await cart.save();
        const summary = calculateCartSummary(cart);
        return res.json({ success: true, message: 'Quantity increased', quantity: cartItem.quantity, ...summary });
    } catch (error) {
        console.error('Error incrementing cart item:', error);
        res.status(500).json({ success: false, message: 'Failed to increase quantity' });
    }
};

const decrementCartItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId } = req.params;

        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cartItem = cart.items.find(item => item.product._id.toString() === productId);
        if (!cartItem) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        if (cartItem.quantity <= 1) {
            return res.status(400).json({ success: false, message: 'Minimum quantity is 1' });
        }

        cartItem.quantity -= 1;
        await cart.save();
        const summary = calculateCartSummary(cart);
        return res.json({ success: true, message: 'Quantity decreased', quantity: cartItem.quantity, ...summary });
    } catch (error) {
        console.error('Error decrementing cart item:', error);
        res.status(500).json({ success: false, message: 'Failed to decrease quantity' });
    }
};

module.exports = {
    getUniqueProductCount,
    renderProductDetails,
    submitRating,
    calculateCartTotal,
    getCartPage,
    addToCart,
    updateCart,
    removeFromCart,
    placeOrder,
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    renderCheckoutPage,
    processCheckout,
    verifyRazorpayPayment,
    checkProductInCart,
    applyCoupon,
    removeCoupon,
    getAvailableCoupons,
    calculateCartSummary,
    incrementCartItem,
    decrementCartItem
};