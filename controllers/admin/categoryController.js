const Category = require('../../models/categorySchema');

const viewCategories = async (req, res) => {
  const currentPage = parseInt(req.query.page) || 1;
  const itemsPerPage = 10;

  try {
    const totalCategories = await Category.countDocuments();
    const categories = await Category.find()
      .skip((currentPage - 1) * itemsPerPage)
      .limit(itemsPerPage);

    const totalPages = Math.ceil(totalCategories / itemsPerPage);

    res.render('category', {
      categories,
      currentPage,
      totalPages,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error retrieving categories');
  }
};


const addCategoryForm = (req, res) => {
  res.render('addCategory');
};

const addCategory = async (req, res) => {
  const { name, description } = req.body; 

  const newCategory = new Category({
    name,
    description,
    isActive: true,
  });

  try {
    await newCategory.save();
    res.redirect('/admin/categories');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error adding category');
  }
};


const editCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await Category.findById(categoryId);

    if (!category) {
      return res.status(404).send('Category not found');
    }

    res.render('editCategory', { category });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};


const updateCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { name, description } = req.body; // Ensure this matches the form fields

    await Category.findByIdAndUpdate(categoryId, { name, description });

    res.redirect('/admin/categories');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error updating category');
  }
};



const toggleCategoryStatus = async (req, res) => {
  const categoryId = req.params.id;

  try {
    const category = await Category.findById(categoryId);
    if (!category) return res.status(404).send('Category not found');

    category.isActive = !category.isActive;
    await category.save();

    res.redirect('/admin/categories');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error toggling category status');
  }
};

module.exports = {
  viewCategories,
  addCategoryForm,
  addCategory,
  editCategory,
  updateCategory,
  toggleCategoryStatus
};
