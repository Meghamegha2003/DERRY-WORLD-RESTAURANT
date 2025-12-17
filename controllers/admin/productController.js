const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const { deleteFromCloudinary } = require('../../config/cloudinary');

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
    res.status(500).send('Server Error');
  }
};

exports.addProduct = async (req, res) => {
  try {

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

    // Validate quantity
    const quantityValue = parseInt(quantity);
    if (isNaN(quantityValue) || quantityValue <= 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Quantity must be a positive number greater than 0' 
      });
    }

    if (parseFloat(salesPrice) >= parseFloat(regularPrice)) {
      return res.status(400).json({ 
        success: false,
        message: 'Sales price must be less than regular price' 
      });
    }

    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${productName}$`, 'i') }
    });
    
    if (existingProduct) {
      return res.status(400).json({ 
        success: false,
        message: 'A product with this name already exists' 
      });
    }

    // Check if we have images from Cloudinary middleware or need to handle them differently
    let productImages = [];
    
    if (req.cloudinaryUploads && req.cloudinaryUploads.length > 0) {
      productImages = req.cloudinaryUploads;
    } else if (req.files && req.files.length > 0) {
      // Fallback: if middleware didn't process, we still have files
      return res.status(400).json({ 
        success: false,
        message: 'Image processing failed. Please try again.' 
      });
    } else {
      return res.status(400).json({ 
        success: false,
        message: 'Please upload at least one product image' 
      });
    }

    const newProduct = new Product({
      name: productName.trim(),
      category,
      regularPrice: parseFloat(regularPrice),
      salesPrice: parseFloat(salesPrice) || parseFloat(regularPrice),
      quantity: parseInt(quantity),
      description: description.trim(),
      dietaryType,
      productImage: productImages,
      isListed: true,
      isBlocked: false,
      updatedAt: new Date()
    });

    await newProduct.save();
    res.status(201).json({ 
      success: true,
      message: 'Product added successfully',
      product: newProduct
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to add product',
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

    res.render('admin/editProduct', {
      title: 'Edit Product',
      product,
      categories,
      productImage: product.productImage || []
    });
  } catch (err) {
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

    // Validate quantity
    const quantityValue = parseInt(quantity);
    if (isNaN(quantityValue) || quantityValue <= 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Quantity must be a positive number greater than 0' 
      });
    }

    if (parseFloat(salesPrice) >= parseFloat(regularPrice)) {
      return res.status(400).json({ 
        success: false,
        message: 'Sales price must be less than regular price' 
      });
    }

    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${productName.trim()}$`, 'i') },
      _id: { $ne: productId }
    });
    
    if (existingProduct) {
      return res.status(400).json({ 
        success: false,
        message: 'A product with this name already exists' 
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    let productImages = [];
    
    // Handle existing images from form data
    if (req.body['existingImages[]']) {
      if (Array.isArray(req.body['existingImages[]'])) {
        productImages = [...req.body['existingImages[]']];
      } else {
        productImages = [req.body['existingImages[]']];
      }
    } else if (req.body.existingImages) {
      if (Array.isArray(req.body.existingImages)) {
        productImages = [...req.body.existingImages];
      } else {
        productImages = [req.body.existingImages];
      }
    }

    // Handle new uploaded images
    if (req.cloudinaryUploads && req.cloudinaryUploads.length > 0) {
      productImages.push(...req.cloudinaryUploads);
    }

    // Remove null/empty values and ensure we have at least one image
    productImages = productImages.filter(img => img && img.trim() !== '');
    
    
    if (productImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

    // Ensure we don't exceed 4 images
    productImages = productImages.slice(0, 4);

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        name: productName.trim(),
        category,
        regularPrice: parseFloat(regularPrice),
        salesPrice: parseFloat(salesPrice),
        quantity: parseInt(quantity),
        description: description.trim(),
        dietaryType,
        productImage: productImages,
        updatedAt: new Date()
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
      const imageUrl = product.productImage[index];
      
      // Extract public_id from Cloudinary URL for deletion
      if (imageUrl && imageUrl.includes('cloudinary.com')) {
        try {
          const urlParts = imageUrl.split('/');
          const publicIdWithExt = urlParts[urlParts.length - 1];
          const publicId = publicIdWithExt.split('.')[0];
          const folder = urlParts[urlParts.length - 2];
          const fullPublicId = `${folder}/${publicId}`;
          
          await deleteFromCloudinary(fullPublicId);
        } catch (deleteError) {
        }
      }

      product.productImage.splice(index, 1);
      await product.save();

      res.json({ success: true, message: 'Image deleted successfully' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid image index' });
    }
  } catch (error) {
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
    res.status(500).json({ 
      success: false, 
      message: 'Failed to toggle product block status' 
    });
  }
};

exports.checkProductName = async (req, res) => {
  try {
    const { name, excludeId } = req.query;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required'
      });
    }

    const query = {
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existingProduct = await Product.findOne(query);
    
    res.json({
      exists: !!existingProduct,
      success: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking product name'
    });
  }
};




