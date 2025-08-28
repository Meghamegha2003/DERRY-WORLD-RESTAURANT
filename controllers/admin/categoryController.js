const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");

(exports.listCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const categories = await Category.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategories / limit);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        success: true,
        categories,
        pagination: {
          currentPage: page,
          totalPages,
        },
      });
    }

    res.render("admin/category", {
      categories,
      currentPage: page,
      totalPages,
      success: req.query.success,
      error: req.query.error,
      user: req.admin,
      path: "/admin/categories",
    });
  } catch (error) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch categories",
      });
    }
    res.status(500).render("admin/category", {
      error: "Failed to fetch categories",
      categories: [],
      currentPage: 1,
      totalPages: 1,
      user: req.admin,
    });
  }
}),
  (exports.addCategory = async (req, res) => {
    try {
      const { name, description } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category name is required",
        });
      }

      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp("^" + name.trim() + "$", "i") },
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category already exists",
        });
      }

      const category = new Category({
        name: name.trim(),
        description: description ? description.trim() : "",
        isBlocked: true,
      });

      await category.save();

      res.status(201).json({
        success: true,
        message: "Category added successfully",
        category,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to add category",
      });
    }
  }),
  (exports.editCategory = async (req, res) => {
    try {
      const { categoryId } = req.params;
      const { name, description } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category name is required",
        });
      }

      const existingCategory = await Category.findById(categoryId);
      if (!existingCategory) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      const duplicateCategory = await Category.findOne({
        _id: { $ne: categoryId },
        name: { $regex: new RegExp("^" + name.trim() + "$", "i") },
      });

      if (duplicateCategory) {
        return res.status(400).json({
          success: false,
          message: "Category name already exists",
        });
      }

      const updatedCategory = await Category.findByIdAndUpdate(
        categoryId,
        {
          name: name.trim(),
          description: description ? description.trim() : "",
        },
        { new: true }
      );

      res.json({
        success: true,
        message: "Category updated successfully",
        category: updatedCategory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to update category",
      });
    }
  }),
  (exports.toggleStatus = async (req, res) => {
    try {
      const { categoryId } = req.params;
      const category = await Category.findById(categoryId);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      const wasBlocked = category.isBlocked;
      category.isBlocked = !category.isBlocked;
      await category.save();

      if (category.isBlocked && !wasBlocked) {
        await exports.removeBlockedCategoryFromCarts(categoryId);
      }

      return res.json({
        success: true,
        message: `Category ${
          category.isBlocked ? "blocked" : "unblocked"
        } successfully`,
        isBlocked: category.isBlocked,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to update category status",
        error: error.message,
      });
    }
  }),
  (exports.removeBlockedCategoryFromCarts = async function (categoryId) {
    try {
     
      const productsInCategory = await Product.find({ category: categoryId });
      const productIds = productsInCategory.map((product) => product._id);

      if (productIds.length === 0) {
        return;
      }

           const cartsWithBlockedProducts = await Cart.find({
        "items.product": { $in: productIds },
      });

    

      let totalProductsRemoved = 0;
      for (const cart of cartsWithBlockedProducts) {
        const originalItemCount = cart.items.length;

        cart.items = cart.items.filter((item) => {
          const productId = item.product.toString();
          const shouldRemove = productIds.some(
            (blockedId) => blockedId.toString() === productId
          );
          if (shouldRemove) {
            totalProductsRemoved++;
          }
          return !shouldRemove;
        });

        if (cart.items.length === 0) {
          cart.appliedCoupon = undefined;
          cart.couponDiscount = 0;
          cart.couponCode = null;
          cart.couponType = null;
          cart.couponValue = 0;
        } else if (cart.appliedCoupon) {
          const {
            validateAndUpdateCartCoupon,
          } = require("../../helpers/couponHelper");
          try {
            const couponValidation = await validateAndUpdateCartCoupon(cart);
            if (!couponValidation.valid) {
              cart.appliedCoupon = undefined;
              cart.couponDiscount = 0;
              cart.couponCode = null;
              cart.couponType = null;
              cart.couponValue = 0;
            }
          } catch (couponError) {

            cart.appliedCoupon = undefined;
            cart.couponDiscount = 0;
            cart.couponCode = null;
            cart.couponType = null;
            cart.couponValue = 0;
          }
        }

        const totals = cart.calculateTotals();
        cart.subtotal = totals.subtotal;
        cart.total = totals.total;

        await cart.save();
        
      }

      
    } catch (error) {
      
      throw error;
    }
  });
