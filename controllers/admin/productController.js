const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { saveBase64Image } = require("../../helpers/imageHelper");
const { log } = require('console');
const sharp=require('sharp')

const viewProducts = async (req, res) => {
  const currentPage = parseInt(req.query.page) || 1;
  const itemsPerPage = 10;

  try {
   
    const totalProducts = await Product.countDocuments();
    const products = await Product.find()
      .populate('category', 'name') // Populate category name
      .skip((currentPage - 1) * itemsPerPage)
      .limit(itemsPerPage);

    const totalPages = Math.ceil(totalProducts / itemsPerPage);

    res.render('products', {
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
    
      const categories = await Category.find();
      const product = {}; 
      res.render('addProduct', { categories, product, productImage: [] });  // Passing the empty product and productImage array
  } catch (err) {
      console.error('Error loading add product page:', err);
      res.status(500).send('Server Error');
  }
};

const addProduct = async (req, res) => {
  try {
    const { productName, category, regularPrice, salesPrice, quantity, description } = req.body;
    
    // Check for unique product name (case insensitive)
    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${productName}$`, 'i') }
    });

    if (existingProduct) {
      return res.status(400).json({ 
        message: 'A product with this name already exists' 
      });
    }

    // Check if all 4 images are uploaded
    if (!req.files || Object.keys(req.files).length !== 4) {
      return res.status(400).json({ 
        message: 'Please upload all 4 product images' 
      });
    }

    const uploadedImages = req.files;
    const imagePaths = [];
    const uploadDir = path.join('public', 'uploads', 'reImage');

    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Process each image
    for (let i = 0; i < 4; i++) {
      const imageField = `imageInput${i}`;
      if (!uploadedImages[imageField] || !uploadedImages[imageField][0]) {
        return res.status(400).json({ 
          message: `Missing image for position ${i + 1}` 
        });
      }

      const image = uploadedImages[imageField][0];
      try {
        const filename = `product_${Date.now()}_${i}.jpg`;
        const croppedImagePath = path.join(uploadDir, filename);

        await sharp(image.path)
          .resize(600, 600, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 80 })
          .toFile(croppedImagePath);

        imagePaths.push(path.join('uploads', 'reImage', filename).replace(/\\/g, '/'));

        fs.unlink(image.path, (err) => {
          if (err) console.error('Error deleting temporary file:', err);
        });
      } catch (err) {
        console.error('Error processing image:', err);
        return res.status(500).json({ 
          message: 'Error processing image. Please try again.' 
        });
      }
    }

    const product = new Product({
      name: productName.trim(),
      category,
      regularPrice,
      salesPrice,
      quantity,
      description: description.trim(),
      productImage: imagePaths
    });

    await product.save();
    res.status(200).json({ 
      success: true, 
      message: 'Product added successfully' 
    });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ 
      message: 'Failed to add product. Please try again.' 
    });
  }
};

const editProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId).populate('category');
    const categories = await Category.find();

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Ensure product.productImage is an array
    if (!Array.isArray(product.productImage)) {
      product.productImage = [];
    }

    // Pad the array with nulls if it has less than 4 items
    while (product.productImage.length < 4) {
      product.productImage.push(null);
    }

    res.render('editProduct', { 
      product, 
      categories,
      error: null 
    });
  } catch (error) {
    console.error('Error loading edit product page:', error);
    res.status(500).json({ message: 'Error loading edit product page' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { productName, category, regularPrice, salesPrice, quantity, description } = req.body;
    
    // Find existing product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check for unique name, excluding current product
    const existingProduct = await Product.findOne({
      _id: { $ne: productId },
      name: { $regex: new RegExp(`^${productName}$`, 'i') }
    });

    if (existingProduct) {
      return res.status(400).json({ 
        message: 'A product with this name already exists' 
      });
    }

    // Update basic product information
    product.name = productName.trim();
    product.category = category;
    product.regularPrice = regularPrice;
    product.salesPrice = salesPrice;
    product.quantity = quantity;
    product.description = description.trim();

    // Handle image updates if files were uploaded
    if (req.files) {
      const uploadedImages = req.files;
      const imagePaths = [...product.productImage];

      for (let i = 0; i < 4; i++) {
        const imageField = `imageInput${i}`;
        
        if (uploadedImages && uploadedImages[imageField] && uploadedImages[imageField][0]) {
          const image = uploadedImages[imageField][0];
          try {
            const filename = `product_${Date.now()}_${i}.jpg`;
            const croppedImagePath = path.join('public', 'uploads', 'reImage', filename);

            // Ensure directory exists
            const dir = path.dirname(croppedImagePath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }

            // Delete old image if it exists
            if (imagePaths[i]) {
              const oldImagePath = path.join('public', imagePaths[i]);
              if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
              }
            }

            // Save the new image
            await sharp(image.path)
              .resize(600, 600, {
                fit: 'cover',
                position: 'center'
              })
              .jpeg({ quality: 80 })
              .toFile(croppedImagePath);

            imagePaths[i] = path.join('uploads', 'reImage', filename).replace(/\\/g, '/');

            fs.unlink(image.path, (err) => {
              if (err) console.error('Error deleting temporary file:', err);
            });
          } catch (err) {
            console.error('Error processing image:', err);
            return res.status(500).json({ 
              message: 'Error processing image. Please try again.' 
            });
          }
        }
      }

      product.productImage = imagePaths;
    }

    await product.save();
    res.status(200).json({ 
      success: true, 
      message: 'Product updated successfully' 
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ 
      message: 'Failed to update product. Please try again.' 
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
    const product = await Product.findById(productId).populate('category');

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

module.exports = {
  viewProducts,
  loadAddProductPage,
  addProduct,
  editProduct,
  updateProduct,
  deleteProductImage,
  uploadCroppedImage,
  toggleProductBlock,
  getPaginatedProducts,
  checkProductName,
  getProductDetails
};