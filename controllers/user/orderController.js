const mongoose = require("mongoose");
const {
  Order,
  ORDER_STATUS,
  PAYMENT_STATUS,
} = require("../../models/orderSchema");

// Local implementation of generateItemId to avoid module import issues
const generateItemId = () => {
  const prefix = 'ITM';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${timestamp}${random}`;
};
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wallet = require("../../models/walletSchema");

// Helper function to get badge class for item status
const getItemStatusBadgeClass = (status) => {
    switch (status) {
        case 'Pending':
            return 'warning';
        case 'Processing':
            return 'info';
        case 'Shipped':
            return 'primary';
        case 'Out for Delivery':
            return 'info';
        case 'Delivered':
            return 'success';
        case 'Return Requested':
            return 'secondary';
        case 'Return Approved':
            return 'info';
        case 'Return Picked Up':
            return 'info';
        case 'Return Completed':
            return 'success';
        case 'Cancelled':
            return 'danger';
        default:
            return 'secondary';
    }
};

// Helper function to get status icon class
const getStatusIcon = (status) => {
    switch (status) {
        case 'Pending':
            return 'fa-clock';
        case 'Processing':
            return 'fa-cog fa-spin';
        case 'Shipped':
            return 'fa-truck';
        case 'Out for Delivery':
            return 'fa-truck-ramp-box';
        case 'Delivered':
            return 'fa-check-circle';
        case 'Return Requested':
            return 'fa-arrow-rotate-left';
        case 'Return Approved':
            return 'fa-box-archive';
        case 'Return Rejected':
            return 'fa-ban';
        case 'Return Completed':
            return 'fa-circle-check';
        case 'Cancelled':
            return 'fa-times-circle';
        default:
            return 'fa-question-circle';
    }
};

const { getBestOffer } = require("../../helpers/offerHelper");

// Show retry payment page for a failed order
exports.showRetryPaymentPage = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Find the order
        const order = await Order.findOne({ 
            _id: orderId,
            user: req.user._id,
            paymentStatus: PAYMENT_STATUS.FAILED
        });

        if (!order) {
            req.flash('error', 'Order not found or payment cannot be retried');
            return res.redirect('/orders');
        }

        // Get user's wallet balance if needed
        const user = await User.findById(req.user._id).populate('wallet');
        const walletBalance = user.wallet?.balance || 0;

        res.render('user/retry-payment', {
            order,
            walletBalance,
            razorpayKey: process.env.RAZORPAY_KEY_ID,
            user: req.user
        });

    } catch (error) {
        console.error('Error showing retry payment page:', error);
        req.flash('error', 'An error occurred while loading the payment page');
        res.redirect('/orders');
    }
};


const PDFDocument = require("pdfkit");
const Razorpay = require("razorpay");
const errorHandler = require("../../utils/errorHandler");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.viewOrder = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/login');
    }

    const { orderId, itemId } = req.params;
    let order = await Order.findOne({
      _id: orderId,
      user: req.user._id
    })
    .populate({
      path: 'items.product',
      select: 'name price regularPrice salesPrice category description images productImage',
      populate: {
        path: 'category',
        select: 'name offer',
      },
    })
    .populate('user', 'name email phone')
    .lean();
    
    // If itemId is provided, filter the items to show only the specific item
    if (itemId) {
      order.items = order.items.filter(item => item._id.toString() === itemId);
      if (order.items.length === 0) {
        return res.status(404).render('error', {
          message: 'Order item not found',
          error: { status: 404 }
        });
      }
      // Set a flag to indicate we're viewing a single item
      order.singleItemView = true;
    }
    
    // Ensure all items have an itemId
    if (order && order.items) {
      let needsUpdate = false;
      
      order.items = order.items.map(item => {
        if (!item.itemId) {
          item.itemId = generateItemId();
          needsUpdate = true;
        }
        return item;
      });
      
      // If any items were missing itemId, update the order in the database
      if (needsUpdate) {
        await Order.updateOne(
          { _id: order._id },
          { $set: { items: order.items } }
        );
      }
    }

    if (!order) {
      return errorHandler.sendError(
        res,
        404,
        'Order not found or you do not have permission to view this order',
        { type: errorHandler.errorTypes.NOT_FOUND }
      );
    }

    // Format dates for display using native Date methods
    order.formattedDate = new Date(order.createdAt).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    if (order.deliveryDate) {
      order.formattedDeliveryDate = new Date(order.deliveryDate).toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }

    // Use orderNumber if available, otherwise fall back to _id
    const displayOrderId = order.orderNumber || order._id;
    
    res.render('user/viewOrder', {
      title: `Order #${displayOrderId}`,
      order,
      user: req.user,
      cartCount: req.cartCount || 0,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    console.error('Error in viewOrder:', error);
    return errorHandler.sendError(
      res,
      500,
      'An error occurred while loading the order details',
      error
    );
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/login");
    }

    const { getCartCount } = require("./userController");
    const cartCount = await getCartCount(req.user._id);

    const allOrders = await Order.find({});

    let userId = req.user._id;
    if (typeof userId === "string") {
      userId = new mongoose.Types.ObjectId(userId);
    }

    const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
    const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 5;
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments({ user: userId });
    const totalPages = Math.ceil(totalOrders / limit);

    // First, get the orders with basic population
    let orders = await Order.find({ user: userId })
      .populate({
        path: 'items.product',
        select: 'name price regularPrice salesPrice category description images productImage',
        populate: {
          path: 'category',
          select: 'name offer',
        },
      })
      .populate({
        path: 'appliedCoupon.couponId',
        select: 'code discountType discountValue minPurchase maxDiscount',
        model: 'Coupon'
      })
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Convert to plain JavaScript objects

    // Process orders to include coupon information and calculate ratio
    orders = orders.map(order => {
      if (order.appliedCoupon?.couponId) {
        const coupon = order.appliedCoupon.couponId;
        order.appliedCoupon = {
          ...order.appliedCoupon,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minPurchase: coupon.minPurchase,
          maxDiscount: coupon.maxDiscount,
          // Calculate the actual discount amount for this order
          actualDiscount: order.discountAmount || 0
        };
        
        // Calculate the ratio of discount to order subtotal (before discount)
        const subtotalBeforeDiscount = (order.totalAmount || 0) + (order.discountAmount || 0);
        if (subtotalBeforeDiscount > 0) {
          order.appliedCoupon.discountRatio = (order.appliedCoupon.actualDiscount / subtotalBeforeDiscount) * 100;
        } else {
          order.appliedCoupon.discountRatio = 0;
        }
      }
      return order;
    });

    // Process orders to ensure images are properly formatted
    orders = orders.map(order => {
      // Make sure order.items exists and is an array
      if (!order.items || !Array.isArray(order.items)) {
        order.items = [];
        return order;
      }

      // Process each item in the order
      order.items = order.items.map(item => {
        if (!item.product) {
          return item; // Skip if no product data
        }

        // Log product data for debugging
        console.log('Product data:', {
          name: item.product.name,
          images: item.product.images,
          productImage: item.product.productImage
        });

        // Use productImage field which is the correct field in the schema
        // Make sure productImage is an array
        if (!item.product.productImage || !Array.isArray(item.product.productImage)) {
          item.product.images = [];
        } else {
          // Create a copy of productImage array to avoid modifying the original
          item.product.images = [...item.product.productImage];
        }

        // Convert single string to array if needed (for backward compatibility)
        if (item.product.images.length === 0 && item.product.productImage && typeof item.product.productImage === 'string') {
          item.product.images = [item.product.productImage];
        }

        // Ensure all image paths are absolute and properly formatted
        item.product.images = item.product.images.map(img => {
          try {
            // Skip if image is falsy or not a string
            if (!img) return null;
            
            // If it's already a URL, return as is
            if (typeof img === 'string' && (img.startsWith('http') || img.startsWith('data:image'))) {
              return img;
            }
            
            // Handle object with path/url property
            if (typeof img === 'object' && img !== null) {
              const imgSrc = img.path || img.url;
              if (typeof imgSrc === 'string') {
                return imgSrc.startsWith('http') || imgSrc.startsWith('/') 
                  ? imgSrc 
                  : '/' + imgSrc;
              }
              return null;
            }
            
            // Handle string paths
            if (typeof img === 'string') {
              // Convert backslashes to forward slashes for web compatibility
              let path = img.replace(/\\/g, '/');
              // Ensure path starts with a forward slash if it's not a full URL
              if (!path.startsWith('http') && !path.startsWith('/')) {
                path = '/' + path;
              }
              return path;
            }
            
            return null;
          } catch (error) {
            console.error('Error processing image path:', error);
            return null;
          }
        }).filter(Boolean); // Remove any null/undefined values

        return item;
      });

      return order;
    });

    const processedOrders = await Promise.all(
      orders.map(async (order) => {
        // Check if order is already a plain object (from .lean())
        const orderObj = order;
        const items = await Promise.all(
          (orderObj.items || []).map(async (item) => {
            if (!item.product) {
              return {
                ...item,
                regularPrice: 0,
                price: 0,
                total: 0,
                offerDetails: null,
              };
            }

            const offerDetails = await getBestOffer(item.product);

            const regularPrice =
              item.product.regularPrice || item.product.price || 0;
            const finalPrice =
              offerDetails && offerDetails.hasOffer
                ? offerDetails.finalPrice
                : item.product.salesPrice || regularPrice;
            
            // Calculate item's share of coupon discount
            const itemSubtotal = finalPrice * item.quantity;
            
            // For single item orders, apply the full coupon discount to the item
            let itemCouponDiscount = 0;
            if (orderObj.items.length === 1) {
                itemCouponDiscount = orderObj.couponDiscount || 0;
            } else {
                // For multiple items, distribute the coupon proportionally
                const orderSubtotal = orderObj.items.reduce((sum, i) => {
                    const iRegularPrice = i.product.regularPrice || i.product.price || 0;
                    const iFinalPrice = i.product.salesPrice || iRegularPrice;
                    return sum + (iFinalPrice * i.quantity);
                }, 0);
                
                itemCouponDiscount = orderObj.couponDiscount > 0 && orderSubtotal > 0
                    ? Math.round((itemSubtotal / orderSubtotal) * orderObj.couponDiscount * 100) / 100 // Round to 2 decimal places
                    : 0;
            }

            return {
              ...item,
              regularPrice: regularPrice,
              price: finalPrice,
              total: finalPrice * item.quantity,
              itemCouponDiscount: itemCouponDiscount, // Add item-level coupon discount
              finalPrice: Math.max(0, (finalPrice * item.quantity) - itemCouponDiscount), // Final price after coupon
              offerDetails: {
                ...offerDetails,
                type:
                  offerDetails && offerDetails.hasOffer
                    ? offerDetails.type
                    : null,
              },
            };
          })
        );

        const subtotal = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        const productDiscount = items.reduce((sum, item) => {
          const itemDiscount =
            item.offerDetails && item.offerDetails.hasOffer
              ? (item.regularPrice - item.price) * item.quantity
              : 0;
          return sum + itemDiscount;
        }, 0);
        const couponDiscount = orderObj.couponDiscount || 0;
        const deliveryCharge = orderObj.deliveryCharge || 0;
        const totalSavings = productDiscount + couponDiscount;
        const total = Math.max(0, subtotal - couponDiscount + deliveryCharge);

        let deliveryDate =
          orderObj.deliveryDate || orderObj.deliveredAt || orderObj.updatedAt;
        let canReturn = false;
        let returnWindowText = "";
        if (orderObj.orderStatus === "Delivered" && deliveryDate) {
          const deliveryTime = new Date(deliveryDate);
          const now = new Date();
          const returnWindowMs = 15 * 60 * 1000;
          const msLeft =
            deliveryTime.getTime() + returnWindowMs - now.getTime();
          if (msLeft > 0) {
            canReturn = true;
            const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
            const minsLeft = Math.floor(
              (msLeft % (1000 * 60 * 60)) / (1000 * 60)
            );
            returnWindowText = `Return available for ${
              hoursLeft > 0 ? hoursLeft + "h " : ""
            }${minsLeft}m left`;
          } else {
            returnWindowText = "Return period expired";
          }
        }
        return {
          ...orderObj,
          items: items,
          subtotal: subtotal,
          productDiscount: productDiscount,
          couponDiscount: couponDiscount,
          deliveryCharge: deliveryCharge,
          totalSavings: totalSavings,
          total: total,
          deliveryDate: deliveryDate,
          canReturn: canReturn,
          returnWindowText: returnWindowText,
        };
      })
    );

    res.render("user/orders", {
      orders: processedOrders,
      user: req.user,
      cartCount: cartCount,
      messages: res.locals.messages || {},
      pagination: {
        page,
        totalPages,
        totalOrders,
        limit,
      },
      getStatusIcon, // Make the functions available in the template
      getItemStatusBadgeClass,
    });
  } catch (error) {
    console.error("[ERROR] Error fetching orders:", error);
    res.status(500).render("error", {
      message: "Error fetching orders",
      error: process.env.NODE_ENV === "development" ? error : {},
      user: req.user,
      cartCount: 0,
    });
  }
};

exports.getOrderDetails = async (req, res) => {
  const responseData = {
    user: req.user || null,
    order: null,
    cartCount: 0,
    error: null,
    message: null
  };

  try {
    console.log('=== ORDER DETAILS REQUEST ===');
    console.log('Order ID:', req.params.orderId);
    console.log('User ID:', req.user?._id || 'Not authenticated');
    
    if (!req.user) {
      console.log('User not authenticated, redirecting to login');
      return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    }

    const orderId = req.params.orderId;
    const itemId = req.params.itemId; 
    
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      console.log('Invalid order ID format:', orderId);
      responseData.error = 'Invalid order ID format';
      return res.status(404).render('user/orderDetails', responseData);
    }

    console.log('Fetching order from database...');
    let order;
    try {
      order = await Order.findOne({
        _id: orderId,
        user: req.user._id
      })
      .populate({
        path: 'items.product',
        select: 'name productImage price regularPrice salesPrice category images',
        populate: {
          path: 'category',
          select: 'name'
        }
      })
      .populate({
        path: 'appliedCoupon.couponId',
        select: 'code discountType discountValue minPurchase maxDiscount',
        model: 'Coupon'
      })
      .lean();
      
      // Map the populated coupon data to the appliedCoupon field
      if (order.appliedCoupon?.couponId) {
        const coupon = order.appliedCoupon.couponId;
        order.appliedCoupon = {
          ...order.appliedCoupon,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minPurchase: coupon.minPurchase,
          maxDiscount: coupon.maxDiscount
        };
      } 
      
      if (!order) {
        console.log('Order not found or access denied');
        responseData.error = 'Order not found or you do not have permission to view this order';
        return res.status(404).render('user/orderDetails', responseData);
      }
      
      console.log('Order found with status:', order.orderStatus);
      console.log('Order items count:', order.items?.length || 0);
      
    } catch (dbError) {
      console.error('Database error:', dbError);
      responseData.error = 'Error fetching order details. Please try again later.';
      if (process.env.NODE_ENV === 'development') {
        responseData.error += ` ${dbError.message}`;
      }
      return res.status(500).render('user/orderDetails', responseData);
    }
    
    try {
      const user = await User.findById(req.user._id).select('cart').lean();
      responseData.cartCount = user?.cart?.length || 0;
    } catch (error) {
      console.error('Error fetching user cart:', error);
    }

    if (!order.items || !Array.isArray(order.items)) {
      order.items = [];
    }
    
    order.items = order.items.map(item => {
      if (!item.product) {
        item.product = {
          name: 'Product not available',
          price: 0,
          regularPrice: 0,
          salesPrice: 0,
          images: []
        };
      }
      
      // Add coupon code to item if available
      if (order.appliedCoupon?.code) {
        item.couponCode = order.appliedCoupon.code;
      }
      
      item.price = item.price || 0;
      item.quantity = item.quantity || 0;
      
      const processImagePath = (img) => {
        if (!img) return null;
        
        if (typeof img === 'string' && (img.startsWith('http') || img.startsWith('data:image') || img.startsWith('blob:'))) {
          return img;
        }
        
        if (typeof img === 'object' && img !== null) {
          const imgSrc = img.path || img.url || img.src || '';
          if (imgSrc) {
            return imgSrc.startsWith('http') || imgSrc.startsWith('/') 
              ? imgSrc 
              : '/' + imgSrc.replace(/^[\/\\]+/, '');
          }
          return null;
        }
        
        if (typeof img === 'string') {
          let path = img.replace(/^[\/\\]+/, '');
          if (!path.match(/^(https?:\/\/|data:image|blob:)/)) {
            path = '/' + path;
          }
          return path;
        }
        
        return null;
      };
      
      if (!item.product.images || !Array.isArray(item.product.images)) {
        item.product.images = [];
      }
      
      if (Array.isArray(item.product.productImage) && item.product.productImage.length > 0) {
        const processedImages = item.product.productImage
          .map(processImagePath)
          .filter(img => img !== null);
        
        processedImages.forEach(img => {
          if (!item.product.images.includes(img)) {
            item.product.images.unshift(img); 
          }
        });
      }
      
      item.product.images = item.product.images
        .map(processImagePath)
        .filter(img => img !== null);
      
      item.product.images = [...new Set(item.product.images)];
      
      if (item.product.images.length === 0) {
        item.product.images.push('/images/placeholder.svg');
      }
      
      item.product.mainImage = item.product.images[0];
      
      return item;
    });
    
    // Get user information
    const user = await User.findById(req.user._id).select('name email phone').lean();
    responseData.order = {
      ...order,
      customer: user
    };
    
    let allItems = await Promise.all(
      order.items.map(async (item) => {
        if (!item.product) {
          return {
            ...item,
            regularPrice: 0,
            price: 0,
            total: 0,
            offerDetails: null,
          };
        }

        const offerDetails = await getBestOffer(item.product);
        const regularPrice = item.product.regularPrice || item.product.price || 0;
        const finalPrice = offerDetails && offerDetails.hasOffer
          ? offerDetails.finalPrice
          : item.product.salesPrice || regularPrice;

        return {
          ...item,
          regularPrice: regularPrice,
          price: finalPrice,
          total: finalPrice * item.quantity,
          offerDetails: {
            ...offerDetails,
            type: offerDetails && offerDetails.hasOffer ? offerDetails.type : null,
          },
        };
      })
    );

    order.items = allItems;
    order.isSingleItemView = false;
    
    const couponDiscount = order.couponDiscount || 0;
    
    console.log('=== COUPON DEBUG ===');
    console.log('Total coupon discount:', couponDiscount);
    
    const subtotalAfterProductDiscount = order.items.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0
    );
    
    console.log('Subtotal after product discounts:', subtotalAfterProductDiscount);
    
    // Calculate the total value of all items after product discounts
    const totalAfterProductDiscount = order.items.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
      0
    );
    
    // Process items to apply coupon discount proportionally
    const processedItems = [];
    let remainingDiscount = couponDiscount;
    let remainingItems = [...order.items];
    
    // Sort items by price in descending order to ensure consistent application
    remainingItems.sort((a, b) => {
      const priceA = (a.price || 0) * (a.quantity || 1);
      const priceB = (b.price || 0) * (b.quantity || 1);
      return priceB - priceA; // Sort in descending order
    });
    
    // Process all items except the last one
    while (remainingItems.length > 1) {
      const item = remainingItems.shift();
      const itemSubtotal = (item.price || 0) * (item.quantity || 1);
      
      // Calculate the proportion of this item's value to the remaining total
      const remainingTotal = remainingItems.reduce(
        (sum, i) => sum + (i.price || 0) * (i.quantity || 1) + itemSubtotal,
        0
      );
      
      let itemCouponDiscount = 0;
      if (remainingDiscount > 0 && remainingTotal > 0) {
        // Calculate the proportional discount for this item
        const ratio = itemSubtotal / remainingTotal;
        itemCouponDiscount = parseFloat((remainingDiscount * ratio).toFixed(2));
        
        // Ensure we don't discount more than the item's value
        itemCouponDiscount = Math.min(itemCouponDiscount, itemSubtotal, remainingDiscount);
        remainingDiscount -= itemCouponDiscount;
      }
      
      processedItems.push({
        ...item,
        itemCouponDiscount,
        finalPrice: Math.max(0, itemSubtotal - itemCouponDiscount)
      });
    }
    
    // Process the last item with any remaining discount
    if (remainingItems.length > 0) {
      const lastItem = remainingItems[0];
      const itemSubtotal = (lastItem.price || 0) * (lastItem.quantity || 1);
      const itemCouponDiscount = Math.min(remainingDiscount, itemSubtotal);
      
      processedItems.push({
        ...lastItem,
        itemCouponDiscount,
        finalPrice: Math.max(0, itemSubtotal - itemCouponDiscount)
      });
    }
    
    // Restore original order of items
    order.items = order.items.map(item => {
      const processedItem = processedItems.find(i => i._id.toString() === item._id.toString()) || item;
      
      console.log(`Item (${processedItem.product?.name}):`);
      console.log('  - Item subtotal:', (processedItem.price || 0) * (processedItem.quantity || 1));
      console.log('  - Coupon discount:', processedItem.itemCouponDiscount);
      console.log('  - Final price:', processedItem.finalPrice);
      
      return processedItem;
    });
    
    const totalDistributed = order.items.reduce((sum, item) => sum + item.itemCouponDiscount, 0);
    const roundingDifference = parseFloat((couponDiscount - totalDistributed).toFixed(2));
    
    if (roundingDifference !== 0 && order.items.length > 0) {
      const lastItem = order.items[order.items.length - 1];
      const lastItemSubtotal = (lastItem.price || 0) * (lastItem.quantity || 0);
      const newDiscount = Math.min(
        lastItem.itemCouponDiscount + roundingDifference,
        lastItemSubtotal
      );
      const actualAdjustment = newDiscount - lastItem.itemCouponDiscount;
      
      lastItem.itemCouponDiscount = parseFloat(newDiscount.toFixed(2));
      lastItem.finalPrice = Math.max(0, lastItemSubtotal - lastItem.itemCouponDiscount);
      
      console.log('Adjusted last item coupon discount by:', actualAdjustment);
    }
    
    if (itemId) {
      const itemToShow = order.items.find(item => item._id.toString() === itemId);
      if (!itemToShow) {
        return res.status(404).render('error', {
          message: 'Item not found in this order',
          error: { status: 404 },
          user: req.user,
          cartCount: 0,
        });
      }
      order.items = [itemToShow];
      order.isSingleItemView = true;
    }

    // Calculate order totals
    const subtotal = order.items.reduce(
      (sum, item) => sum + (item.regularPrice || 0) * (item.quantity || 0),
      0
    );
    
    const productDiscount = order.items.reduce((sum, item) => {
      const itemDiscount =
        item.offerDetails && item.offerDetails.hasOffer && item.regularPrice && item.price && item.quantity
          ? (item.regularPrice - item.price) * item.quantity
          : 0;
      return sum + itemDiscount;
    }, 0);
    
    const totalAfterDiscounts = order.items.reduce(
      (sum, item) => sum + (item.finalPrice || 0),
      0
    );
    const shippingCharge = order.shippingCharge || 0;
    const tax = order.tax || 0;
    const total = subtotal - productDiscount - couponDiscount + shippingCharge + tax;

    order.subtotal = subtotal;
    order.productDiscount = productDiscount;
    order.couponDiscount = couponDiscount;
    order.shippingCharge = shippingCharge;
    order.tax = tax;
    const totalAfterCouponDiscount = order.items.reduce(
      (sum, item) => {
        const itemTotal = (item.finalPrice || 0);
        console.log(`Adding item ${item.product?.name} total:`, itemTotal);
        return sum + itemTotal;
      },
      0
    );
    console.log('Total after coupon discounts:', totalAfterCouponDiscount);
    console.log('Shipping charge:', shippingCharge);
    console.log('Tax:', tax);
    order.total = totalAfterCouponDiscount + shippingCharge + tax;
    console.log('Final total:', order.total);

    let deliveryDate = order.deliveryDate || order.deliveredAt || order.updatedAt;
    let canReturn = false;
    let returnWindowText = "";
    if (order.orderStatus === ORDER_STATUS.DELIVERED && deliveryDate) {
      const deliveryTime = new Date(deliveryDate);
      const now = new Date();
      const returnWindowMs = 15 * 60 * 1000; // 15 minutes
      const msLeft = deliveryTime.getTime() + returnWindowMs - now.getTime();
      if (msLeft > 0) {
        canReturn = true;
        const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
        const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
        returnWindowText = `Return available for ${hoursLeft > 0 ? hoursLeft + "h " : ""}${minsLeft}m left`;
      } else {
        returnWindowText = "Return period expired";
      }
    }
    order.canReturn = canReturn;
    order.returnWindowText = returnWindowText;

    const orderObj = order.toObject ? order.toObject() : order;
    
    const orderWithStatusBadges = {
      ...orderObj,
      items: orderObj.items.map(item => {
        const itemStatus = item.status || orderObj.orderStatus;
        const formattedStatus = itemStatus.charAt(0).toUpperCase() + itemStatus.slice(1).toLowerCase();
        
        return {
          ...item,
          status: formattedStatus, // Ensure consistent status format
          statusBadgeClass: getItemStatusBadgeClass(formattedStatus),
          statusIcon: getStatusIcon(formattedStatus)
        };
      })
    };

    const viewData = {
      order: orderWithStatusBadges,
      user: req.user,
      cartCount: responseData.cartCount,
      messages: res.locals.messages || {}
    };

    if (itemId) {
      viewData.backToOrderUrl = `/orders/${orderId}`;
    }

    console.log('Rendering order details page...');
    try {
      res.render("user/orderDetails", viewData);
    } catch (renderError) {
      console.error('Error rendering order details:', renderError);
      return res.status(500).render('error', {
        message: 'Error rendering order details',
        error: process.env.NODE_ENV === 'development' ? renderError : {},
        user: req.user,
        cartCount: 0
      });
    }
  } catch (error) {
    console.error("[ERROR] Error getting order details:", error);
    
    // Log detailed error information
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      params: req.params,
      user: req.user ? req.user._id : 'Not authenticated'
    });
    
    // Handle specific error types
    if (error.name === 'CastError') {
      return res.status(400).render('error', {
        message: 'Invalid order ID format',
        error: process.env.NODE_ENV === 'development' ? error : {},
        user: req.user,
        cartCount: 0
      });
    }
    
    // For 500 errors, provide more detailed information in development
    const errorDetails = process.env.NODE_ENV === 'development' 
      ? { 
          message: error.message,
          stack: error.stack,
          name: error.name
        } 
      : {};
      
    res.status(500).render('error', {
      message: 'Error retrieving order details',
      error: errorDetails,
      user: req.user,
      cartCount: 0
    });
  }
};

exports.submitRating = async (req, res) => {
  try {
    const { productId, rating, orderId } = req.body;
    const userId = req.user._id;

    if (!productId || !rating || !orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Find the order and verify it belongs to the user
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
      orderStatus: "Delivered",
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or not eligible for rating",
      });
    }

    const orderItem = order.items.find(
      (item) => item.product.toString() === productId.toString()
    );

    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "Product not found in order",
      });
    }

    if (orderItem.rating) {
      return res.status(400).json({
        success: false,
        message: "Product already rated",
      });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: orderId,
        "items.product": productId,
      },
      {
        $set: {
          "items.$.rating": Number(rating),
          "items.$.ratedAt": new Date(),
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      throw new Error("Failed to update order rating");
    }

    const product = await Product.findByIdAndUpdate(
      productId,
      {
        $push: {
          ratings: {
            user: userId,
            rating: Number(rating),
          },
        },
      },
      { new: true }
    );

    if (!product) {
      throw new Error("Failed to update product rating");
    }

    const avgRating =
      product.ratings.reduce((sum, r) => sum + r.rating, 0) /
      product.ratings.length;

    await Product.findByIdAndUpdate(productId, {
      $set: {
        averageRating: avgRating,
        totalRatings: product.ratings.length,
      },
    });

    res.json({
      success: true,
      message: "Rating submitted successfully",
    });
  } catch (error) {
    console.error("[ERROR] Failed to submit rating:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to submit rating",
    });
  }
};
