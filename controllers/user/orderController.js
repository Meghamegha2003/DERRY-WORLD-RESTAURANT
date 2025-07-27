const mongoose = require("mongoose");
const {
  Order,
  ORDER_STATUS,
  PAYMENT_STATUS,
} = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wallet = require("../../models/walletSchema");
const { getBestOffer } = require("../../helpers/offerHelper");
const PDFDocument = require("pdfkit");


// Initialize Razorpay
const Razorpay = require("razorpay");

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Get user orders
exports.getUserOrders = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/login");
    }

    // Get accurate cart count
    const { getCartCount } = require("./userController");
    const cartCount = await getCartCount(req.user._id);

    // Debug: Log current session user and all order user IDs
    const allOrders = await Order.find({});

    let userId = req.user._id;
    if (typeof userId === "string") {
      userId = new mongoose.Types.ObjectId(userId);
    }

    // Pagination logic
    const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
    const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 5;
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalOrders = await Order.countDocuments({ user: userId });
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find({ user: userId })
      .populate({
        path: "items.product",
        select:
          "name productImage price regularPrice salesPrice category description",
        populate: {
          path: "category",
          select: "name offer",
        },
      })
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit);

    // Process orders to ensure all required fields
    const processedOrders = await Promise.all(
      orders.map(async (order) => {
        const orderObj = order.toObject();
        const items = await Promise.all(
          orderObj.items.map(async (item) => {
            if (!item.product) {
              return {
                ...item,
                regularPrice: 0,
                price: 0,
                total: 0,
                offerDetails: null,
              };
            }

            // Get offer details for the product
            const offerDetails = await getBestOffer(item.product);

            const regularPrice =
              item.product.regularPrice || item.product.price || 0;
            const finalPrice =
              offerDetails && offerDetails.hasOffer
                ? offerDetails.finalPrice
                : item.product.salesPrice || regularPrice;

            return {
              ...item,
              regularPrice: regularPrice,
              price: finalPrice,
              total: finalPrice * item.quantity,
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

        // Calculate order totals (checkout logic)
        const subtotal = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        ); // use offer/sale/final price
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
        const total = Math.max(0, subtotal - couponDiscount + deliveryCharge); // match checkout logic

        // Add deliveryDate, canReturn, and returnWindowText for food orders
        let deliveryDate =
          orderObj.deliveryDate || orderObj.deliveredAt || orderObj.updatedAt;
        let canReturn = false;
        let returnWindowText = "";
        if (orderObj.orderStatus === "Delivered" && deliveryDate) {
          const deliveryTime = new Date(deliveryDate);
          const now = new Date();
          const returnWindowMs = 15 * 60 * 1000; // 15 minutes (1/4 hour)
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
  try {
    if (!req.user) {
      // Pass intended destination as a query param for stateless redirect
      return res.redirect(
        `/login?returnTo=${encodeURIComponent(req.originalUrl)}`
      );
    }

    const orderId = req.params.orderId;

    // Find order and populate product details
    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    }).populate({
      path: "items.product",
      select: "name productImage price regularPrice salesPrice category",
      populate: {
        path: "category",
        select: "name",
      },
    });

    if (!order) {
      return res.status(404).render("error", {
        message: "Order not found",
        error: { status: 404 },
        user: req.user,
        cartCount: 0,
      });
    }

    // Get user's cart count
    const user = await User.findById(req.user._id).select("cart");
    const cartCount = user?.cart?.length || 0;

    // Process order items
    const processedOrder = order.toObject();
    processedOrder.items = await Promise.all(
      processedOrder.items.map(async (item) => {
        if (!item.product) {
          return {
            ...item,
            regularPrice: 0,
            price: 0,
            total: 0,
            offerDetails: null,
          };
        }

        // Get offer details for the product
        const offerDetails = await getBestOffer(item.product);

        const regularPrice =
          item.product.regularPrice || item.product.price || 0;
        const finalPrice =
          offerDetails && offerDetails.hasOffer
            ? offerDetails.finalPrice
            : item.product.salesPrice || regularPrice;

        return {
          ...item,
          regularPrice: regularPrice,
          price: finalPrice,
          total: finalPrice * item.quantity,
          offerDetails: {
            ...offerDetails,
            type:
              offerDetails && offerDetails.hasOffer ? offerDetails.type : null,
          },
        };
      })
    );

    // Calculate order totals
    const subtotal = processedOrder.items.reduce(
      (sum, item) => sum + item.regularPrice * item.quantity,
      0
    );
    const productDiscount = processedOrder.items.reduce((sum, item) => {
      const itemDiscount =
        item.offerDetails && item.offerDetails.hasOffer
          ? (item.regularPrice - item.price) * item.quantity
          : 0;
      return sum + itemDiscount;
    }, 0);
    const couponDiscount = processedOrder.couponDiscount || 0;
    const deliveryCharge = processedOrder.deliveryCharge || 0;
    const totalSavings = productDiscount + couponDiscount;
    const total = Math.max(
      0,
      subtotal - productDiscount - couponDiscount + deliveryCharge
    );

    processedOrder.subtotal = subtotal;
    processedOrder.productDiscount = productDiscount;
    processedOrder.couponDiscount = couponDiscount;
    processedOrder.deliveryCharge = deliveryCharge;
    processedOrder.totalSavings = totalSavings;
    processedOrder.total = total;

    // Calculate return window eligibility and timer
    let deliveryDate = processedOrder.deliveryDate || processedOrder.deliveredAt || processedOrder.updatedAt;
    let canReturn = false;
    let returnWindowText = "";
    if (processedOrder.orderStatus === ORDER_STATUS.DELIVERED && deliveryDate) {
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
    processedOrder.canReturn = canReturn;
    processedOrder.returnWindowText = returnWindowText;

    res.render("user/orderDetails", {
      order: processedOrder,
      user: req.user,
      cartCount,
      messages: res.locals.messages || {},
    });
  } catch (error) {
    console.error("[ERROR] Error getting order details:", error);
    res.status(500).render("error", {
      message: "Error retrieving order details",
      error: process.env.NODE_ENV === "development" ? error : {},
      user: req.user,
      cartCount: 0,
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

    // Update order status and reason
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

    // Restore inventory for cancelled order
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
        // Find or create the user's wallet
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
        // Emit real-time wallet update if socket.io is available
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

    // Find the item in the order
    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order",
      });
    }

    // Check if item can be cancelled
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

    // Return item quantity to inventory
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

    // Calculate refund amount
    const refundAmount = item.price * item.quantity;

    // Update item status and reason
    item.status = "Cancelled";
    item.cancelReason = reason;
    item.cancelledAt = new Date();
    item.refundAmount = refundAmount;
    item.refundStatus = "Pending";

    // If payment was made, process refund via helper
    if (
      order.paymentMethod !== "cod" &&
      order.paymentStatus === PAYMENT_STATUS.PAID
    ) {
      const refundSuccess = await processRefund(userId, refundAmount);
      if (!refundSuccess) {
        console.error(`[CANCEL_ITEM] Refund processing failed for order ${order._id}`);
      } else {
        item.refundStatus = "Completed";
        item.refundDate = new Date();
      }
    }

    // Update order total
    order.total -= refundAmount;

    // If all items are cancelled, cancel the entire order
    const allItemsCancelled = order.items.every(
      (item) => item.status === "Cancelled"
    );
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

    // Validate input
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

    // Find the item in the order
    // Find the item in the order by its subdocument id
    const item = order.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order",
      });
    }

    // Check if item can be returned
    if (item.status !== "Active") {
      return res.status(400).json({
        success: false,
        message: `Item cannot be returned (current status: ${item.status})`,
      });
    }

    // Calculate potential refund amount
    const refundAmount = item.price * item.quantity;

    // Update the item with return request
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

// Process refund to wallet
exports.processRefund = async (userId, amount) => {
  try {
    // Find or create wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({
        user: userId,
        balance: 0,
        transactions: [],
      });
    }

    // Add refund amount to wallet
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

// Admin: Approve return request
exports.approveReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    // Update return status in document
    await Order.updateOne(
      { _id: orderId, "items.product": itemId },
      {
        $set: {
          "items.$.returnStatus": "Approved",
          "items.$.status": ORDER_STATUS.RETURN_APPROVED,
        },
      }
    );

    // Re-fetch order with populated products
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

    // Process refund
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

    // Update return status
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

    // Validate input
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

    // Find the item in the order
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

    // Update the order item with rating
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

    // Add rating to product's ratings array
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

    // Calculate and update product's average rating
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
    const { orderId } = req.params;
    const { reason, comment, rating } = req.body;
    const userId = req.user._id;

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

    // Check if return is possible
    const currentStatus = (
      order.orderStatus ||
      order.status ||
      ""
    ).toLowerCase();
    if (currentStatus !== ORDER_STATUS.DELIVERED.toLowerCase()) {
      console.warn(`Cannot return order in status: ${currentStatus}`);
      return res.status(400).json({
        success: false,
        message: `Order cannot be returned. Current status: ${currentStatus}`,
      });
    }

    // Check if return period is valid \
    const deliveryDate = order.deliveryDate;
    const returnPeriod = 7 * 24 * 60 * 60 * 1000; 

    if (!deliveryDate) {
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

    // Update order status and reason
    order.orderStatus = ORDER_STATUS.RETURN_REQUESTED;
    order.status = ORDER_STATUS.RETURN_REQUESTED;
    order.returnReason = reason;

    // Update all items to return requested
    order.items.forEach((item) => {
      item.status = "Return Requested";
      item.returnReason = reason;
    });

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
