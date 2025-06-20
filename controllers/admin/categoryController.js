const Category = require('../../models/categorySchema');

const categoryController = {
    // List all categories with pagination
    listCategories: async (req, res) => {
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

            // Check if it's an API request
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({
                    success: true,
                    categories,
                    pagination: {
                        currentPage: page,
                        totalPages
                    }
                });
            }

            // Regular page render
            res.render('admin/category', {
                categories,
                currentPage: page,
                totalPages,
                success: req.query.success,
                error: req.query.error,
                user: req.admin // Pass admin user data
            });
        } catch (error) {
            console.error('Error in listCategories:', error);
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch categories'
                });
            }
            res.status(500).render('admin/category', { 
                error: 'Failed to fetch categories',
                categories: [],
                currentPage: 1,
                totalPages: 1,
                user: req.admin
            });
        }
    },

    // Add new category
    addCategory: async (req, res) => {
        try {
            const { name, description } = req.body;
            
            // Validate category name
            if (!name || !name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Category name is required'
                });
            }

            // Check if category already exists
            const existingCategory = await Category.findOne({ 
                name: { $regex: new RegExp('^' + name.trim() + '$', 'i') }
            });

            if (existingCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Category already exists'
                });
            }

            // Create new category
            const category = new Category({
                name: name.trim(),
                description: description ? description.trim() : '',
                isBlocked: true
            });

            await category.save();

            res.status(201).json({
                success: true,
                message: 'Category added successfully',
                category
            });
        } catch (error) {
            console.error('Error in addCategory:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add category'
            });
        }
    },

    // Edit category
    editCategory: async (req, res) => {
        try {
            const { categoryId } = req.params;
            const { name, description } = req.body;

            // Validate category name
            if (!name || !name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Category name is required'
                });
            }

            // Check if category exists
            const existingCategory = await Category.findById(categoryId);
            if (!existingCategory) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }

            // Check if name is already taken by another category
            const duplicateCategory = await Category.findOne({
                _id: { $ne: categoryId },
                name: { $regex: new RegExp('^' + name.trim() + '$', 'i') }
            });

            if (duplicateCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Category name already exists'
                });
            }

            // Update category
            const updatedCategory = await Category.findByIdAndUpdate(
                categoryId,
                {
                    name: name.trim(),
                    description: description ? description.trim() : ''
                },
                { new: true }
            );

            res.json({
                success: true,
                message: 'Category updated successfully',
                category: updatedCategory
            });
        } catch (error) {
            console.error('Error in editCategory:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update category'
            });
        }
    },

    // Toggle category status
    toggleStatus: async (req, res) => {
        try {
            const { categoryId } = req.params;
            const category = await Category.findById(categoryId);
            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }
            // Toggle the status
            category.isBlocked = !category.isBlocked;
            await category.save();
            return res.json({
                success: true,
                message: `Category ${category.isBlocked ? 'blocked' : 'unblocked'} successfully`,
                isBlocked: category.isBlocked
            });
        } catch (error) {
            console.error('Error in toggleStatus:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to update category status',
                error: error.message
            });
        }
    }
};

module.exports = categoryController;