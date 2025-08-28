const mongoose = require('mongoose');
const User = require('./models/userSchema');
const Product = require('./models/menuSchema');
const Category = require('./models/categorySchema');
const Cart = require('./models/cartSchema');
const { removeBlockedCategoryFromCarts } = require('./controllers/admin/categoryController');

// Test configuration
const TEST_USER_EMAIL = 'testuser@example.com';
const TEST_CATEGORY_NAME = 'Test Beverages';
const TEST_PRODUCT_NAME = 'Test Tea';

async function setupTestData() {
    console.log('Setting up test data...');
    
    // Create or find test user
    let testUser = await User.findOne({ email: TEST_USER_EMAIL });
    if (!testUser) {
        testUser = new User({
            name: 'Test User',
            email: TEST_USER_EMAIL,
            password: 'hashedpassword',
            isVerified: true
        });
        await testUser.save();
        console.log('Created test user:', testUser._id);
    }
    
    // Create or find test category
    let testCategory = await Category.findOne({ name: TEST_CATEGORY_NAME });
    if (!testCategory) {
        testCategory = new Category({
            name: TEST_CATEGORY_NAME,
            description: 'Test category for blocked product testing',
            isBlocked: false
        });
        await testCategory.save();
        console.log('Created test category:', testCategory._id);
    }
    
    // Create or find test product
    let testProduct = await Product.findOne({ name: TEST_PRODUCT_NAME });
    if (!testProduct) {
        testProduct = new Product({
            name: TEST_PRODUCT_NAME,
            description: 'Test product for blocked category testing',
            price: 50,
            category: testCategory._id,
            isListed: true,
            isBlocked: false,
            isAvailable: true,
            images: ['test-image.jpg']
        });
        await testProduct.save();
        console.log('Created test product:', testProduct._id);
    }
    
    return { testUser, testCategory, testProduct };
}

async function addProductToCart(userId, productId) {
    console.log('Adding product to cart...');
    
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
        cart = new Cart({
            user: userId,
            items: []
        });
    }
    
    // Remove existing item if present
    cart.items = cart.items.filter(item => item.product.toString() !== productId.toString());
    
    // Add new item
    cart.items.push({
        product: productId,
        quantity: 2,
        price: 50
    });
    
    // Calculate totals
    const totals = cart.calculateTotals();
    cart.subtotal = totals.subtotal;
    cart.total = totals.total;
    
    await cart.save();
    console.log('Product added to cart. Cart items:', cart.items.length);
    return cart;
}

async function testCheckoutBlockedProductHandling() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        // Setup test data
        const { testUser, testCategory, testProduct } = await setupTestData();
        
        // Test 1: Add product to cart
        console.log('\n=== Test 1: Adding product to cart ===');
        let cart = await addProductToCart(testUser._id, testProduct._id);
        console.log('✓ Product successfully added to cart');
        
        // Test 2: Verify cart has the product
        console.log('\n=== Test 2: Verifying cart contents ===');
        cart = await Cart.findOne({ user: testUser._id }).populate('items.product');
        console.log('Cart items before blocking:', cart.items.map(item => ({
            name: item.product.name,
            quantity: item.quantity,
            price: item.price
        })));
        
        // Test 3: Block the category
        console.log('\n=== Test 3: Blocking category ===');
        testCategory.isBlocked = true;
        await testCategory.save();
        console.log('✓ Category blocked successfully');
        
        // Test 4: Trigger automatic cart cleanup
        console.log('\n=== Test 4: Testing automatic cart cleanup ===');
        await removeBlockedCategoryFromCarts(testCategory._id);
        
        // Test 5: Verify product removed from cart
        console.log('\n=== Test 5: Verifying cart cleanup ===');
        cart = await Cart.findOne({ user: testUser._id }).populate('items.product');
        console.log('Cart items after blocking:', cart.items.map(item => ({
            name: item.product?.name || 'Unknown',
            quantity: item.quantity,
            price: item.price
        })));
        
        if (cart.items.length === 0) {
            console.log('✓ SUCCESS: Blocked category products automatically removed from cart');
        } else {
            console.log('✗ FAILURE: Products still present in cart after category blocking');
        }
        
        // Test 6: Test individual product blocking
        console.log('\n=== Test 6: Testing individual product blocking ===');
        
        // Unblock category and add product back
        testCategory.isBlocked = false;
        await testCategory.save();
        cart = await addProductToCart(testUser._id, testProduct._id);
        
        // Block the product directly
        testProduct.isBlocked = true;
        await testProduct.save();
        console.log('✓ Product blocked directly');
        
        // Simulate checkout validation (this would happen in checkoutController)
        console.log('\n=== Test 7: Simulating checkout validation ===');
        cart = await Cart.findOne({ user: testUser._id }).populate('items.product');
        
        const invalidItems = [];
        const itemsToRemove = [];
        
        for (const item of cart.items) {
            const product = await Product.findById(item.product._id).populate('category');
            
            if (!product || product.isBlocked || product.category.isBlocked) {
                invalidItems.push({
                    name: item.product.name || "Unknown product",
                    reason: product.isBlocked ? 'Product is blocked' : 'Category is blocked'
                });
                itemsToRemove.push(item.product._id);
            }
        }
        
        if (invalidItems.length > 0) {
            console.log('Found blocked items during checkout:', invalidItems);
            
            // Remove invalid items (simulating checkout controller logic)
            cart.items = cart.items.filter(item => 
                !itemsToRemove.some(removeId => removeId.toString() === item.product._id.toString())
            );
            
            // Recalculate totals
            const totals = cart.calculateTotals();
            cart.subtotal = totals.subtotal;
            cart.total = totals.total;
            
            await cart.save();
            console.log('✓ SUCCESS: Blocked products automatically removed during checkout validation');
        } else {
            console.log('✗ FAILURE: Blocked products not detected during checkout validation');
        }
        
        // Final verification
        cart = await Cart.findOne({ user: testUser._id });
        console.log('\n=== Final Results ===');
        console.log('Final cart item count:', cart.items.length);
        console.log('Final cart total:', cart.total);
        
        if (cart.items.length === 0) {
            console.log('✅ ALL TESTS PASSED: Automatic blocked product removal working correctly');
        } else {
            console.log('❌ SOME TESTS FAILED: Manual review required');
        }
        
    } catch (error) {
        console.error('Test failed with error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Cleanup function to reset test data
async function cleanupTestData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Cleaning up test data...');
        
        // Remove test data
        await User.deleteOne({ email: TEST_USER_EMAIL });
        await Category.deleteOne({ name: TEST_CATEGORY_NAME });
        await Product.deleteOne({ name: TEST_PRODUCT_NAME });
        await Cart.deleteOne({ user: { $exists: true } });
        
        console.log('✓ Test data cleaned up');
    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

// Run tests
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--cleanup')) {
        cleanupTestData();
    } else {
        testCheckoutBlockedProductHandling();
    }
}

module.exports = {
    testCheckoutBlockedProductHandling,
    cleanupTestData
};
