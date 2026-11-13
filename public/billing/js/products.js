(function () {
  const admin = window.SVAdmin;
  const productTableContainer = document.getElementById('productTableContainer');
  const productCount = document.getElementById('productCount');
  const productSearch = document.getElementById('productSearch');
  const categoryFilter = document.getElementById('categoryFilter');
  const statusFilter = document.getElementById('statusFilter');
  const productForm = document.getElementById('productForm');
  const logoutBtn = document.getElementById('logoutBtn');

  let allProducts = [];
  let allCategories = [];
  let editingProductId = null;

  function renderCategoryOptions() {
    categoryFilter.innerHTML = '<option value="">All Categories</option>' +
      allCategories.map((cat) => `<option value="${cat.id}">${cat.name}</option>`).join('');

    const productCategory = document.getElementById('productCategory');
    if (productCategory) {
      productCategory.innerHTML = allCategories.map((cat) => `<option value="${cat.id}">${cat.name}</option>`).join('');
    }
  }

  function filteredProducts() {
    const q = productSearch.value.trim().toLowerCase();
    const cat = categoryFilter.value;
    const st = statusFilter.value;

    return allProducts.filter((product) => {
      const matchesSearch = !q || (product.name || '').toLowerCase().includes(q) || (product.description || '').toLowerCase().includes(q);
      const matchesCategory = !cat || product.category_id === cat;
      const matchesStatus = !st || String(product.is_active) === String(st === 'active');
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }

  function renderTable() {
    const rows = filteredProducts();
    productCount.textContent = `${rows.length} product${rows.length === 1 ? '' : 's'}`;

    if (!rows.length) {
      productTableContainer.innerHTML = '<div class="empty-state">No products found.</div>';
      return;
    }

    productTableContainer.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Stock</th>
            <th>Cost Price</th>
            <th>Selling Price</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((product) => {
            const categoryName = allCategories.find((cat) => cat.id === product.category_id)?.name || 'Uncategorized';
            return `
              <tr>
                <td>
                  <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${product.image_url || '../assets/ssLogo.png'}" alt="${product.name}" width="42" height="42" loading="lazy" decoding="async" style="width:42px;height:42px;border-radius:10px;object-fit:cover;background:#f8fafc;" onerror="this.onerror=null;this.src='../assets/ssLogo.png'" />
                    <div>
                      <strong>${product.name}</strong><br>
                      <span class="subtle">${product.original_price ? admin.money(product.original_price) : ''}</span>
                    </div>
                  </div>
                </td>
                <td>${categoryName}</td>
                <td>${Number(product.stock_quantity || 0)}</td>
                <td>${admin.money(product.cost_price || 0)}</td>
                <td>${admin.money(product.selling_price || 0)}</td>
                <td><span class="badge ${product.is_active ? 'cash' : 'other'}">${product.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <button class="btn ${product.is_active ? 'btn-secondary' : 'btn-success'}" type="button" data-action="toggle" data-id="${product.id}">${product.is_active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    document.querySelectorAll('[data-action="toggle"]').forEach((button) => {
      button.addEventListener('click', () => toggleProductStatus(button.getAttribute('data-id')));
    });
  }

  function openModal() {
    const title = document.getElementById('modalTitle');
    if (title) title.textContent = editingProductId ? 'Edit Product' : 'Add Product';
    document.getElementById('productEditorPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeModal() {
    productForm.reset();
    editingProductId = null;
    const title = document.getElementById('modalTitle');
    if (title) title.textContent = 'Add Product';
    document.getElementById('productStatus').value = 'true';
  }

  function openEditModal(productId) {
    const product = allProducts.find((item) => item.id === productId);
    if (!product) return;

    editingProductId = productId;
    modalTitle.textContent = 'Edit Product';
    document.getElementById('productName').value = product.name || '';
    document.getElementById('productCategory').value = product.category_id || '';
    document.getElementById('productOriginalPrice').value = product.original_price || 0;
    document.getElementById('productCostPrice').value = product.cost_price || 0;
    document.getElementById('productSellingPrice').value = product.selling_price || 0;
    document.getElementById('productStockQuantity').value = product.stock_quantity || 0;
    document.getElementById('productImageUrl').value = product.image_url || '';
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productStatus').value = String(Boolean(product.is_active));
    openModal();
  }

  async function toggleProductStatus(productId) {
    const product = allProducts.find((item) => item.id === productId);
    if (!product) return;

    const nextStatus = !product.is_active;
    const { error } = await admin.sb.from('products').update({ is_active: nextStatus }).eq('id', productId);
    if (error) {
      alert(error.message || 'Could not update product status.');
      return;
    }

    product.is_active = nextStatus;
    renderTable();
  }

  async function loadProducts() {
    const [categoriesRes, productsRes] = await Promise.all([
      admin.sb.from('categories').select('*').order('name', { ascending: true }),
      admin.sb.from('products').select('*').order('created_at', { ascending: false })
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (productsRes.error) throw productsRes.error;

    allCategories = categoriesRes.data || [];
    allProducts = productsRes.data || [];
    renderCategoryOptions();
    renderTable();
  }

  productSearch.addEventListener('input', renderTable);
  categoryFilter.addEventListener('change', renderTable);
  statusFilter.addEventListener('change', renderTable);

  logoutBtn.addEventListener('click', async () => {
    await admin.sb.auth.signOut();
    window.location.href = 'billing.html';
  });

  admin.requireAuth().then(async () => {
    await loadProducts();
  }).catch(() => {
    window.location.href = 'billing.html';
  });
})();
