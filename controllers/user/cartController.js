const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const jwt = require("jsonwebtoken");
const Order = require("../../models/orderSchema");
const Category = require("../../models/categorySchema");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const OfferService = require("../../services/offerService");
const mongoose = require("mongoose");
const Coupon = require("../../models/couponSchema");
const Wallet = require("../../models/walletSchema"); 
const { validateAndUpdateCartCoupon } = require("../../helpers/couponHelper");

const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

exports.getUniqueProductCount = function(cart) {
  if (!cart || !cart.items) return 0;
  return new Set(
    cart.items
      .filter((item) => item && item.product)
      .map((item) => item.product.toString())
  ).size;
}

exports.calculateCartCount = async (userId) => {
  try {
    if (!userId) return 0;

    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.items) return 0;

    const validItems = cart.items.filter(
      (item) => item && item.product && item.quantity > 0
    );

    return getUniqueProductCount(cart);
  } catch (error) {
    console.error("Error calculating cart count:", error);
    return 0;
  }
};

exports.renderProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;
    let isInWishlist = false;
    let cartItems = [];
    let cartCount = 0;

    const product = await Product.findById(productId)
      .populate("category")
      .populate("ratings.user", "name");

    if (!product) {
      return res.status(404).render("error", {
        message: "Product not found",
        user: req.user,
        cartCount,
      });
    }

    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isBlocked: false,
      isListed: true,
    }).limit(4);

    if (req.user) {
      const user = await User.findById(req.user._id);


      isInWishlist =
        user.wishlist &&
        user.wishlist.some(
          (item) => item.product && item.product.toString() === productId
        );


      const cart = await Cart.findOne({ user: req.user._id });
      if (cart && cart.items && Array.isArray(cart.items)) {
        cartItems = cart.items.map((item) => item.product.toString());
        cartCount = await calculateCartCount(req.user._id);
      }
    }

    let isInCart = false;
    if (req.user && cartItems.includes(product._id.toString())) {
      isInCart = true;
    }
    res.render("user/foodDetails", {
      offers,
      product,
      relatedProducts,
      isInWishlist,
      cartItems,
      cartCount,
      user: req.user,
      path: "/food",
      isInCart,
    });
  } catch (error) {
    console.error("Error in renderProductDetails:", error);
    res.status(500).render("error", {
      message: "Error loading product details",
      error: process.env.NODE_ENV === "development" ? error : {},
      user: req.user,
      cartCount: 0,
    });
  }
};

exports.submitRating = async (req, res) => {
  try {
    const productId = req.params.id;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Invalid rating value" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const existingRatingIndex = product.ratings.findIndex(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (existingRatingIndex !== -1) {
      product.ratings[existingRatingIndex] = {
        user: req.user._id,
        rating: rating,
        review: comment || "",
        createdAt: new Date(),
      };
    } else {
      product.ratings.push({
        user: req.user._id,
        rating: rating,
        review: comment || "",
        createdAt: new Date(),
      });
    }

    await product.save();

    res.status(200).json({
      message: "Rating submitted successfully",
      averageRating: product.averageRating,
      totalRatings: product.totalRatings,
    });
  } catch (error) {
    console.error("Error submitting rating:", error);
    res.status(500).json({
      message: "Failed to submit rating",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

exports.calculateCartTotal = async (cart) => {
  let subtotal = 0;
  let deliveryCharge = 0; 
  let couponDiscount = 0;
  let validCoupon = null;

  if (!cart || !cart.items) {
    return {
      subtotal: 0,
      deliveryCharge: 0,
      total: "0.00",
      couponDiscount: 0,
      validCoupon: null
    };
  }

  if (cart.appliedCoupon && cart.appliedCoupon.code) {
    try {
      const coupon = await Coupon.findOne({
        code: cart.appliedCoupon.code,
        isActive: true
      });

      if (coupon && coupon.isValid()) {
        validCoupon = {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minPurchase: coupon.minPurchase,
          maxDiscount: coupon.maxDiscount,
          couponId: coupon._id
        };
      } else {
        cart.appliedCoupon = undefined;
        cart.couponDiscount = 0;
        await cart.save();
      }
    } catch (error) {
      console.error('Error validating coupon:', error);
      cart.appliedCoupon = undefined;
      cart.couponDiscount = 0;
      await cart.save();
    }
  }

  for (const item of cart.items) {
    if (!item || !item.product) continue;

    const productId =
      typeof item.product === "object" ? item.product._id : item.product;
    if (!productId) continue;

    const product = await Product.findById(productId).populate("category");
    if (product) {
      let itemPrice;

      const bestOffer = await OfferService.getBestOffer(product);

      if (bestOffer && bestOffer.hasOffer) {
        itemPrice = bestOffer.finalPrice;
      }
      else if (
        product.salesPrice &&
        product.salesPrice !== product.regularPrice
      ) {
        itemPrice = product.salesPrice;
      }
      else {
        itemPrice = product.regularPrice;
      }

      subtotal += itemPrice * item.quantity;
    }
  }

  if (validCoupon) {
    const discount = validCoupon.discountType === 'percentage'
      ? Math.min(
          (subtotal * validCoupon.discountValue) / 100,
          validCoupon.maxDiscount || Infinity
        )
      : Math.min(validCoupon.discountValue, validCoupon.maxDiscount || Infinity);
    
    couponDiscount = Math.max(0, discount);
  }

  const total = Math.max(0, subtotal - couponDiscount + deliveryCharge);

  if (subtotal >= 500) {
    deliveryCharge = 0;
  }

  return {
    subtotal,
    deliveryCharge,
    couponDiscount,
    validCoupon,
    total: total.toFixed(2),
  };
};

exports.addToCart = async (req, res) => {
  try {
    const productId = req.params.productId;
    const { quantity = 1 } = req.body;
    const userId = req.user._id;

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (product.isBlocked || !product.isListed) {
      return res
        .status(400)
        .json({ success: false, message: "Product is not available" });
    }

    if (product.quantity < quantity) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Only ${product.quantity} items available in stock`,
        });
    }

    const offerDetails = await OfferService.getBestOffer(product);
    const productPrice = offerDetails.hasOffer
      ? offerDetails.finalPrice
      : product.regularPrice;

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    const existingItem = cart.items.find(
      (item) => item.product.toString() === productId
    );

    if (existingItem) {
      existingItem.quantity = quantity;
      existingItem.price = productPrice;
      existingItem.originalPrice = product.regularPrice;
      existingItem.discountPercentage = offerDetails.hasOffer
        ? offerDetails.discountPercentage
        : 0;
    } else {
      cart.items.push({
        product: productId,
        quantity: quantity,
        price: productPrice,
        originalPrice: product.regularPrice,
        discountPercentage: offerDetails.hasOffer
          ? offerDetails.discountPercentage
          : 0,
      });
    }

    const totals = cart.calculateTotals();
    cart.subtotal = totals.subtotal;
    cart.total = totals.total;

    await cart.save();

    const cartCount = exports.getUniqueProductCount(cart);

    return res.json({
      success: true,
      message: "Product added to cart successfully",
      cart: {
        items: cart.items,
        subtotal: totals.subtotal,
        total: totals.total,
        deliveryCharge: totals.deliveryCharge,
        couponDiscount: totals.couponDiscount,
        totalSavings: totals.totalSavings,
        itemCount: cartCount, 
      },
      cartCount: cartCount, 
    });
  } catch (error) {
    console.error("Error in addToCart:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

exports.updateCart = async (req, res) => {
  try {
    const userId = req.user._id; 
    const productId = req.params.productId;
    const { quantity } = req.body;

    if (!quantity) {
      return res.status(400).json({
        success: false,
        message: "Quantity is required",
      });
    }

    const quantityNum = parseInt(quantity);
    if (isNaN(quantityNum) || quantityNum < 1 || quantityNum > 5) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be between 1 and 5",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    if (product.isBlocked || !product.isListed) {
      cart.items = cart.items.filter(
        (item) =>
          item.product.toString() !== productId ||
          item.product._id?.toString() !== productId
      );
      await cart.save();
      return res.status(400).json({
        success: false,
        error:
          "This product is no longer available and has been removed from your cart.",
      });
    }

    if (quantityNum > product.quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.quantity} items available in stock`,
      });
    }

    
    const currentPrice = product.salesPrice || product.regularPrice;
    const originalPrice = product.regularPrice;
    const discountPercentage = product.salesPrice
      ? Math.round((1 - product.salesPrice / product.regularPrice) * 100)
      : 0;

    const cartItemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId.toString()
    );

    if (cartItemIndex > -1) {
      cart.items[cartItemIndex].quantity = quantityNum;
      cart.items[cartItemIndex].price = currentPrice;
      cart.items[cartItemIndex].originalPrice = originalPrice;
      cart.items[cartItemIndex].discountPercentage = discountPercentage;
    } else {
      cart.items.push({
        product: productId.toString(), 
        quantity: quantityNum,
        price: currentPrice,
        originalPrice: originalPrice,
        discountPercentage: discountPercentage,
      });
    }

    await cart.save();

    const cartCount = exports.getUniqueProductCount(cart);
    const totals = cart.calculateTotals();

    res.locals.cartCount = cartCount;
    req.user.cartCount = cartCount;

    res.json({
      success: true,
      message: "Cart updated successfully",
      cartCount,
      totals,
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update cart",
      error: error.message,
    });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({
        success: false,
        error: "Cart not found",
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Product not found in cart",
      });
    }

    cart.items.splice(itemIndex, 1);

    if (cart.items.length === 0 && cart.appliedCoupon) {
        cart.appliedCoupon = undefined;
        cart.couponDiscount = 0;
    } else if (cart.appliedCoupon) {
        const couponValidation = await validateAndUpdateCartCoupon(cart);
        if (!couponValidation.valid) {
            cart.appliedCoupon = undefined;
            cart.couponDiscount = 0;
        }
    }

    await cart.save();

    const totals = cart.calculateTotals();

    // Return updated cart info with coupon details
    res.json({
      success: true,
      subtotal: totals.subtotal,
      total: totals.total,
      deliveryCharge: totals.deliveryCharge,
      couponDiscount: cart.couponDiscount || 0,
      hasCoupon: !!cart.appliedCoupon,
      itemCount: exports.getUniqueProductCount(cart),
      cartEmpty: cart.items.length === 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to remove item from cart",
    });
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod } = req.body;
    const userId = req.user._id.toString();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Find cart and populate items
    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: "Invalid address" });
    }

    // Calculate total
    const subtotal = cart.items.reduce((sum, item) => {
      return sum + (item.product.price * item.quantity);
    }, 0);

    // Create order with cart items
    const order = new Order({
      user: userId,
      items: cart.items.map(item => ({
        product: item.product._id,
        quantity: item.quantity,
        price: item.product.price,
        name: item.product.name,
        image: item.product.images[0] || ''
      })),
      shippingAddress: {
        fullName: address.fullName,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || '',
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        phone: address.phone
      },
      paymentMethod: paymentMethod,
      subtotal: subtotal,
      total: subtotal, // Will be updated with any discounts
      status: 'pending',
      paymentStatus: 'pending',
      appliedCoupon: cart.appliedCoupon || null,
      couponDiscount: cart.couponDiscount || 0
    });

    // Save the order
    await order.save();

    // Clear the cart and reset coupon
    cart.items = [];
    cart.appliedCoupon = null;
    cart.couponDiscount = 0;
    cart.couponCode = null;
    await cart.save();

    // If there was an applied coupon, update its usage
    if (cart.appliedCoupon && cart.appliedCoupon.couponId) {
      await Coupon.findByIdAndUpdate(cart.appliedCoupon.couponId, {
        $inc: { usedCount: 1 }
      });
    }

    return res.json({
      success: true,
      message: "Order placed successfully",
      orderId: order._id
    });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ success: false, message: "Error placing order" });
  }
};

exports.getWishlist = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get user with populated wishlist
    const user = await User.findById(userId).populate({
      path: "wishlist.product",
      model: "Product",
      select:
        "name productImage salesPrice regularPrice description isBlocked ratings",
      populate: {
        path: "ratings",
        model: "Rating",
      },
    });

    if (!user) {
      return res.redirect("/");
    }

    // Get cart count
    const cartCount = await exports.calculateCartCount(userId);

    // Filter out any wishlist items where the product has been deleted
    const validWishlist = user.wishlist
      .filter((item) => item.product && !item.product.isBlocked)
      .map((item) => item.product);

    res.render("user/wishlist", {
      offers,
      wishlistItems: validWishlist || [],
      user: req.user,
      cartCount,
      path: "/wishlist",
    });
  } catch (error) {
    console.error("Error getting wishlist:", error);
    res.status(500).render("user/error", {
      message: "Unable to get wishlist",
      error: process.env.NODE_ENV === "development" ? error : {},
      cartCount: 0,
      user: req.user,
      path: "/wishlist",
    });
  }
};

exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if product is already in wishlist
    const isInWishlist = user.wishlist.some(
      (item) => item.product && item.product.toString() === productId
    );
    if (isInWishlist) {
      return res.status(400).json({
        success: false,
        message: "Product is already in wishlist",
      });
    }

    // Add to wishlist
    user.wishlist.push({ product: productId });
    await user.save();

    res.json({
      success: true,
      action: "added",
      message: "Product added to wishlist",
    });
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(500).render("user/error", {
      message: "Unable to add product to wishlist",
      error: process.env.NODE_ENV === "development" ? error : {},
      cartCount: 0,
      user: req.user,
    });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.body; // Get productId from request body
    const userId = req.user._id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Remove from wishlist
    user.wishlist = user.wishlist.filter(
      (item) => item.product.toString() !== productId
    );
    await user.save();

    res.json({
      success: true,
      action: "removed",
      message: "Product removed from wishlist",
    });
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    res.status(500).render("user/error", {
      message: "Unable to remove product from wishlist",
      error: process.env.NODE_ENV === "development" ? error : {},
      cartCount: 0,
      user: req.user,
    });
  }
};

exports.toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // Find user and populate wishlist
    const user = await User.findById(userId).populate("wishlist.product");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Initialize wishlist array if it doesn't exist
    if (!user.wishlist) {
      user.wishlist = [];
    }

    // Check if product is already in wishlist
    const isInWishlist = user.wishlist.some(
      (item) =>
        item && item.product && item.product._id.toString() === productId
    );

    if (isInWishlist) {
      // Remove from wishlist
      user.wishlist = user.wishlist.filter(
        (item) =>
          item && item.product && item.product._id.toString() !== productId
      );
      await user.save();

      // Get updated wishlist with populated data
      const updatedUser = await User.findById(userId).populate(
        "wishlist.product"
      );

      return res.json({
        success: true,
        action: "removed",
        message: "Product removed from wishlist",
        wishlist: updatedUser.wishlist.map((item) => item.product),
      });
    } else {
      // Add to wishlist
      user.wishlist.push({ product: productId });
      await user.save();

      // Get updated wishlist with populated data
      const updatedUser = await User.findById(userId).populate(
        "wishlist.product"
      );

      return res.json({
        success: true,
        action: "added",
        message: "Product added to wishlist",
        wishlist: updatedUser.wishlist.map((item) => item.product),
      });
    }
  } catch (error) {
    console.error("Error in toggleWishlist:", error);
    res.status(500).json({
      success: false,
      message: "Unable to update wishlist",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

exports.renderCheckoutPage = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    // Get user with wallet
    const user = await User.findById(userId).populate("wallet");

    // Get wallet balance
    let walletBalance = 0;
    if (user.wallet) {
      const wallet = await Wallet.findById(user.wallet._id);
      if (wallet) {
        walletBalance = wallet.balance;
      }
    }

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
      },
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      req.flash("error", "Your cart is empty");
      return res.redirect("/cart");
    }

    // Calculate prices with offers for each item
    const itemsWithOffers = await Promise.all(
      cart.items.map(async (item) => {
        // Get the product details and best offer
        const offerDetails = await OfferService.getBestOffer(item.product);

        // Calculate the final price considering offers (must match UI logic)
        let finalPrice;
        if (offerDetails && offerDetails.finalPrice) {
          finalPrice = offerDetails.finalPrice;
        } else if (
          item.product.salesPrice &&
          item.product.salesPrice < item.product.regularPrice
        ) {
          finalPrice = item.product.salesPrice;
        } else {
          finalPrice = item.product.regularPrice;
        }

        const productObj = {
          ...item.product.toObject(),
          displayImage:
            item.product.productImage && item.product.productImage.length > 0
              ? item.product.productImage[0]
              : "/images/placeholder.jpg",
          offerDetails,
        };

        // Update the cart item's price to reflect any offers
        item.price = finalPrice;
        item.originalPrice = item.product.regularPrice;
        item.discountPercentage =
          ((item.originalPrice - finalPrice) / item.originalPrice) * 100;

        return {
          product: productObj,
          quantity: item.quantity,
          price: item.price,
          originalPrice: item.originalPrice,
          discountPercentage: item.discountPercentage,
        };
      })
    );

    // Save the updated cart with new prices
    await cart.save();

    // Calculate totals
    const totals = cart.calculateTotals();

    // Add totals to cart object
    cart.subtotal = totals.subtotal;
    cart.deliveryCharge = totals.deliveryCharge;
    cart.total = totals.total;

    // Get unique product count
    const cartCount = exports.getUniqueProductCount(cart);

    res.render("user/checkout", {
      offers,
      user: {
        name: user.name,
        email: user.email,
        wallet: walletBalance,
      },
      addresses: user.addresses || [],
      cart: {
        ...cart.toObject(),
        items: itemsWithOffers,
      },
      subtotal: totals.subtotal,
      deliveryCharge: totals.deliveryCharge,
      total: totals.total,
      pageTitle: "Checkout",
    });
  } catch (error) {
    console.error("Error rendering checkout page:", error);
    req.flash("error", "Failed to load checkout page");
    res.redirect("/cart");
  }
};

exports.processCheckout = async (req, res) => {
  try {
    const { addressId, paymentMethod } = req.body;
    const userId = req.user._id.toString();

    // Validate address
    if (!addressId) {
      return res
        .status(400)
        .json({ error: "Please select a delivery address" });
    }

    // Get user with cart items and selected address
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ user: userId }).populate("items.product");

    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    // Validate cart
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Find selected address
    const deliveryAddress = user.addresses.find(
      (addr) => addr._id.toString() === addressId
    );
    if (!deliveryAddress) {
      return res.status(400).json({ error: "Selected address not found" });
    }

    // Check product availability
    const unavailableProducts = [];
    for (const item of cart.items) {
      const product = await Product.findById(item.product._id);
      if (
        !product ||
        !product.isListed ||
        product.isBlocked ||
        product.quantity < item.quantity
      ) {
        unavailableProducts.push({
          name: product ? product.name : "Unknown Product",
          reason: !product
            ? "Product not found"
            : !product.isListed
            ? "No longer available"
            : product.isBlocked
            ? "Product unavailable"
            : `Only ${product.quantity} items available`,
        });
      }
    }

    if (unavailableProducts.length > 0) {
      return res.status(400).json({
        error: "Some products in your cart are unavailable",
        unavailableProducts: unavailableProducts.map(
          (p) => `${p.name} - ${p.reason}`
        ),
      });
    }

    // Calculate total amount with offers
    let subtotal = 0;
    const orderItems = await Promise.all(
      cart.items.map(async (item) => {
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
          : product.productImage
          ? [product.productImage]
          : [];

        return {
          product: product._id,
          quantity: item.quantity,
          price: priceAfterOffer,
          originalPrice: product.salesPrice,
          total: total,
          name: product.name,
          image: images,
        };
      })
    );

    const deliveryCharge = subtotal >= 500 ? 0 : 40;
    const total = subtotal - (cart.couponDiscount || 0) + deliveryCharge;

    // Format address according to schema
    const formattedAddress = {
      addressType: deliveryAddress.addressType || "Home",
      fullName: deliveryAddress.fullName,
      phone: deliveryAddress.phone,
      addressLine1: deliveryAddress.addressLine1,
      addressLine2: deliveryAddress.addressLine2,
      city: deliveryAddress.city,
      state: deliveryAddress.state,
      pincode: deliveryAddress.pincode,
    };

    // Convert payment method to lowercase to match enum
    const formattedPaymentMethod = paymentMethod.toLowerCase();

    // Create order in database
    const order = new Order({
      user: userId,
      items: orderItems.map((item) => ({
        product: item.product,
        quantity: item.quantity,
        price: item.price,
        status: "Processing",
      })),
      shippingAddress: formattedAddress,
      subtotal: subtotal,
      couponDiscount: cart.couponDiscount || 0,
      totalCoupon: cart.couponDiscount || 0, // Store original coupon amount
      couponCode: cart.appliedCoupon,
      deliveryCharge: deliveryCharge,
      total: total,
      paymentMethod: formattedPaymentMethod,
      paymentStatus: formattedPaymentMethod === "cod" ? "Pending" : "Pending",
      status: "Processing",
    });
    await order.save();

    if (formattedPaymentMethod === "online") {
      return res.json({
        success: true,
        orderId: order._id.toString(),
        total: total,
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
        message: "Order placed successfully",
        orderId: order._id.toString(),
      });
    }
  } catch (error) {
    console.error("Checkout Error:", error);
    res
      .status(500)
      .json({ error: "Failed to process checkout. Please try again." });
  }
};

exports.verifyRazorpayPayment = async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(400).json({
        error: "Online payment is not available at the moment.",
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      order.paymentStatus = "COMPLETED";
      order.razorpayPaymentId = razorpay_payment_id;
      await order.save();

      const cart = await Cart.findOne({ user: req.user._id.toString() });
      if (cart) {
        cart.items = [];
        cart.totalAmount = 0;
        await cart.save();
      }

      return res.json({ success: true });
    } else {
      return res.status(400).json({ error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Payment Verification Error:", error);
    res.status(500).json({ error: "Failed to verify payment" });
  }
};

exports.checkProductInCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id.toString();

    const cart = await Cart.findOne({ user: userId });
    const inCart = cart
      ? cart.items.some((item) => item.product.toString() === productId)
      : false;

    res.json({ inCart });
  } catch (error) {
    console.error("Error checking cart status:", error);
    res.status(500).json({
      error: "Failed to check cart status",
    });
  }
};

exports.getCartPage = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/login");
    }

    let cart = await Cart.findOne({ user: req.user._id }).populate({
      path: "items.product",
      select: "name regularPrice salesPrice productImage category isListed isBlocked quantity",
      populate: [
        {
          path: "category",
          model: "Category",
          select: "name isBlocked",
        },
      ],
    });

    // Validate and update coupon status
    if (cart) {
      cart = await validateAndUpdateCartCoupon(cart);
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.render("user/cart", {
        cartItems: [],
        cart: null,
        subtotal: 0,
        deliveryCharge: 0,
        total: 0,
        user: req.user,
        cartCount: 0,
        path: "/cart",
      });
    }

    // Identify and remove items whose category is blocked
    const blockedItems = cart.items.filter(
      (item) => item?.product?.category?.isBlocked === true
    );
    if (blockedItems.length > 0) {
      const blockedIds = blockedItems.map((i) => i.product._id.toString());

      cart.items = cart.items.filter(
        (item) => !blockedIds.includes(item.product._id.toString())
      );
      await cart.save();
      req.flash &&
        req.flash(
          "info",
          "Some items were removed from your cart because their category is blocked."
        );
    }

    // Filter out unavailable items (do not filter out blocked categories, just unavailable/zero-quantity)
    cart.items = cart.items.filter(
      (item) =>
        item.product &&
        !item.product.isBlocked &&
        item.product.isListed &&
        item.product.quantity > 0
    );

    const cartItems = await Promise.all(
      cart.items.map(async (item) => {
        const offerDetails = await OfferService.getBestOffer(item.product);

        let finalPrice;
        if (offerDetails && offerDetails.finalPrice) {
          finalPrice = offerDetails.finalPrice;
        } else if (
          item.product.salesPrice &&
          item.product.salesPrice < item.product.regularPrice
        ) {
          finalPrice = item.product.salesPrice;
        } else {
          finalPrice = item.product.regularPrice;
        }

        const productObj = {
          ...item.product.toObject(),
          displayImage:
            item.product.productImage && item.product.productImage.length > 0
              ? item.product.productImage[0]
              : "/images/placeholder.jpg",
          offerDetails,
        };

        item.price = finalPrice;
        item.originalPrice = item.product.regularPrice;
        item.discountPercentage =
          ((item.originalPrice - finalPrice) / item.originalPrice) * 100;

        return {
          product: productObj,
          quantity: item.quantity,
          price: item.price,
          originalPrice: item.originalPrice,
          discountPercentage: item.discountPercentage,
        };
      })
    );

    // Save the updated cart with new prices
    await cart.save();

    // Calculate totals with coupon validation
    const totals = await exports.calculateCartTotal(cart);

    // Update cart with validated coupon info
    if (totals.validCoupon) {
      cart.appliedCoupon = totals.validCoupon;
      cart.couponDiscount = totals.couponDiscount;
    } else if (cart.appliedCoupon) {
      // Clear invalid coupon
      cart.appliedCoupon = undefined;
      cart.couponDiscount = 0;
    }

    // Save cart with updated coupon info
    await cart.save();

    // Add totals to cart object for the view
    cart.subtotal = totals.subtotal;
    cart.deliveryCharge = totals.deliveryCharge;
    cart.total = totals.total;

    // Get unique product count
    const cartCount = exports.getUniqueProductCount(cart);

    res.render("user/cart", {
      cartItems,
      cart,
      subtotal: totals.subtotal,
      deliveryCharge: totals.deliveryCharge,
      total: totals.total,
      user: req.user,
      cartCount: cartCount, // Use unique product count
      path: "/cart",
    });
  } catch (error) {
    console.error("[ERROR] Error in getCartPage:", error);
    res.status(500).render("error", {
      error: "Failed to load cart page",
      user: req.user,
      cartCount: 0,
    });
  }
};

exports.applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.user._id; // No need to convert to string

    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: "Please provide a coupon code",
      });
    }

    // Find cart and populate product details
    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
      },
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // Find coupon
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon code",
      });
    }

    // Validate coupon
    if (!coupon.isValid()) {
      return res.status(400).json({
        success: false,
        message: "Coupon is not valid",
      });
    }

    // Calculate cart totals before applying coupon
    const cartTotals = await exports.calculateCartTotal(cart);

    // Check minimum purchase using correct schema field
    if (cartTotals.subtotal < coupon.minPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required for this coupon`,
      });
    }

    // Calculate discount using schema's method and correct field names
    let discount;
    try {
      discount = coupon.calculateDiscount(cartTotals.subtotal);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Invalid discount calculation",
      });
    }
    // Save all coupon info to cart.appliedCoupon
    cart.appliedCoupon = {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minPurchase: coupon.minPurchase,
      maxDiscount: coupon.maxDiscount,
      couponId: coupon._id,
    };
    cart.couponDiscount = discount;
    await cart.save();

    // Increment coupon usage
    coupon.usedCount += 1;
    await coupon.save();

    // Calculate final cart totals
    const updatedCart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
      },
    });
    const updatedCartTotals = await exports.calculateCartTotal(updatedCart);

    // Return response with complete cart data
    res.json({
      success: true,
      message: "Coupon applied successfully",
      cart: {
        subtotal: updatedCartTotals.subtotal,
        deliveryCharge: updatedCartTotals.deliveryCharge,
        total: updatedCartTotals.total,
        appliedCoupon: updatedCart.appliedCoupon,
        couponDiscount: updatedCart.couponDiscount,
      },
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({
      success: false,
      message: "Failed to apply coupon",
    });
  }
};

exports.removeCoupon = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    // Find cart
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
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
      message: "Coupon removed successfully",
    });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove coupon",
    });
  }
};

exports.removeCouponOnAdd = async (req, res) => {
  try {
    const userId = req.user._id;
    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Remove coupon from cart
    cart.coupon = undefined;
    cart.discount = 0;
    cart.couponCode = undefined;
    cart.appliedCoupon = null;
    
    // Recalculate totals without coupon
    const { subtotal, total, deliveryCharge } = await this.calculateCartTotal(cart);
    cart.subtotal = subtotal;
    cart.total = total;
    cart.deliveryCharge = deliveryCharge;
    
    await cart.save();
    
    res.json({ 
      success: true, 
      message: 'Coupon removed successfully',
      cart: await this.calculateCartSummary(cart)
    });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove coupon',
      error: error.message 
    });
  }
};

exports.getAvailableCoupons = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    // Find cart to get subtotal
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const { subtotal } = await exports.calculateCartTotal(cart);

    // Find valid coupons
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      startDate: { $lte: now },
      expiryDate: { $gt: now },
      minimumPurchase: { $lte: subtotal },
    }).select(
      "code description discountType discountAmount minimumPurchase maxDiscount usedCount usageLimit"
    );

    // Filter coupons based on usage limit in JavaScript
    const availableCoupons = coupons.filter(
      (coupon) => coupon.usedCount < coupon.usageLimit
    );

    res.json({
      success: true,
      coupons: availableCoupons.map((coupon) => ({
        code: coupon.code,
        description: `${
          coupon.discountType === "percentage"
            ? coupon.discountAmount + "% off"
            : "₹" + coupon.discountAmount + " off"
        }`,
        discountType: coupon.discountType,
        discountAmount: coupon.discountAmount,
        minimumPurchase: coupon.minimumPurchase,
        maxDiscount: coupon.maxDiscount,
      })),
    });
  } catch (error) {
    console.error("Error getting available coupons:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get available coupons",
    });
  }
};

exports.calculateCartSummary = (cart) => {
  const subtotal = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const deliveryCharge = subtotal >= 500 ? 0 : 40;
  const couponDiscount = cart.couponDiscount || 0;
  const total = subtotal - couponDiscount + deliveryCharge;
  return {
    subtotal,
    deliveryCharge,
    couponDiscount,
    total,
    appliedCoupon: cart.appliedCoupon || null,
  };
};

exports.incrementCartItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const cartItem = cart.items.find(
      (item) => item.product._id.toString() === productId
    );
    if (!cartItem) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in cart" });
    }

    // Check stock
    if (cartItem.quantity >= 5) {
      return res
        .status(400)
        .json({ success: false, message: "Maximum quantity reached" });
    }
    if (cartItem.product.quantity <= cartItem.quantity) {
      return res
        .status(400)
        .json({ success: false, message: "No more stock available" });
    }

    cartItem.quantity += 1;
    await cart.save();
    const summary = exports.calculateCartSummary(cart);
    return res.json({
      success: true,
      message: "Quantity increased",
      quantity: cartItem.quantity,
      ...summary,
    });
  } catch (error) {
    console.error("Error incrementing cart item:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to increase quantity" });
  }
};

exports.decrementCartItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const cartItem = cart.items.find(
      (item) => item.product._id.toString() === productId
    );
    if (!cartItem) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in cart" });
    }

    if (cartItem.quantity <= 1) {
      return res
        .status(400)
        .json({ success: false, message: "Minimum quantity is 1" });
    }

    cartItem.quantity -= 1;
    await cart.save();
    const summary = exports.calculateCartSummary(cart);
    return res.json({
      success: true,
      message: "Quantity decreased",
      quantity: cartItem.quantity,
      ...summary,
    });
  } catch (error) {
    console.error("Error decrementing cart item:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to decrease quantity" });
  }
};

// Clear the user's cart completely
exports.clearCart = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const userId = req.user._id;
    
    // Find and update the cart in a single operation
    const updatedCart = await Cart.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          items: [],
          couponDiscount: 0,
          couponValue: 0,
          total: 0,
          subTotal: 0,
          updatedAt: new Date()
        },
        $unset: {
          appliedCoupon: "",
          couponCode: "",
          couponType: ""
        }
      },
      { 
        new: true,
        session,
        runValidators: false,
        strict: false
      }
    );
    
    if (!updatedCart) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    
    await session.commitTransaction();
    session.endSession();
    
    res.json({ 
      success: true, 
      message: 'Cart cleared successfully',
      cart: {
        _id: updatedCart._id,
        items: [],
        subTotal: 0,
        total: 0,
        couponDiscount: 0
      }
    });
    
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error clearing cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to clear cart',
      error: error.message 
    });
  }
};
