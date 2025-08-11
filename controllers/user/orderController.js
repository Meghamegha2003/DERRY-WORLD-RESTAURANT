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
const PDFDocument = require("pdfkit");
const Razorpay = require("razorpay");
const errorHandler = require("../../utils/errorHandler");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// View a single order with the new template
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
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Convert to plain JavaScript objects

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

// Get order details
exports.getOrderDetails = async (req, res) => {
  // Initialize response data with defaults
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
    
    // Check authentication
    if (!req.user) {
      console.log('User not authenticated, redirecting to login');
      return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    }

    const orderId = req.params.orderId;
    const itemId = req.params.itemId; // Get the optional itemId parameter
    
    // Validate order ID format
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      console.log('Invalid order ID format:', orderId);
      responseData.error = 'Invalid order ID format';
      return res.status(404).render('user/orderDetails', responseData);
    }

    // Fetch order with detailed population
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
      .lean(); // Convert to plain object
      
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
    
    // Get user's cart count
    try {
      const user = await User.findById(req.user._id).select('cart').lean();
      responseData.cartCount = user?.cart?.length || 0;
    } catch (error) {
      console.error('Error fetching user cart:', error);
      // Continue with default cart count of 0
    }

    // Process order items to ensure consistent data structure
    if (!order.items || !Array.isArray(order.items)) {
      order.items = [];
    }
    
    // Process each item to ensure all required fields exist
    order.items = order.items.map(item => {
      // Ensure product exists
      if (!item.product) {
        item.product = {
          name: 'Product not available',
          price: 0,
          regularPrice: 0,
          salesPrice: 0,
          images: []
        };
      }
      
      // Ensure price fields exist
      item.price = item.price || 0;
      item.quantity = item.quantity || 0;
      
      // Helper function to process image paths
      const processImagePath = (img) => {
        if (!img) return null;
        
        // If it's already a full URL or data URL, use as is
        if (typeof img === 'string' && (img.startsWith('http') || img.startsWith('data:image') || img.startsWith('blob:'))) {
          return img;
        }
        
        // Handle object with path/url property
        if (typeof img === 'object' && img !== null) {
          const imgSrc = img.path || img.url || img.src || '';
          if (imgSrc) {
            return imgSrc.startsWith('http') || imgSrc.startsWith('/') 
              ? imgSrc 
              : '/' + imgSrc.replace(/^[\/\\]+/, '');
          }
          return null;
        }
        
        // Handle string paths
        if (typeof img === 'string') {
          // Remove any leading slashes or backslashes to prevent double slashes
          let path = img.replace(/^[\/\\]+/, '');
          // If it's not a full URL, ensure it has a leading slash
          if (!path.match(/^(https?:\/\/|data:image|blob:)/)) {
            path = '/' + path;
          }
          return path;
        }
        
        return null;
      };
      
      // Ensure product.images exists and is an array
      if (!item.product.images || !Array.isArray(item.product.images)) {
        item.product.images = [];
      }
      
      // Process productImage array (primary source of images)
      if (Array.isArray(item.product.productImage) && item.product.productImage.length > 0) {
        // Process all images in productImage array
        const processedImages = item.product.productImage
          .map(processImagePath)
          .filter(img => img !== null);
        
        // Add to images array if not already present
        processedImages.forEach(img => {
          if (!item.product.images.includes(img)) {
            item.product.images.unshift(img); // Add to beginning to prioritize productImage
          }
        });
      }
      
      // Process any existing images array
      item.product.images = item.product.images
        .map(processImagePath)
        .filter(img => img !== null);
      
      // Remove duplicates
      item.product.images = [...new Set(item.product.images)];
      
      // Ensure at least one image exists (use placeholder if none found)
      if (item.product.images.length === 0) {
        item.product.images.push('/images/placeholder.svg');
      }
      
      // Set a default image for easy access in templates
      item.product.mainImage = item.product.images[0];
      
      return item;
    });
    
    // Add order to response data
    responseData.order = order;
    
    // Process all items to calculate prices and offers
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

    // First, process all items with coupon distribution
    order.items = allItems;
    order.isSingleItemView = false;
    
    // Calculate coupon discount (if any) and distribute proportionally
    const couponDiscount = order.couponDiscount || 0;
    
    console.log('=== COUPON DEBUG ===');
    console.log('Total coupon discount:', couponDiscount);
    
    // Calculate subtotal for coupon distribution (after product discounts)
    const subtotalAfterProductDiscount = order.items.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0
    );
    
    console.log('Subtotal after product discounts:', subtotalAfterProductDiscount);
    
    // Distribute coupon discount proportionally to each item based on item's subtotal
    order.items = order.items.map(item => {
      const itemSubtotal = (item.price || 0) * (item.quantity || 0);
      
      // Calculate this item's share of the coupon discount
      const discountRatio = subtotalAfterProductDiscount > 0 
        ? itemSubtotal / subtotalAfterProductDiscount 
        : 0;
      
      // Calculate exact coupon discount for this item
      let itemCouponDiscount = parseFloat((couponDiscount * discountRatio).toFixed(2));
      
      // Ensure we don't give more discount than the item's price
      itemCouponDiscount = Math.min(itemCouponDiscount, itemSubtotal);
      
      console.log(`Item (${item.product?.name}):`);
      console.log('  - Item subtotal:', itemSubtotal);
      console.log('  - Discount ratio:', discountRatio);
      console.log('  - Coupon discount:', itemCouponDiscount);
      console.log('  - Final price:', (itemSubtotal - itemCouponDiscount).toFixed(2));
      
      return {
        ...item,
        itemCouponDiscount: itemCouponDiscount,
        finalPrice: Math.max(0, itemSubtotal - itemCouponDiscount)
      };
    });
    
    // After distributing, check for any rounding differences and adjust the last item if needed
    const totalDistributed = order.items.reduce((sum, item) => sum + item.itemCouponDiscount, 0);
    const roundingDifference = parseFloat((couponDiscount - totalDistributed).toFixed(2));
    
    if (roundingDifference !== 0 && order.items.length > 0) {
      // Apply rounding difference to the last item
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
    
    // Now filter items if itemId is provided
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
    
    // Calculate the total after product and coupon discounts
    const totalAfterDiscounts = order.items.reduce(
      (sum, item) => sum + (item.finalPrice || 0),
      0
    );
    const shippingCharge = order.shippingCharge || 0;
    const tax = order.tax || 0;
    const total = subtotal - productDiscount - couponDiscount + shippingCharge + tax;

    // Add calculated values to order
    order.subtotal = subtotal;
    order.productDiscount = productDiscount;
    order.couponDiscount = couponDiscount;
    order.shippingCharge = shippingCharge;
    order.tax = tax;
    // Recalculate total based on distributed coupon discounts
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

    // Convert order to plain object if it's a Mongoose document
    const orderObj = order.toObject ? order.toObject() : order;
    
    // Add status badge class and icon to each order item
    const orderWithStatusBadges = {
      ...orderObj,
      items: orderObj.items.map(item => {
        // Use item status if available, otherwise fall back to order status
        const itemStatus = item.status || orderObj.orderStatus;
        // Ensure status is properly formatted (capitalized first letter)
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

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    if (!req.body.reason) {
      return res.status(400).json({
        success: false,
        message: "Please provide a reason for cancellation",
      });
    }

    const order = await Order.findOne({
      _id: req.params.orderId,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!["Pending", "Processing"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel order in current status",
      });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { _id: req.params.orderId, user: req.user._id },
      {
        $set: {
          orderStatus: "Cancelled",
          cancelReason: req.body.reason,
          cancelledAt: new Date(),
          paymentStatus:
            order.paymentMethod !== "cod" && order.paymentStatus === "Paid"
              ? "Refunded"
              : order.paymentStatus,
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      throw new Error("Failed to update order");
    }

    if (updatedOrder.items && updatedOrder.items.length) {
      for (const item of updatedOrder.items) {
        const pid = item.product._id ? item.product._id : item.product;
        await Product.findByIdAndUpdate(pid, {
          $inc: { quantity: item.quantity },
        });
      }
    }

    if (
      updatedOrder.paymentMethod &&
      updatedOrder.paymentMethod.toLowerCase() !== "cod" &&
      [PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED].includes(
        updatedOrder.paymentStatus
      )
    ) {
      const refundAmount = updatedOrder.totalAmount || updatedOrder.total;

      try {
        let wallet = await Wallet.findOne({ user: req.user._id });
        if (!wallet) {
          wallet = new Wallet({
            user: req.user._id,
            balance: 0,
            transactions: [],
          });
        }
        wallet.balance += refundAmount;
        wallet.transactions.push({
          type: "credit",
          amount: refundAmount,
          description: `Refund for cancelled order #${updatedOrder._id
            .toString()
            .slice(-8)
            .toUpperCase()}`,
          orderId: updatedOrder._id.toString(),
          status: "completed",
          date: new Date(),
        });
        await wallet.save();
        const io = req.app.get && req.app.get("io");
        const activeUsers = req.app.get && req.app.get("activeUsers");
        if (io && activeUsers) {
          const socketId = activeUsers.get(req.user._id.toString());
          if (socketId) {
            io.to(socketId).emit("walletUpdated", {
              userId: req.user._id.toString(),
              balance: wallet.balance,
            });
          } else {
            console.log(
              "[CANCEL_ORDER] No active socket for user, walletUpdated not emitted"
            );
          }
        }
      } catch (err) {
        throw err;
      }
    } else {
      console.log(
        "[CANCEL_ORDER] No wallet refund needed for COD or unpaid order."
      );
    }

    res.json({
      success: true,
      message:
        order.paymentMethod !== "cod"
          ? "Order cancelled successfully. Amount will be refunded to your wallet."
          : "Order cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel order",
    });
  }
};

// Process refund to wallet
exports.processRefund = async (userId, amount) => {
  try {
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({
        user: userId,
        balance: 0,
        transactions: [],
      });
    }

    wallet.balance += Number(amount);
    wallet.transactions.push({
      type: "credit",
      amount: Number(amount),
      description: "Refund from returned order",
      date: new Date(),
      status: "completed",
    });

    await wallet.save();
    return true;
  } catch (error) {
    console.error("Error processing refund:", error);
    return false;
  }
};

// Cancel order item
exports.cancelOrderItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    const order = await Order.findOne({ _id: orderId, user: userId }).populate(
      "items.product"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order",
      });
    }

    if (item.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Item is already cancelled",
      });
    }

    if (!["Pending", "Processing"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Item cannot be cancelled at this stage",
      });
    }

    if (item.product) {
      let productId = item.product._id ? item.product._id : item.product;
      if (typeof productId === "object" && productId.toString)
        productId = productId.toString();
      try {
        const objectId = mongoose.Types.ObjectId.isValid(productId)
          ? new mongoose.Types.ObjectId(productId)
          : null;
        if (!objectId) {
          throw err;
        } else {
          const updateResult = await Product.findByIdAndUpdate(
            objectId,
            { $inc: { quantity: item.quantity } },
            { new: true }
          );
          if (!updateResult) {
            console.error(
              "[CANCEL_ITEM] Product not found or update failed for ObjectId:",
              objectId
            );
          }
        }
      } catch (err) {
        console.error("[CANCEL_ITEM] Error updating product quantity:", err);
      }
    }

    const refundAmount = item.price * item.quantity;

    item.status = "Cancelled";
    item.cancelReason = reason;
    item.cancelledAt = new Date();
    item.refundAmount = refundAmount;
    item.refundStatus = "Pending";

    if (
      order.paymentMethod !== "cod" &&
      order.paymentStatus === PAYMENT_STATUS.PAID
    ) {
      const refundSuccess = await exports.processRefund(userId, refundAmount);
      if (!refundSuccess) {
        console.error(`[CANCEL_ITEM] Refund processing failed for order ${order._id}`);
      } else {
        item.refundStatus = "Completed";
        item.refundDate = new Date();
      }
    }

    // Ensure the order total doesn't go below zero
    order.total = Math.max(0, order.total - refundAmount);

    const allItemsCancelled = order.items.every(
      (item) => item.status === "Cancelled"
    );
    
    // If total becomes zero after cancellation, update payment status if needed
    if (order.total === 0 && order.paymentStatus === PAYMENT_STATUS.PAID) {
      order.paymentStatus = PAYMENT_STATUS.REFUNDED;
    }
    if (allItemsCancelled) {
      order.orderStatus = ORDER_STATUS.CANCELLED;
      order.cancelledAt = new Date();
      if (
        order.paymentMethod !== "cod" &&
        order.paymentStatus === PAYMENT_STATUS.PAID
      ) {
        order.paymentStatus = PAYMENT_STATUS.REFUNDED;
      }
    }

    // Always save order after modifications
    await order.save();

    res.json({
      success: true,
      message:
        order.paymentMethod !== "cod"
          ? "Item cancelled successfully. Amount has been credited to your wallet."
          : "Item cancelled successfully.",
    });
  } catch (error) {
    console.error("Error cancelling order item:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel item. Please try again.",
    });
  }
};

// Request item return
exports.requestItemReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    if (!orderId || !itemId || !reason) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Find the order and verify it belongs to the user
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
      orderStatus: ORDER_STATUS.DELIVERED,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or not eligible for return",
      });
    }

    const item = order.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order",
      });
    }

    if (item.status !== "Active") {
      return res.status(400).json({
        success: false,
        message: `Item cannot be returned (current status: ${item.status})`,
      });
    }

    const refundAmount = item.price * item.quantity;

    item.status = "Returned";
    item.returnStatus = "Pending";
    item.returnReason = reason;
    item.returnRequestDate = new Date();
    item.refundAmount = refundAmount;
    item.refundStatus = "Pending";

    await order.save();

    res.json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("Error requesting item return:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit return request",
    });
  }
};


// Admin: Approve return request
exports.approveReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    await Order.updateOne(
      { _id: orderId, "items.product": itemId },
      {
        $set: {
          "items.$.returnStatus": "Approved",
          "items.$.status": ORDER_STATUS.RETURN_APPROVED,
        },
      }
    );

    const updatedOrder = await Order.findById(orderId).populate(
      "items.product"
    );
    const returnedItem = updatedOrder.items.find(
      (item) => item.product._id.toString() === itemId.toString()
    );
    if (returnedItem && returnedItem.quantity) {
      const prodId = returnedItem.product._id;
      const newProduct = await Product.findByIdAndUpdate(
        prodId,
        { $inc: { quantity: returnedItem.quantity } },
        { new: true }
      );
    }

    const refundSuccess = await processRefund(
      updatedOrder.user,
      returnedItem.total
    );
    if (!refundSuccess) throw new Error("Failed to process refund");

    res.json({
      success: true,
      message: "Return approved and refund processed",
    });
  } catch (error) {
    console.error("Error approving return:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to approve return" });
  }
};

// Admin: Reject return request
exports.rejectReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const orderItem = order.items.find(
      (item) => item.product.toString() === itemId.toString()
    );

    if (!orderItem || orderItem.returnStatus !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Invalid return request",
      });
    }

    await Order.updateOne(
      {
        _id: orderId,
        "items.product": itemId,
      },
      {
        $set: {
          "items.$.returnStatus": "Rejected",
          "items.$.status": ORDER_STATUS.RETURN_REJECTED,
        },
      }
    );

    res.json({
      success: true,
      message: "Return request rejected",
    });
  } catch (error) {
    console.error("Error rejecting return:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject return request",
    });
  }
};

// Submit product rating
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

// Request return
exports.requestReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason, comment, rating } = req.body;
    const userId = req.user._id;
    
    // Validate itemId if provided
    if (itemId && !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID format"
      });
    }

    // Validate reason
    if (!reason) {
      console.warn("Return attempt without reason");
      return res.status(400).json({
        success: false,
        message: "Please provide a reason for return",
      });
    }

    // Validate orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.warn(`Invalid order ID: ${orderId}`);
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order) {
      console.warn(`Order not found: ${orderId} for user ${userId}`);
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Find the specific item to return if itemId is provided, otherwise check all items
    let itemsToProcess = [];
    
    if (itemId) {
      // Single item return
      const item = order.items.id(itemId);
      if (!item) {
        return res.status(404).json({
          success: false,
          message: "Item not found in this order"
        });
      }
      
      // Check if the specific item is eligible for return
      if (!item.status || item.status.toLowerCase() !== ORDER_STATUS.DELIVERED.toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: `This item cannot be returned. Current status: ${item.status || 'unknown'}`,
          itemStatus: item.status
        });
      }
      
      itemsToProcess = [item];
    } else {
      // Original logic for multiple items (for backward compatibility)
      itemsToProcess = order.items.filter(item => 
        item.status && item.status.toLowerCase() === ORDER_STATUS.DELIVERED.toLowerCase()
      );

      if (itemsToProcess.length === 0) {
        console.warn(`No items eligible for return in order: ${orderId}`);
        const statuses = [...new Set(order.items.map(item => item.status || 'unknown'))];
        
        if (order.orderStatus === 'Delivered' || order.status === 'Delivered') {
          console.error(`[ERROR] Order marked as delivered but no delivered items found. Order status: ${order.orderStatus}, Item statuses: ${statuses.join(', ')}`);
        }
        
        return res.status(400).json({
          success: false,
          message: `No items eligible for return. Current item statuses: ${statuses.join(', ')}. ` +
                   `Only items with status '${ORDER_STATUS.DELIVERED}' can be returned.`,
          debug: {
            orderStatus: order.orderStatus,
            itemStatuses: statuses,
            hasDeliveryDate: !!order.deliveryDate
          }
        });
      }
    }

    // Check if return period is valid
    let deliveryDate = order.deliveryDate;
    const returnPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    // If delivery date is missing but order is marked as delivered, use current date as fallback
    if (!deliveryDate && (order.orderStatus === 'Delivered' || order.status === 'Delivered' || itemsToProcess.length > 0)) {
      console.warn(`[WARNING] Delivery date missing for order ${orderId} with status ${order.orderStatus}, using current date as fallback`);
      deliveryDate = new Date();
      order.deliveryDate = deliveryDate;
      
      // Only update order status to Delivered if we're processing all items
      if (!itemId) {
        order.orderStatus = 'Delivered';
        order.status = 'Delivered';
      }
      
      // Update only the items being processed to Delivered status if not already set
      itemsToProcess.forEach(item => {
        if (!item.status || item.status !== 'Delivered') {
          item.status = 'Delivered';
        }
      });
      
      await order.save({ validateBeforeSave: false });
      console.log(`[INFO] Updated order ${orderId} with delivery date and status`);
    } else if (!deliveryDate) {
      console.warn(
        `Order not delivered yet or delivery date missing for order: ${orderId}`
      );
      return res.status(400).json({
        success: false,
        message:
          "Cannot request return - order has not been delivered yet or delivery date is missing",
      });
    }

    if (Date.now() - deliveryDate.getTime() > returnPeriod) {
      console.warn(`Return period expired for order: ${orderId}`);
      const daysSinceDelivery = Math.ceil(
        (Date.now() - deliveryDate.getTime()) / (24 * 60 * 60 * 1000)
      );
      return res.status(400).json({
        success: false,
        message: `Return period has expired. Returns must be requested within 7 days of delivery. Your order was delivered ${daysSinceDelivery} days ago.`,
      });
    }

    // Update order and item statuses for return
    if (itemId) {
      // Single item return
      const item = order.items.id(itemId);
      item.status = "Return Requested";
      item.returnReason = reason;
      item.returnRequestDate = new Date();
      
      // Update order status to reflect partial return if not all items are being returned
      const nonReturnedItems = order.items.filter(i => 
        i._id.toString() !== itemId && 
        i.status !== 'Return Requested' && 
        i.status !== 'Returned'
      );
      
      if (nonReturnedItems.length > 0) {
        order.status = 'Partially Returned';
      } else {
        order.status = ORDER_STATUS.RETURN_REQUESTED;
      }
    } else {
      // Multiple items return (original behavior)
      order.orderStatus = ORDER_STATUS.RETURN_REQUESTED;
      order.status = ORDER_STATUS.RETURN_REQUESTED;
      order.returnReason = reason;
      
      // Update all eligible items to return requested
      itemsToProcess.forEach(item => {
        item.status = "Return Requested";
        item.returnReason = reason;
        item.returnRequestDate = new Date();
      });
    }

    // Add order rating if provided
    if (rating && rating >= 1 && rating <= 5) {
      order.orderRating = {
        value: rating,
        comment: comment || "",
        createdAt: new Date(),
      };
    }

    // Add status history
    if (!order.statusHistory) {
      order.statusHistory = [];
    }
    order.statusHistory.push({
      status: ORDER_STATUS.RETURN_REQUESTED,
      date: new Date(),
      comment: `Return requested due to: ${reason}`,
    });

    // Save order with validation bypass
    await order.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
      orderId: order._id,
    });
  } catch (error) {
    console.error("Error requesting return:", error);

    // Send more specific error message for validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid return reason. Please select a valid reason for return.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to submit return request. Please try again.",
      errorDetails: error.message,
    });
  }
};

// Show retry payment page
exports.showRetryPaymentPage = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId).populate("items.product");

    if (!order || order.paymentStatus !== "Failed") {
      return res.status(400).render("error", { message: "Invalid or already paid order." });
    }

    const amount = Math.round(
      (order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      - (order.couponDiscount || 0)
      + (order.deliveryCharge || 0)) * 100
    ); // in paise

    const razorpayOrder = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: order._id.toString(),
      notes: { orderId: order._id.toString() },
    });

    res.render("user/retry-payment", {
      user: req.user,
      order,
      razorpayOrder,
      razorpayKey: process.env.RAZORPAY_KEY,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("error", { message: "Server Error" });
  }
};

// POST /retry-payment-initiate/:orderId
exports.initiateRetryPayment = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId);

    if (!order || order.orderStatus !== "Pending") {
      return res.status(400).json({ success: false, message: "Invalid or already paid order." });
    }

    const amount = Math.round(
      (order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      - (order.couponDiscount || 0)
      + (order.deliveryCharge || 0)) * 100
    ); // in paise

    const razorpayOrder = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: order._id.toString(),
      notes: { orderId: order._id.toString() },
    });

    return res.json({ success: true, order: razorpayOrder });
  } catch (error) {
    console.error("Retry Payment Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Download Invoice Handler
exports.downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findOne({ _id: orderId, user: req.user._id }).populate("items.product");
    if (!order) {
      return res.status(404).send("Order not found");
    }

    // Seller details (set via env or defaults)
    const sellerName = process.env.SELLER_NAME || "Derry World"; // Updated name per request
    const sellerAddress = process.env.SELLER_ADDRESS || "123 Main Street, City, State, ZIP";
    const sellerGSTIN = process.env.SELLER_GSTIN || "XXXXXXXXXXXXXXX";
    const sellerEmail = process.env.SELLER_EMAIL || "DERRY@gmail.com";
    const sellerPlace = process.env.SELLER_PLACE || "manappuram po, cherthala, Alappuzha, kerala";
    const sellerPin = process.env.SELLER_PIN || "688526";
    const sellerPhone = process.env.SELLER_PHONE || "6282679552";
    const invoiceNumber = `INV-${order._id.toString().slice(-8).toUpperCase()}`;

    // Create PDF
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice_${orderId}.pdf`);
    doc.pipe(res);

    // Draw page border
    const { width, height } = doc.page;
    // Draw border inside margins
    const { top, bottom, left, right } = doc.page.margins;
    doc.strokeColor('black').lineWidth(2)
       .rect(left, top, width - left - right, height - top - bottom)
       .stroke();
    // Move header down inside border
    doc.y = top + 20;

    // Header
    const headerWidth = width - left - right - 20;
    doc.fillColor('#ffc107').font('Helvetica-Bold').fontSize(20)
       .text(sellerName, { align: 'center' });
    doc.fillColor('black').font('Helvetica').fontSize(10)
       .text(`Email: ${sellerEmail}`, { align: 'center', width: headerWidth })
       .text(`Place: ${sellerPlace}, Pin: ${sellerPin}`, { align: 'center', width: headerWidth })
       .text(`Phone: ${sellerPhone}`, { align: 'center', width: headerWidth });
    doc.moveDown();

    // Invoice Title
    doc.fillColor('#ffc107').font('Helvetica-Bold').fontSize(16).text('Invoice', { align: 'center' });
    doc.fillColor('black');
    doc.moveDown();

    // Order Details
    doc.font('Helvetica').fontSize(12)
       .text(`Name of user: ${req.user.name}`, left + 10)
       .text(`Order ID: #${order._id.toString().slice(-8).toUpperCase()}`, left + 10)
       .text(`Order Date: ${order.createdAt.toLocaleDateString('en-GB')}`, left + 10);
    const method = order.paymentMethod === 'online' ? 'Razorpay' : order.paymentMethod === 'cod' ? 'COD' : order.paymentMethod;
    doc.text(`Payment Method: ${method}`, left + 10);
    doc.moveDown();

    // Products:
    doc.fillColor('#ffc107').font('Helvetica-Bold').fontSize(12).text('Products:', left + 10);
    doc.fillColor('black');

    // Invoice Items Table
    const tableLeft = left + 10;
    const tableTop = doc.y + 10;
    const widths = [40, 220, 60, 80, 80];
    const headers = ["S.No","Product Name","Quantity","Price","Total"]; 
    const widthSum = widths.reduce((acc, w) => acc + w, 0);
    const rowHeight = 25;

    // Header background
    doc.fillColor('#333').rect(tableLeft, tableTop, widthSum, rowHeight).fill().stroke();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10);
    let x = tableLeft;
    headers.forEach((h, i) => {
      doc.text(h, x + 5, tableTop + 7, { width: widths[i] - 10, align: i === 0 ? 'left' : i === 1 ? 'center' : 'right' });
      x += widths[i];
    });

    // Grid lines
    for (let i = 0; i < order.items.length + 1; i++) {
      doc.strokeColor('#ccc').lineWidth(0.5).moveTo(tableLeft, tableTop + (i + 1) * rowHeight).lineTo(tableLeft + widthSum, tableTop + (i + 1) * rowHeight).stroke();
    }

    // Rows
    let y = tableTop + rowHeight;
    order.items.forEach((item, index) => {
      if (index % 2 === 0) {
        doc.fillColor('#f9f9f9').rect(tableLeft, y, widthSum, rowHeight).fill();
      }
      doc.fillColor('#000').font('Helvetica').fontSize(10);
      x = tableLeft;
      const vals = [(index+1).toString(), item.product.name, item.quantity.toString(), `₹${item.price.toFixed(2)}`, `₹${(item.price * item.quantity).toFixed(2)}`];
      vals.forEach((v, j) => {
        doc.text(v, x + 5, y + 7, { width: widths[j] - 10, align: j === 0 ? 'left' : j === 1 ? 'center' : 'right' });
        x += widths[j];
      });
      y += rowHeight;
    });

    // Summary
    const preTotal = order.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const discount = order.couponDiscount || 0;
    const finalAmount = preTotal - discount;
    doc.font('Helvetica').fontSize(10).text(`Total Amount: ₹${preTotal.toFixed(2)}`, tableLeft, y + 10, { width: widthSum, align: 'right' });
    doc.text(`Discount: ₹${discount.toFixed(2)}`, { width: widthSum, align: 'right' });
    doc.font('Helvetica-Bold').fillColor('red').text(`Final Amount: ₹${finalAmount.toFixed(2)}`, { width: widthSum, align: 'right' });
    doc.fillColor('black');
    doc.moveDown(2);

    doc.end();
  } catch (error) {
    console.error("Invoice download error:", error);
    res.status(500).send("Failed to generate invoice");
  }
};
