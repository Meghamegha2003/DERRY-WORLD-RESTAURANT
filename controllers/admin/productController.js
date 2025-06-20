const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { saveBase64Image } = require("../../helpers/imageHelper");
const { log } = require('console');

const viewProducts = async (req, res) => {
  const currentPage = parseInt(req.query.page) || 1;
  const itemsPerPage = 10;

  try {
   
    const totalProducts = await Product.countDocuments();
    const products = await Product.find()
      .populate('category', 'name')
      .sort({ createdAt: -1 })  // Sort by creation date in descending order
      .skip((currentPage - 1) * itemsPerPage)
      .limit(itemsPerPage);

    const totalPages = Math.ceil(totalProducts / itemsPerPage);

    res.render('admin/products', {
      title: 'Product Management',
      products,
      currentPage,
      totalPages
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error retrieving products');
  }
};

const loadAddProductPage = async (req, res) => {
  try {
    const categories = await Category.find({ isBlocked: false, isListed: true });
    const product = {}; 
    res.render('admin/addProduct', { 
      title: 'Add New Product',
      categories,
      product, 
      productImage: [] 
    });  
  } catch (err) {
    console.error('Error loading add product page:', err);
    res.status(500).send('Server Error');
  }
};

const addProduct = async (req, res) => {
  try {
    console.log('Received product data:', req.body);
    console.log('Received files:', req.files);

    const { 
      productName, 
      category, 
      regularPrice, 
      salesPrice, 
      quantity, 
      description,
      dietaryType 
    } = req.body;
    
    // Validate input fields
    if (!productName || !category || !regularPrice || !quantity || !description || !dietaryType) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required' 
      });
    }

    // Check for unique product name (case insensitive)
    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${productName}$`, 'i') }
    });
    
    if (existingProduct) {
      return res.status(400).json({ 
        success: false,
        message: 'A product with this name already exists' 
      });
    }

    // Check if at least one image is uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Please upload at least one product image' 
      });
    }

    // Process and save uploaded images
    const uploadDir = path.join('public', 'uploads', 'reImage');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const imagePaths = [];
    for (const file of req.files) {
      try {
        if (!file.buffer) {
          console.error('No buffer found in file:', file);
          continue;
        }

        const filename = `product_${Date.now()}-${Math.floor(Math.random() * 1000000000)}.jpg`;
        const outputPath = path.join(uploadDir, filename);

        await sharp(file.buffer)
          .resize(800, 800, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .jpeg({ quality: 85 })
          .toFile(outputPath);

        const imagePath = path.posix.join('/uploads', 'reImage', filename);
        imagePaths.push(imagePath);

      } catch (err) {
        console.error('Error processing image:', err);
      }
    }

    // Create new product
    const newProduct = new Product({
      name: productName.trim(),
      category,
      regularPrice: parseFloat(regularPrice),
      salesPrice: parseFloat(salesPrice) || parseFloat(regularPrice),
      quantity: parseInt(quantity),
      description: description.trim(),
      dietaryType,
      productImage: imagePaths,
      isListed: true,
      isBlocked: false,
      updatedAt: new Date()
    });

    try {
      await newProduct.save();
      console.log('Product saved successfully:', newProduct._id);
      console.log('Saved image paths:', imagePaths);
      res.status(201).json({ 
        success: true,
        message: 'Product added successfully',
        product: newProduct
      });
    } catch (saveError) {
      console.error('Error saving product to database:', saveError);
      res.status(500).json({ 
        success: false,
        message: 'Failed to save product to database',
        error: saveError.message
      });
    }

  } catch (error) {
    console.error('Unexpected error in addProduct:', error);
    res.status(500).json({ 
      success: false,
      message: 'Unexpected error adding product',
      error: error.message 
    });
  }
};

const deleteProductImage = async (req, res) => {
  try {
    const { productId, imageIndex } = req.params;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const index = parseInt(imageIndex);
    if (index >= 0 && index < product.productImage.length) {
      // Delete the image file
      const imagePath = path.join('public', product.productImage[index]);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }

      // Remove the image path from the array
      product.productImage[index] = null;
      product.productImage = product.productImage.filter(path => path !== null);
      await product.save();

      res.json({ success: true, message: 'Image deleted successfully' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid image index' });
    }
  } catch (error) {
    console.error('Error deleting product image:', error);
    res.status(500).json({ success: false, message: 'Failed to delete image' });
  }
};

const uploadCroppedImage = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = 'public/uploads' + req.file.filename;
    res.status(200).json({ filePath });
  } catch (error) {
    console.error('Error uploading cropped image:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};

// Toggle product block status
const toggleProductBlock = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // Toggle the isBlocked status
    product.isBlocked = !product.isBlocked;
    await product.save();

    // If product is now blocked, remove it from all carts
    if (product.isBlocked) {
      await Cart.updateMany(
        { 'items.product': productId },
        { $pull: { items: { product: productId } } }
      );
    }

    res.json({ 
      success: true, 
      message: `Product ${product.isBlocked ? 'blocked' : 'unblocked'} successfully`,
      isBlocked: product.isBlocked 
    });
  } catch (error) {
    console.error('Error toggling product block status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to toggle product block status' 
    });
  }
};

const getPaginatedProducts = async (req, res) => {
  try {
    const perPage = 6; // Display 6 products per page
    const page = parseInt(req.query.page) || 1; // Get current page from query params, default to 1

    // Calculate total products and pages
    const totalProducts = await Product.countDocuments();
    const totalPages = Math.ceil(totalProducts / perPage);

    // Fetch products for the current page
    const products = await Product.find()
      .populate('category', 'name')
      .sort({ createdAt: -1 })  // Sort by creation date in descending order
      .skip((page - 1) * perPage) // Skip products for previous pages
      .limit(perPage);

    // Render the products page with pagination details
    res.render('admin/products', {
      products,
      currentPage: page,
      totalPages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// Check if product name exists
const checkProductName = async (req, res) => {
  try {
    const { name } = req.query;
    
    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    res.json({ exists: !!existingProduct });
  } catch (error) {
    console.error('Error checking product name:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get product details
const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId)
      .populate('category');

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    res.json(product);
  } catch (error) {
    console.error('Error getting product details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get product details' 
    });
  }
};

const loadEditProductPage = async (req, res) => {
  try {
    const productId = req.params.id;
    const [product, categories] = await Promise.all([
      Product.findById(productId).populate('category'),
      Category.find({ isBlocked: false, isListed: true })
    ]);

    if (!product) {
      return res.status(404).send('Product not found');
    }

    // Log product data for debugging
    console.log('Loading edit page for product:', {
      id: product._id,
      name: product.name,
      images: product.productImage
    });

    res.render('admin/editProduct', {
      title: 'Edit Product',
      product,
      categories,
      productImage: product.productImage || []
    });
  } catch (err) {
    console.error('Error loading edit product page:', err);
    res.status(500).send('Server Error');
  }
};

const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { 
      productName, 
      category, 
      regularPrice, 
      salesPrice, 
      quantity, 
      description,
      dietaryType
    } = req.body;

    
    // Get the existing product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Handle images
    let productImages = [];
    
    // Add existing images
    if (req.body.existingImages) {
      if (Array.isArray(req.body.existingImages)) {
        productImages = [...req.body.existingImages];
      } else {
        productImages = [req.body.existingImages];
      }
    }

    // Process and add new images
    if (req.files && req.files.length > 0) {
      const uploadDir = 'public/uploads/reImage';
      
      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Process each new image
      for (const file of req.files) {
        try {
          if (!file.buffer) {
            console.error('No buffer found in file:', file);
            continue;
          }

          const filename = `product_${Date.now()}-${Math.floor(Math.random() * 1000000000)}.jpg`;
          const outputPath = path.join(uploadDir, filename);

          // Process image with sharp
          await sharp(file.buffer)
            .resize(800, 800, {
              fit: 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 85 })
            .toFile(outputPath);

          // Use posix-style paths with leading slash
          const imagePath = path.posix.join('/uploads', 'reImage', filename);
          productImages.push(imagePath);

          
        } catch (err) {
          console.error('Error processing image:', err);
          // Continue with other images if one fails
        }
      }
    }

    // Validate that we have at least one image
    if (productImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

    // Always keep 4 slots, pad with nulls if needed
    while (productImages.length < 4) {
      productImages.push(null);
    }
    productImages = productImages.slice(0, 4);

    // Update product (do not filter out nulls)
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        name: productName,
        category,
        regularPrice,
        salesPrice,
        quantity,
        description,
        dietaryType,
        productImage: productImages
      },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: 'Failed to update product'
      });
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Error updating product'
    });
  }
};

// Search products
const searchProducts = async (req, res) => {
  try {
    const searchQuery = req.query.q;
    const products = await Product.find({
      $or: [
        { name: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } },
        { category: { $regex: searchQuery, $options: 'i' } }
      ]
    }).populate('category');

    res.render('admin/products', {
      products,
      searchQuery,
      title: 'Search Results - Products',
      path: '/admin/products'
    });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).render('error', {
      message: 'Error searching products',
      error: error
    });
  }
};

const getProductsJson = async (req, res) => {
  try {
    const products = await Product.find().populate('category', 'name').sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
  }
};

module.exports = {
  viewProducts,
  loadAddProductPage,
  addProduct,
  loadEditProductPage,
  updateProduct,
  toggleProductBlock,
  getProductDetails,
  deleteProductImage,
  searchProducts,
  getProductsJson
};