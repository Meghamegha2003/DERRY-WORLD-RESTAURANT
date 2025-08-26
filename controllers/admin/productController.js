const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { saveBase64Image } = require("../../helpers/imageHelper");

exports.viewProducts = async (req, res) => {
  const currentPage = parseInt(req.query.page) || 1;
  const itemsPerPage = 10;

  try {
   
    const totalProducts = await Product.countDocuments();
    const products = await Product.find()
      .populate('category', 'name')
      .sort({ createdAt: -1 })  
      .skip((currentPage - 1) * itemsPerPage)
      .limit(itemsPerPage);

    const totalPages = Math.ceil(totalProducts / itemsPerPage);

    res.render('admin/products', {
      title: 'Product Management',
      products,
      currentPage,
      totalPages,
      limit: itemsPerPage,
      totalItems: totalProducts,
      path:"/admin/products"
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error retrieving products');
  }
};

exports.loadAddProductPage = async (req, res) => {
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

exports.addProduct = async (req, res) => {
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
    
   if (!productName || !category || !regularPrice || !quantity || !description || !dietaryType) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required' 
      });
    }

    // Check for unique product name 
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

exports.loadEditProductPage = async (req, res) => {
  try {
    const productId = req.params.id;
    const [product, categories] = await Promise.all([
      Product.findById(productId).populate('category'),
      Category.find({ isBlocked: false, isListed: true })
    ]);

    if (!product) {
      return res.status(404).send('Product not found');
    }

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

exports.updateProduct = async (req, res) => {
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

    if (productImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

    while (productImages.length < 4) {
      productImages.push(null);
    }
    productImages = productImages.slice(0, 4);

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

exports.getProductDetails = async (req, res) => {
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


exports.deleteProductImage = async (req, res) => {
  try {
    const { productId, imageIndex } = req.params;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const index = parseInt(imageIndex);
    if (index >= 0 && index < product.productImage.length) {
      const imagePath = path.join('public', product.productImage[index]);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }

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

exports.toggleProductBlock = async (req, res) => {
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




