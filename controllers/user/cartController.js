const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const jwt = require('jsonwebtoken');
const Order = require('../../models/orderSchema');

const renderProductDetails = async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await Product.findById(productId).populate('ratings.user');
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let userRating = null;
    let cartItems = [];
    let cartCount = 0;

    if (req.user) {
      userRating = product.ratings.find(rating => rating.user._id.toString() === req.user._id.toString());
      const userCart = await Cart.findOne({ user: req.user._id });
      if (userCart) {
        cartItems = userCart.items.map(item => item.product.toString());
        cartCount = userCart.items.length;
      }
    }

    res.render('foodDetails', { product, userRating, cartItems, cartCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const submitRating = async (req, res) => {
  try {
    const productId = req.params.id;
    const { rating, review } = req.body;
    const product = await Product.findById(productId);
    const existingRating = product.ratings.find(rating => rating.user.toString() === req.user._id.toString());

    if (existingRating) {
      existingRating.score = rating;
      existingRating.review = review;
    } else {
      product.ratings.push({
        user: req.user._id,
        score: rating,
        review,
      });
    }

    const totalRatings = product.ratings.length;
    const averageRating = product.ratings.reduce((sum, rating) => sum + rating.score, 0) / totalRatings;
    product.averageRating = averageRating;
    product.totalRatings = totalRatings;

    await product.save();
    res.redirect(`/food/${productId}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const addToCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const productId = req.body.productId;

    // Fetch the product from the database
    const product = await Product.findById(productId);
    console.log(product,'hi');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Fetch the user's cart and populate product details
    let cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart) {
      // Create a new cart if none exists
      cart = new Cart({ user: userId, items: [] });
    }

    // Check if the product is already in the cart
    const productIndex = cart.items.findIndex(item => item.product._id.toString() === productId);

    if (productIndex === -1) {
      // If the product is not in the cart, add it
      cart.items.push({
        product: product._id,
        quantity: 1,
        price: product.salesPrice || product.regularPrice,
      });
    } else {
      // If the product is already in the cart, increment the quantity
      cart.items[productIndex].quantity += 1;
    }

    // Save the cart
    await cart.save();

    // Re-fetch the cart to ensure updated population
    cart = await Cart.findOne({ user: userId }).populate('items.product');

    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
    const totalPrice = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);

    res.render('cart', { cartItems: cart.items, cartCount, totalPrice });
  } catch (error) {
    console.error("Full error object:", error);
    return res.status(500).json({ message: 'An error occurred while adding to the cart', error: error.message });
  }
};



const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'productImage name description rating averageRating totalRatings price');
    console.log(cart);
    
    if (!cart) {
      return res.status(404).send('Cart not found');
    }

    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
    const totalPrice = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
    

    res.render('cart', { cartItems: cart.items, cartCount, totalPrice });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching cart');
  }
};

const updateCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    // Check if productId and quantity are provided
    if (!productId || quantity === undefined) {
      return res.status(400).json({ message: "Invalid data provided. Product ID and quantity are required." });
    }

    // Validate the quantity
    if (quantity < 1 || quantity > 5) {
      return res.status(400).json({ message: "Quantity must be between 1 and 5." });
    }

    const userId = req.user._id;

    // Fetch the user's cart
    let cart = await Cart.findOne({ user: userId }).populate("items.product");

    if (!cart) {
      return res.status(404).json({ message: "Cart not found." });
    }

    // Find the index of the product in the cart
    const itemIndex = cart.items.findIndex(item => item.product._id.toString() === productId);

    if (itemIndex === -1) {
      return res.status(404).json({ message: "Product not found in cart." });
    }

    // Update the product's quantity
    cart.items[itemIndex].quantity = quantity;

    // Save the updated cart
    await cart.save();

    // Recalculate the total price of the cart
    const totalPrice = cart.items.reduce((total, item) => {
      const price = item.product.salesPrice || item.product.regularPrice;
      return total + (item.quantity * price);
    }, 0);

    // Respond with the updated cart and total price
    return res.status(200).json({ 
      message: "Cart updated successfully.", 
      cart, 
      totalPrice: totalPrice.toFixed(2) // Return the total price with 2 decimal points
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Invalid data provided." });
    }

    const userId = req.user._id;

    // Fetch the cart for the current user
    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found." });
    }

    // Remove the product from the cart
    cart.items = cart.items.filter(item => item.product.toString() !== productId);

    // Save the updated cart
    await cart.save();

    // Calculate updated total price
    const totalPrice = cart.items.reduce(
      (total, item) => total + (item.quantity * item.product.salesPrice || item.product.regularPrice),
      0
    );

    return res.status(200).json({ message: "Product removed from cart.", cart, totalPrice });
  } catch (error) {
    console.error("Error removing product from cart:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};



const getProfile = async (req, res) => {
  try {
    const user = req.user;
    const cartItems = await Cart.find({ userId: user._id });
    const cartCount = cartItems.length;

    res.render('profile', {
      user: user,
      cartCount: cartCount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Something went wrong');
  }
};

const addAddress = async (req, res) => {
  try {
    console.log('Request body:', req.body);
    const { type, street, city, state, pincode } = req.body;
    const userId = req.user._id;

    // Validate the input
    if (!street || !city || !state || !pincode) {
      console.log('Missing fields:', { street, city, state, pincode });
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate pincode format
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      console.log('Invalid pincode:', pincode);
      return res.status(400).json({
        success: false,
        message: 'Invalid PIN code format'
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create the new address object
    const newAddress = {
      addressType: type || 'Home',
      street: street,
      city: city,
      state: state,
      pincode: pincode
    };

    console.log('New address object:', newAddress);

    // Add the address to the user's addresses array
    user.addresses.push(newAddress);

    // Save with validation
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Address added successfully',
      addresses: user.addresses
    });

  } catch (error) {
    console.error('Error in addAddress:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to add address'
    });
  }
};

const updateAddress = async (req, res) => {
  try {
    const { type, street, city, state, pincode } = req.body;
    const addressIndex = req.params.id;
    const userId = req.user._id;

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if address exists
    if (!user.addresses[addressIndex]) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Update the address
    user.addresses[addressIndex] = {
      addressType: type || 'Home',
      street,
      city,
      state,
      pincode
    };

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      addresses: user.addresses
    });

  } catch (error) {
    console.error('Error in updateAddress:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update address'
    });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const addressIndex = req.params.id;
    const userId = req.user._id;

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if address exists
    if (!user.addresses[addressIndex]) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Remove the address
    user.addresses.splice(addressIndex, 1);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
      addresses: user.addresses
    });

  } catch (error) {
    console.error('Error in deleteAddress:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const renderCheckoutPage = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user._id) {
      return res.status(400).send("User is not authenticated.");
    }

    // Fetch the cart and user data
    const cart = await Cart.findOne({ user: user._id }).populate('items.product', 'name salesPrice');
    const userWithAddresses = await User.findById(user._id).populate('addresses');

    const addresses = userWithAddresses ? userWithAddresses.addresses : [];

    // Prepare cart items
    const cartItems = cart?.items.map(item => ({
      product: item?.product?.name || 'Unknown',
      quantity: item.quantity,
      price: item?.product?.salesPrice || 0,
    })) || [];

    // Calculate cart count and total amount
    const cartCount = cart?.items.reduce((count, item) => count + item.quantity, 0) || 0; // Sum of all quantities
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Render the checkout page
    res.render('checkout', {
      cartCount,
      cartItems,
      totalAmount,
      addresses,
    });
  } catch (error) {
    console.error("Error fetching cart data for user:", req.user?._id, error);
    res.status(500).send("Something went wrong while fetching cart data.");
  }
};

const confirmOrder = async (req, res) => {
  const { addressId, paymentMethod } = req.body;
  const userId = req.user?._id;

  if (!addressId || !paymentMethod) {
    return res.status(400).send('Address and payment method are required.');
  }

  try {
    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      return res.status(400).send('Cart is empty.');
    }
    console.log('User ID from request:', userId);


    const user = await User.findById(userId);
    
    
    if (!user || !user.addresses || user.addresses.length === 0) {
      return res.status(400).send('No addresses available for this user.');
    }

    const selectedAddress = user.addresses.find(
      addr => addr.id.toString() === addressId
    );
    if (!selectedAddress) {
      return res.status(400).send('Address not found.');
    }

    const totalAmount = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    

    for (const item of cart.items) {
      const product = item.product;
    
      console.log('Product info:', product); // Debugging
    
      if (!product) {
        return res.status(400).send(`Product ${item.product} not found.`);
      }
    
      if (typeof product.save !== 'function') {
        return res.status(500).send('Product is not a valid Mongoose document.');
      }
    
      // Check stock and save changes
      if (product.quantity < item.quantity) {
        return res.status(400).send(`Not enough stock for product: ${product.name}`);
      }
    
      product.quantity -= item.quantity;
      await product.save(); // Save updated product quantity
    }
    

    // Create a new order
    const newOrder = new Order({
      user: userId, // Ensure this is correctly assigned
      items: cart.items,
      totalAmount,
      deliveryAddress: selectedAddress,
      paymentMethod,
    });
    


    const savedOrder = await newOrder.save();
    console.log(savedOrder,'hiiim')
       
    // Clear the cart
    cart.items = [];
    await cart.save();

    res.status(200).json({
      message: 'Order confirmed successfully!',
      order: savedOrder,
    });
  } catch (error) {
    console.error('Error confirming order:', {
      message: error.message,
      stack: error.stack,
      input: { addressId, paymentMethod, userId },
    });
    res.status(500).send('Error confirming order.');
  }
};

const getLatestOrder = async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    return res.status(400).send('User not authenticated.');
  }

  try {
    const latestOrder = await Order.findOne({ user: userId })
      .populate('items.product', 'name price productImage') // Populate product details
      .populate('deliveryAddress') // Populate address details
      .sort({ createdAt: -1 }); // Sort by latest order

    console.log('Latest Order:', latestOrder);

    if (!latestOrder) {
      return res.status(404).send('No orders found for this user.');
    }

    res.render('orderDetail', { orders: [latestOrder] }); // Send the latest order to the view

  } catch (error) {
    console.error('Error retrieving latest order:', error);
    res.status(500).send('Error retrieving latest order.');
  }
};


const getOrderDetails = async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    return res.status(400).send('User not authenticated.');
  }

  try {
    // Fetch orders for the user and populate product details
    const orders = await Order.find({ user: userId })
      .populate('items.product', 'name price productImage') // Populating product details
      .populate('deliveryAddress') // Populating address
      .sort({ createdAt: -1 }); // Sorting orders by creation date in descending order

    console.log(orders); // Logs orders for debugging

    if (!orders || orders.length === 0) {
      return res.render('userOrders', { orders: [], cartCount: 0 });
    }

    // Get cart count for the header
    const cart = await Cart.findOne({ user: userId });
    const cartCount = cart ? cart.items.length : 0;

    // Render the orders page
    res.render('userOrders', { orders, cartCount });

  } catch (error) {
    console.error('Error retrieving orders:', error); 
    res.status(500).send('Error retrieving orders.');
  }
};



const updateOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const updateData = req.body;

    const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, { new: true });

    if (!updatedOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.status(200).json({
      message: 'Order updated successfully',
      order: updatedOrder,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating order', error });
  }
};



module.exports = {
  renderProductDetails,
  submitRating,
  addToCart,
  getCart,
  updateCart,
  removeFromCart,
  getProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  renderCheckoutPage,
  confirmOrder,
  getLatestOrder,
  getOrderDetails,
  updateOrderDetails
};
