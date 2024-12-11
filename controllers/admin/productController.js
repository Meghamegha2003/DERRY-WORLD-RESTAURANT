const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

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
      const product = {};  // Define an empty product object
      res.render('addProduct', { categories, product, productImage: [] });  // Passing the empty product and productImage array
  } catch (err) {
      console.error('Error loading add product page:', err);
      res.status(500).send('Server Error');
  }
};

const addProduct = async (req, res) => {
  try {
    const { productName, description, category, regularPrice, salesPrice, quantity, type } = req.body;
    
    // Validate required fields
    if (!productName || !description || !category || !regularPrice || !salesPrice || !quantity || !type) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate images
    if (!req.files || req.files.length !== 4) {
      return res.status(400).json({ message: 'Please upload exactly 4 images' });
    }

    // Create image paths
    const imagePaths = req.files.map(file => '/uploads/' + file.filename);
    
    // Create new product
    const product = new Product({
      productName,
      description,
      category,
      regularPrice,
      salesPrice,
      quantity,
      type,
      productImage: imagePaths,
      status: 'Available' // Set default status
    });

    await product.save();
    res.status(200).json({ message: true, product });
  } catch (err) {
    console.error('Error adding product:', err);
    // Delete uploaded files if product creation fails
    if (req.files) {
      req.files.forEach(file => {
        const filePath = path.join(__dirname, '../../public/uploads', file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    res.status(500).json({ message: 'Error adding product', error: err.message });
  }
};

const editProductForm = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId).populate('category', 'name');
    const categories = await Category.find({ isActive: true });

    if (!product) {
      return res.status(404).send('Product not found');
    }

    res.render('editProduct', { product, categories });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error loading product details');
  }
};

const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { productName, description, category, regularPrice, salesPrice, quantity, type } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Update basic product information
    product.productName = productName;
    product.description = description;
    product.category = category;
    product.regularPrice = regularPrice;
    product.salesPrice = salesPrice;
    product.quantity = quantity;
    product.type = type;

    // Handle new images if they are uploaded
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => '/uploads/' + file.filename);
      
      // If replacing all images, delete old ones first
      if (req.body.replaceAll === 'true') {
        // Delete old image files
        const fs = require('fs');
        const path = require('path');
        product.productImage.forEach(imagePath => {
          const fullPath = path.join(__dirname, '../../public', imagePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        });
        product.productImage = newImages;
      } else {
        // Add new images to existing ones
        product.productImage = [...product.productImage, ...newImages].slice(0, 4); // Keep max 4 images
      }
    }

    await product.save();
    res.json({ message: 'Product updated successfully', product });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Error updating product', error: error.message });
  }
};

const deleteProductImage = async (req, res) => {
  try {
    const { productId, imageIndex } = req.params;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get the image path to delete
    const imageToDelete = product.productImage[imageIndex];
    
    // Remove the image from the array
    product.productImage.splice(imageIndex, 1);
    await product.save();

    // Delete the actual file
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../../public', imageToDelete);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ message: 'Error deleting image' });
  }
};

const uploadCroppedImage = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = '/uploads/products/' + req.file.filename;
    res.status(200).json({ filePath });
  } catch (error) {
    console.error('Error uploading cropped image:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};

module.exports = {
  viewProducts,
  loadAddProductPage,
  addProduct,
  editProductForm,
  updateProduct,
  deleteProductImage,
  uploadCroppedImage
};
