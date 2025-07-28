const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema')


    
   exports.listCategories = async (req, res) => {
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

//  returns a JSON error response instead of rendering a page. 
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

            res.render('admin/category', {
                categories,
                currentPage: page,
                totalPages,
                success: req.query.success,
                error: req.query.error,
                user: req.admin ,
                path: '/admin/categories'
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

   exports.addCategory = async (req, res) => {
        try {
            const { name, description } = req.body;
            
            if (!name || !name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Category name is required'
                });
            }

            const existingCategory = await Category.findOne({ 
                name: { $regex: new RegExp('^' + name.trim() + '$', 'i') }
            });

            if (existingCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Category already exists'
                });
            }

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

   exports.editCategory = async (req, res) => {
        try {
            const { categoryId } = req.params;
            const { name, description } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Category name is required'
                });
            }

            const existingCategory = await Category.findById(categoryId);
            if (!existingCategory) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }

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

    exports.toggleStatus = async (req, res) => {
        try {
            const { categoryId } = req.params;
            const category = await Category.findById(categoryId);

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }

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
