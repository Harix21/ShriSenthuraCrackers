/**
 * Admin Dashboard - Shri Senthura Crackers
 * This script handles all admin functionality
 */

let currentUser = null;
let currentDeleteAction = null;
let allCategories = [];
let allProducts = [];
let filteredProducts = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is already logged in
    const session = await getCurrentSession();
    if (session && session.user) {
        currentUser = session.user;
        showDashboard();
    } else {
        showLoginForm();
    }

    // Setup event listeners
    setupEventListeners();

    // Listen for auth state changes
    onAuthStateChange((event, session) => {
        if (session && session.user) {
            currentUser = session.user;
            showDashboard();
        } else {
            currentUser = null;
            showLoginForm();
        }
    });
});

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const section = e.target.closest('.nav-item').dataset.section;
            navigateToSection(section);
        });
    });

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Category buttons
    document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal());
    document.getElementById('categoryForm').addEventListener('submit', handleCategorySave);

    // Product buttons
    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
    document.getElementById('productForm').addEventListener('submit', handleProductSave);
    document.getElementById('productImage').addEventListener('change', handleImagePreview);

    // Product search and filter
    document.getElementById('productSearchInput').addEventListener('input', filterProducts);
    document.getElementById('productCategoryFilter').addEventListener('change', filterProducts);

    // Modals
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDeleteAction);
}

/**
 * Show login form and hide dashboard
 */
function showLoginForm() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('categoriesSection').classList.add('hidden');
    document.getElementById('productsSection').classList.add('hidden');
    document.querySelector('.sidebar').classList.add('hidden');
}

/**
 * Show dashboard and hide login form
 */
async function showDashboard() {
    document.getElementById('loginSection').classList.add('hidden');
    document.querySelector('.sidebar').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');

    // Update user email display
    if (currentUser) {
        document.getElementById('userEmail').textContent = currentUser.email;
    }

    // Load dashboard data
    await loadDashboardData();
}

/**
 * Handle login
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const alertContainer = document.getElementById('loginAlert');

    showAlert(alertContainer, 'Signing in...', 'info');

    const { user, session, error } = await signInWithPassword(email, password);

    if (error) {
        showAlert(alertContainer, error, 'error');
    } else {
        currentUser = user;
        document.getElementById('loginForm').reset();
        showDashboard();
    }
}

/**
 * Handle logout
 */
async function handleLogout() {
    const { error } = await signOut();
    if (error) {
        alert('Error logging out: ' + error);
    } else {
        currentUser = null;
        showLoginForm();
    }
}

/**
 * Navigate to section
 */
async function navigateToSection(section) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`).classList.add('active');

    // Hide all sections
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('categoriesSection').classList.add('hidden');
    document.getElementById('productsSection').classList.add('hidden');

    // Show selected section
    if (section === 'dashboard') {
        document.getElementById('dashboardSection').classList.remove('hidden');
        await loadDashboardData();
    } else if (section === 'categories') {
        document.getElementById('categoriesSection').classList.remove('hidden');
        await loadCategoriesTable();
    } else if (section === 'products') {
        document.getElementById('productsSection').classList.remove('hidden');
        await loadProductsTable();
    }
}

/**
 * Load dashboard data
 */
async function loadDashboardData() {
    // Load categories
    allCategories = await getCategories();
    const totalCategories = allCategories.length;
    document.getElementById('totalCategoriesCount').textContent = totalCategories;

    // Load products
    allProducts = await getProducts();
    const totalProducts = allProducts.length;
    const activeProducts = allProducts.filter(p => p.is_active).length;
    document.getElementById('totalProductsCount').textContent = totalProducts;
    document.getElementById('activeProductsCount').textContent = activeProducts;

    // Show recent categories
    const recentCategories = allCategories.slice(-3).reverse();
    const categoriesList = document.getElementById('recentCategoriesList');
    if (recentCategories.length === 0) {
        categoriesList.innerHTML = '<p class="text-gray-500">No categories yet</p>';
    } else {
        categoriesList.innerHTML = recentCategories.map(cat => `
            <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span class="text-sm text-gray-700">${escapeHtml(cat.name)}</span>
                <span class="text-xs text-gray-500">${new Date(cat.created_at).toLocaleDateString()}</span>
            </div>
        `).join('');
    }

    // Show recent products
    const recentProducts = allProducts.slice(-3).reverse();
    const productsList = document.getElementById('recentProductsList');
    if (recentProducts.length === 0) {
        productsList.innerHTML = '<p class="text-gray-500">No products yet</p>';
    } else {
        productsList.innerHTML = recentProducts.map(prod => `
            <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span class="text-sm text-gray-700">${escapeHtml(prod.name)}</span>
                <span class="badge ${prod.is_active ? 'badge-success' : 'badge-danger'}">
                    ${prod.is_active ? 'Active' : 'Inactive'}
                </span>
            </div>
        `).join('');
    }
}

/**
 * Load categories table
 */
async function loadCategoriesTable() {
    allCategories = await getCategories();
    const tbody = document.getElementById('categoriesTable');

    if (allCategories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-4">No categories found</td></tr>';
        return;
    }

    tbody.innerHTML = allCategories.map(cat => {
        const productCount = allProducts.filter(p => p.category_id === cat.id).length;
        return `
            <tr>
                <td class="font-medium">${escapeHtml(cat.name)}</td>
                <td>${Number(cat.display_order)}</td>
                <td>${productCount} product${productCount !== 1 ? 's' : ''}</td>
                <td class="text-sm text-gray-500">${new Date(cat.created_at).toLocaleDateString()}</td>
                <td>
                    <button onclick="editCategory('${cat.id}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium btn-small">Edit</button>
                    <button onclick="requestDeleteCategory('${cat.id}')" class="text-red-600 hover:text-red-800 text-sm font-medium btn-small ml-2">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Load products table
 */
async function loadProductsTable() {
    allProducts = await getProducts();
    allCategories = await getCategories();

    // Populate category filter
    const categoryFilter = document.getElementById('productCategoryFilter');
    categoryFilter.innerHTML = '<option value="">All Categories</option>' +
        allCategories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');

    // Populate product category dropdown in modal
    const productCategorySelect = document.getElementById('productCategory');
    productCategorySelect.innerHTML = '<option value="">Select Category</option>' +
        allCategories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');

    filteredProducts = allProducts;
    renderProductsTable();
}

/**
 * Render products table
 */
function renderProductsTable() {
    const tbody = document.getElementById('productsTable');

    if (filteredProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-4">No products found</td></tr>';
        return;
    }

    tbody.innerHTML = filteredProducts.map(prod => {
        const category = allCategories.find(c => c.id === prod.category_id);
        return `
            <tr>
                <td>
                    <img src="${escapeHtml(prod.image_url)}" alt="${escapeHtml(prod.name)}" class="img-thumb"
                        width="50" height="50" loading="lazy" decoding="async"
                        onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22%3E%3Crect fill=%22%23ddd%22 width=%2250%22 height=%2250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2212%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E'">
                </td>
                <td class="font-medium">${escapeHtml(prod.name)}</td>
                <td class="text-sm">${escapeHtml(category ? category.name : 'N/A')}</td>
                <td class="text-sm">
                    <span>Stock: ${Number(prod.stock_quantity || 0)}</span><br>
                    <span>Cost: ₹${Number(prod.cost_price || 0).toFixed(2)}</span><br>
                    <span class="line-through text-gray-500">₹${prod.original_price.toFixed(2)}</span><br>
                    <span class="font-bold text-orange-600">₹${prod.selling_price.toFixed(2)}</span>
                </td>
                <td>
                    <span class="badge ${prod.is_active ? 'badge-success' : 'badge-danger'}">
                        ${prod.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button onclick="editProduct('${prod.id}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium btn-small">Edit</button>
                    <button onclick="requestDeleteProduct('${prod.id}')" class="text-red-600 hover:text-red-800 text-sm font-medium btn-small ml-2">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Filter products based on search and category
 */
function filterProducts() {
    const searchTerm = document.getElementById('productSearchInput').value.toLowerCase();
    const categoryFilter = document.getElementById('productCategoryFilter').value;

    filteredProducts = allProducts.filter(prod => {
        const matchesSearch = prod.name.toLowerCase().includes(searchTerm);
        const matchesCategory = !categoryFilter || prod.category_id === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    renderProductsTable();
}

/**
 * Open category modal for adding
 */
function openCategoryModal() {
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryDisplayOrder').value = String(
        Math.max(0, ...allCategories.map(category => Number(category.display_order) || 0)) + 1
    );
    document.getElementById('categoryModalTitle').textContent = 'Add Category';
    document.getElementById('categoryModalAlert').innerHTML = '';
    document.getElementById('categoryModal').classList.add('active');
}

/**
 * Close category modal
 */
function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('active');
    document.getElementById('categoryForm').reset();
}

/**
 * Edit category
 */
async function editCategory(id) {
    const category = allCategories.find(c => c.id === id);
    if (!category) return;

    document.getElementById('categoryId').value = category.id;
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryDisplayOrder').value = category.display_order;
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    document.getElementById('categoryModalAlert').innerHTML = '';
    document.getElementById('categoryModal').classList.add('active');
}

/**
 * Delete category
 */
function requestDeleteCategory(id) {
    const category = allCategories.find(c => c.id === id);
    if (!category) return;

    currentDeleteAction = { type: 'category', id };
    document.getElementById('deleteConfirmMessage').textContent = 
        `Are you sure you want to delete the category "${escapeHtml(category.name)}"?`;
    document.getElementById('confirmDeleteModal').classList.add('active');
}

/**
 * Handle category save
 */
async function handleCategorySave(e) {
    e.preventDefault();
    const categoryId = document.getElementById('categoryId').value;
    const categoryName = document.getElementById('categoryName').value;
    const displayOrder = Number(document.getElementById('categoryDisplayOrder').value);
    const alertContainer = document.getElementById('categoryModalAlert');

    showAlert(alertContainer, 'Saving...', 'info');

    if (!Number.isSafeInteger(displayOrder) || displayOrder < 1) {
        showAlert(alertContainer, 'Display order must be a positive whole number.', 'error');
        return;
    }

    let result;
    if (categoryId) {
        result = await updateCategory(categoryId, categoryName, displayOrder);
    } else {
        result = await createCategory(categoryName, displayOrder);
    }

    if (result.error) {
        showAlert(alertContainer, result.error, 'error');
    } else {
        showAlert(alertContainer, categoryId ? 'Category updated!' : 'Category created!', 'success');
        setTimeout(() => {
            closeCategoryModal();
            loadCategoriesTable();
            loadProductsTable();
        }, 1000);
    }
}

/**
 * Open product modal for adding
 */
async function openProductModal() {
    // Ensure categories are loaded
    if (allCategories.length === 0) {
        allCategories = await getCategories();
    }

    document.getElementById('productId').value = '';
    document.getElementById('productForm').reset();
    document.getElementById('productModalTitle').textContent = 'Add Product';
    document.getElementById('productModalAlert').innerHTML = '';
    document.getElementById('imagePreview').classList.add('hidden');

    // Populate category dropdown
    const categorySelect = document.getElementById('productCategory');
    categorySelect.innerHTML = '<option value="">Select Category</option>' +
        allCategories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');

    document.getElementById('productModal').classList.add('active');
}

/**
 * Close product modal
 */
function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
    document.getElementById('productForm').reset();
    document.getElementById('imagePreview').classList.add('hidden');
}

/**
 * Edit product
 */
async function editProduct(id) {
    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    // Ensure categories are loaded
    if (allCategories.length === 0) {
        allCategories = await getCategories();
    }

    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.category_id;
    document.getElementById('productOriginalPrice').value = product.original_price;
    document.getElementById('productCostPrice').value = product.cost_price || 0;
    document.getElementById('productSellingPrice').value = product.selling_price;
    document.getElementById('productStockQuantity').value = product.stock_quantity || 0;
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productIsActive').checked = product.is_active;
    
    // Show image preview
    document.getElementById('imagePreview').src = product.image_url;
    document.getElementById('imagePreview').classList.remove('hidden');

    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('productModalAlert').innerHTML = '';

    // Populate category dropdown
    const categorySelect = document.getElementById('productCategory');
    categorySelect.innerHTML = '<option value="">Select Category</option>' +
        allCategories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');
    categorySelect.value = product.category_id;

    document.getElementById('productModal').classList.add('active');
}

/**
 * Delete product
 */
function requestDeleteProduct(id) {
    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    currentDeleteAction = { type: 'product', id };
    document.getElementById('deleteConfirmMessage').textContent = 
        `Are you sure you want to delete the product "${escapeHtml(product.name)}"? This action cannot be undone.`;
    document.getElementById('confirmDeleteModal').classList.add('active');
}

/**
 * Handle image preview
 */
function handleImagePreview(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById('imagePreview').src = event.target.result;
            document.getElementById('imagePreview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Handle product save
 */
async function handleProductSave(e) {
    e.preventDefault();
    const productId = document.getElementById('productId').value;
    const productName = document.getElementById('productName').value;
    const categoryId = document.getElementById('productCategory').value;
    const originalPrice = document.getElementById('productOriginalPrice').value;
    const costPrice = document.getElementById('productCostPrice').value;
    const sellingPrice = document.getElementById('productSellingPrice').value;
    const stockQuantity = document.getElementById('productStockQuantity').value;
    const description = document.getElementById('productDescription').value;
    const isActive = document.getElementById('productIsActive').checked;
    const imageFile = document.getElementById('productImage').files[0];
    const alertContainer = document.getElementById('productModalAlert');

    // Validation
    if (!productName || !categoryId || !originalPrice || !costPrice || !sellingPrice || stockQuantity === '') {
        showAlert(alertContainer, 'Please fill all required fields', 'error');
        return;
    }

    showAlert(alertContainer, 'Saving...', 'info');

    let imageUrl = null;
    let imagePublicId = null;

    // Handle image upload if a new file is selected
    if (imageFile) {
        const uploadResult = await uploadImage(imageFile);
        if (uploadResult.error) {
            showAlert(alertContainer, 'Image upload failed: ' + uploadResult.error, 'error');
            return;
        }
        imageUrl = uploadResult.publicUrl;
        imagePublicId = uploadResult.publicId;
    } else if (!productId) {
        // For new products, image is required
        showAlert(alertContainer, 'Please upload a product image', 'error');
        return;
    }

    // Prepare product data
    const productData = {
        name: productName,
        category_id: categoryId,
        original_price: originalPrice,
        cost_price: costPrice,
        selling_price: sellingPrice,
        stock_quantity: stockQuantity,
        description: description,
        is_active: isActive
    };

    // Only add image_url if we have one
    if (imageUrl) {
        productData.image_url = imageUrl;
        productData.image_public_id = imagePublicId;
    }

    let result;
    if (productId) {
        result = await updateProduct(productId, productData);
    } else {
        if (!imageUrl) {
            showAlert(alertContainer, 'Please upload a product image', 'error');
            return;
        }
        result = await createProduct(productData);
    }

    if (result.error) {
        let message = result.error;
        if (imageUrl) {
            const cleanup = await deleteImage(imageUrl, imagePublicId);
            if (cleanup.error) {
                message += ' The newly uploaded image could not be cleaned up: ' + cleanup.error;
            }
        }
        showAlert(alertContainer, message, 'error');
    } else {
        const previousProduct = productId ? allProducts.find(product => product.id === productId) : null;
        const previousImage = previousProduct?.image_url;
        let message = productId ? 'Product updated!' : 'Product created!';
        let alertType = 'success';
        if (imageUrl && previousImage && previousImage !== imageUrl) {
            const cleanup = await deleteImage(previousImage, previousProduct.image_public_id);
            if (cleanup.error) {
                message += ' The previous image could not be removed: ' + cleanup.error;
                alertType = 'error';
            }
        }
        showAlert(alertContainer, message, alertType);
        setTimeout(() => {
            closeProductModal();
            loadProductsTable();
            loadDashboardData();
        }, 1000);
    }
}

/**
 * Cancel delete
 */
function cancelDelete() {
    document.getElementById('confirmDeleteModal').classList.remove('active');
    currentDeleteAction = null;
}

/**
 * Confirm delete action
 */
async function confirmDeleteAction() {
    if (!currentDeleteAction) return;

    const { type, id } = currentDeleteAction;
    let result;

    if (type === 'category') {
        result = await deleteCategory(id);
        if (!result.error) {
            cancelDelete();
            loadCategoriesTable();
            loadProductsTable();
            showAlert(document.getElementById('categoriesAlert'), 'Category deleted!', 'success');
        } else {
            showAlert(document.getElementById('categoriesAlert'), result.error, 'error');
        }
    } else if (type === 'product') {
        const product = allProducts.find(item => item.id === id);
        result = await deleteProduct(id);
        if (!result.error) {
            cancelDelete();
            loadProductsTable();
            let message = 'Product deleted!';
            let alertType = 'success';
            if (product?.image_url) {
                const cleanup = await deleteImage(product.image_url, product.image_public_id);
                if (cleanup.error) {
                    message += ' The image could not be removed: ' + cleanup.error;
                    alertType = 'error';
                }
            }
            showAlert(document.getElementById('productsAlert'), message, alertType);
        } else {
            showAlert(document.getElementById('productsAlert'), result.error, 'error');
        }
    }

    currentDeleteAction = null;
}

/**
 * Show alert message
 */
function showAlert(container, message, type = 'info') {
    if (!container) return;

    const alertClass = type === 'success' ? 'alert-success' : 
                      type === 'error' ? 'alert-error' : 
                      'alert-warning';

    container.innerHTML = `<div class="alert ${alertClass}">${escapeHtml(message)}</div>`;
    
    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
        setTimeout(() => {
            container.innerHTML = '';
        }, 3000);
    }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
