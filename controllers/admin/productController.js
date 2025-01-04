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
    const uploadedImages = req.files; // Get the uploaded images
    const imagePaths = [];

    for (let i = 0; i < 4; i++) {
      const imageField = `imageInput${i}`;
      
      if (uploadedImages[imageField] && uploadedImages[imageField][0]) {
        const image = uploadedImages[imageField][0];
        const croppedImagePath = path.join('public/uploads/reImage', 'cropped_' + image.filename);

        // Check image dimensions
        const metadata = await sharp(image.path).metadata();
        const cropWidth = Math.min(metadata.width,600);
        const cropHeight = Math.min(metadata.height, 600);

        await sharp(image.path)
          .extract({ width: cropWidth, height: cropHeight, left: 0, top: 0 })
          .toFile(croppedImagePath);

        imagePaths.push(path.join('uploads/reImage', 'cropped_' + image.filename));
      }
    }

    const newProduct = new Product({
      name: productName,
      category,
      regularPrice,
      salesPrice,
      quantity,
      description,
      productImage: imagePaths,
    });

    await newProduct.save();
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ message: 'Failed to add product. Please try again.' });
  }
};

const editProduct = async (req, res) => {
  try {
    const productId = req.params.id; // Get the product ID from the route parameter
    const { productName, category, regularPrice, salesPrice, quantity, description } = req.body;
    const uploadedImages = req.files; // Get the uploaded images
    const existingProduct = await Product.findById(productId); // Find the product by ID

    if (!existingProduct) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const updatedImagePaths = existingProduct.productImage.slice(); // Copy existing images

    for (let i = 0; i < 4; i++) {
      const imageField = `imageInput${i}`;

      if (uploadedImages[imageField] && uploadedImages[imageField][0]) {
        const image = uploadedImages[imageField][0];
        const croppedImagePath = path.join('public/uploads/reImage', 'cropped_' + image.filename);

        // Check image dimensions
        const metadata = await sharp(image.path).metadata();
        const cropWidth = Math.min(metadata.width, 600);
        const cropHeight = Math.min(metadata.height, 600);

        await sharp(image.path)
          .extract({ width: cropWidth, height: cropHeight, left: 0, top: 0 })
          .toFile(croppedImagePath);

        // Replace the corresponding image in the array
        updatedImagePaths[i] = path.join('uploads/reImage', 'cropped_' + image.filename);
      }
    }

    // Update the product details
    existingProduct.name = productName;
    existingProduct.category = category;
    existingProduct.regularPrice = regularPrice;
    existingProduct.salesPrice = salesPrice;
    existingProduct.quantity = quantity;
    existingProduct.description = description;
    existingProduct.productImage = updatedImagePaths;

    await existingProduct.save();

    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error editing product:', error);
    res.status(500).json({ message: 'Failed to update product. Please try again.' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const {
      productName,
      category,
      regularPrice,
      salesPrice,
      quantity,
      description,
      croppedImage0,
      croppedImage1,
      croppedImage2,
      croppedImage3,
    } = req.body;

    const productId = req.params.id;

    if (!productName || !description || !regularPrice || !salesPrice || !quantity || !category) {
      return res.status(400).json({ error: "All required fields must be filled" });
    }
console.log("hii",category)
    const parsedRegularPrice = parseFloat(regularPrice);
    const parsedSalesPrice = parseFloat(salesPrice);
    const parsedQuantity = parseInt(quantity, 10);

    if (isNaN(parsedRegularPrice) || isNaN(parsedSalesPrice) || isNaN(parsedQuantity)) {
      return res.status(400).json({ error: "Prices and quantity must be valid numbers" });
    }

    const folderPath = path.join(__dirname, "../../public/uploads");

    const croppedImages = [croppedImage0, croppedImage1, croppedImage2, croppedImage3];
    const imagePaths = await Promise.all(
      croppedImages.map(async (image, index) => {
        if (image) {
          const fileName = `product-${Date.now()}-${index}.png`;
          return await saveBase64Image(image, fileName, folderPath);
        }
        return null;
      })
    );

    const newImages = imagePaths.filter((path) => path !== null);

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    product.name = productName;
    product.description = description;
    product.category = category;
    product.regularPrice = parsedRegularPrice;
    product.salesPrice = parsedSalesPrice;
    product.quantity = parsedQuantity;

    if (newImages.length > 0) {
      if (Array.isArray(product.images) && product.images.length > 0) {
        product.images.forEach((image) => {
          const imagePath = path.join(folderPath, image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        });
      }
      product.images = newImages;
    }

    await product.save();

    res.redirect('/admin/products');
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Failed to update product" });
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
    const filePath = path.join(__dirname, '../../public/uploads', imageToDelete);
    
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

    const filePath = 'public/uploads' + req.file.filename;
    res.status(200).json({ filePath });
  } catch (error) {
    console.error('Error uploading cropped image:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};


// Toggle Product Status (Activate/Deactivate)
const toggleProductStatus = async (req, res) => {
  const productId = req.params.id;

  try {
    // Find the product by ID
    const product = await Product.findById(productId);
    if (!product) return res.status(404).send('Product not found');

    // Toggle isAvailable status
    product.isAvailable = !product.isAvailable;

    // Save changes to the database
    await product.save();

    res.redirect('/admin/products'); // Redirect back to the products list
  } catch (error) {
    console.error('Error toggling product status:', error);
    res.status(500).send('Error toggling product status');
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


module.exports = {
  viewProducts,
  loadAddProductPage,
  addProduct,
  editProduct,
  updateProduct,
  deleteProductImage,
  uploadCroppedImage,
  toggleProductStatus,
  getPaginatedProducts
};
  