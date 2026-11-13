(function () {
  const config = window.SUPABASE_CONFIG || globalThis.SUPABASE_CONFIG;
  if (!config || !config.url || !config.anonKey) {
    throw new Error('Supabase configuration is missing.');
  }

  const sb = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'sv-client-order-auth-token'
    }
  });

  const state = {
    products: [],
    categories: [],
    cart: new Map(),
    deliveryFee: 0,
    districts: {
      'Tamil Nadu': [
        'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul', 'Erode',
        'Kallakurichi', 'Kancheepuram', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam',
        'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga',
        'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupathur',
        'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar'
      ],
      'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur'],
      'Karnataka': ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru'],
      'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Rajahmundry'],
      'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Secunderabad'],
      'Puducherry': ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
      'Other': ['Outside Tamil Nadu']
    }
  };

  const els = {
    searchInput: document.getElementById('searchInput'),
    categoryFilter: document.getElementById('categoryFilter'),
    productGrid: document.getElementById('productGrid'),
    cartEmpty: document.getElementById('cartEmpty'),
    cartList: document.getElementById('cartList'),
    itemCount: document.getElementById('itemCount'),
    subtotal: document.getElementById('subtotal'),
    deliveryFee: document.getElementById('deliveryFee'),
    grandTotal: document.getElementById('grandTotal'),
    proceedBtn: document.getElementById('proceedBtn'),
    cartWarning: document.getElementById('cartWarning'),
    cartFab: document.getElementById('cartFab'),
    cartFabCount: document.getElementById('cartFabCount'),
    floatingCartPanel: document.getElementById('floatingCartPanel'),
    floatingCartItems: document.getElementById('floatingCartItems'),
    floatingCartWarning: document.getElementById('floatingCartWarning'),
    floatingCartTotal: document.getElementById('floatingCartTotal'),
    floatingProceedBtn: document.getElementById('floatingProceedBtn'),
    closeCartPanel: document.getElementById('closeCartPanel'),
    detailsPanel: document.getElementById('detailsPanel'),
    orderError: document.getElementById('orderError'),
    customerName: document.getElementById('customerName'),
    customerPhone: document.getElementById('customerPhone'),
    customerAddress: document.getElementById('customerAddress'),
    customerState: document.getElementById('customerState'),
    customerDistrict: document.getElementById('customerDistrict'),
    stateWarning: document.getElementById('stateWarning'),
    confirmOrderBtn: document.getElementById('confirmOrderBtn'),
    toast: document.getElementById('toast')
  };

  function money(value) {
    const num = Number(value || 0);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function toast(message) {
    const { toast } = els;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(window.__clientToastTimer);
    window.__clientToastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function totals() {
    let subtotal = 0;
    state.cart.forEach((item) => {
      subtotal += Number(item.product.selling_price || 0) * Number(item.qty || 0);
    });
    const total = subtotal + state.deliveryFee;
    return { subtotal, deliveryFee: state.deliveryFee, total };
  }

  async function loadProducts() {
    try {
      const [{ data: cats, error: catErr }, { data: prods, error: prodErr }] = await Promise.all([
        sb.from('categories').select('id,name').order('created_at', { ascending: true }),
        sb.from('products').select('id,name,category_id,original_price,selling_price,image_url').eq('is_active', true).order('created_at', { ascending: true })
      ]);

      if (catErr) throw catErr;
      if (prodErr) throw prodErr;

      state.categories = cats || [];
      state.products = (prods || []).map((p) => ({
        ...p,
        original_price: Number(p.original_price || 0),
        selling_price: Number(p.selling_price || 0)
      }));

      renderCategoryFilter();
      renderProducts();
      renderCart();
    } catch (error) {
      console.error(error);
      els.productGrid.innerHTML = `<div style="grid-column: 1 / -1; padding: 18px; border: 1px solid rgba(220,38,38,0.2); border-radius: 12px; background: rgba(220,38,38,0.05); color: #991b1b; font-weight: 700;">Unable to load products: ${escapeHtml(error.message || error)}</div>`;
    }
  }

  function renderCategoryFilter() {
    els.categoryFilter.innerHTML = '<option value="">All Categories</option>' +
      state.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('');
  }

  function renderProducts() {
    const searchTerm = (els.searchInput.value || '').trim().toLowerCase();
    const selectedCategory = els.categoryFilter.value;
    const filtered = state.products.filter((product) => {
      const matchesSearch = !searchTerm || product.name.toLowerCase().includes(searchTerm);
      const matchesCategory = !selectedCategory || String(product.category_id) === String(selectedCategory);
      return matchesSearch && matchesCategory;
    });

    if (!filtered.length) {
      els.productGrid.innerHTML = '<div style="grid-column: 1 / -1; padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: #fafafa; color: var(--muted); text-align: center;">No products found.</div>';
      return;
    }

    els.productGrid.innerHTML = filtered.map((product) => {
      const inCart = state.cart.get(product.id)?.qty || 0;
      const imageUrl = product.image_url || '../assets/ssLogo.png';
      return `
        <div class="product-card">
          <img class="product-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}" width="320" height="110" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='../assets/ssLogo.png';" />
          <div class="product-meta">
            <div class="product-name">${escapeHtml(product.name)}</div>
            <div class="product-original">${money(product.original_price)}</div>
            <div class="product-price">${money(product.selling_price)}</div>
          </div>
          <button class="add-btn" type="button" data-product-id="${escapeHtml(product.id)}">
            ${inCart ? `Add More <span class="qty-badge">${inCart}</span>` : 'Add to Cart'}
          </button>
        </div>
      `;
    }).join('');

    els.productGrid.querySelectorAll('[data-product-id]').forEach((button) => {
      button.addEventListener('click', () => addToCart(button.dataset.productId));
    });
  }

  function addToCart(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;

    const existing = state.cart.get(productId) || { product, qty: 0 };
    existing.qty += 1;
    state.cart.set(productId, existing);
    renderProducts();
    renderCart();
  }

  function updateQty(productId, delta) {
    const item = state.cart.get(productId);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
      state.cart.delete(productId);
    }

    renderProducts();
    renderCart();
  }

  function removeItem(productId) {
    state.cart.delete(productId);
    renderProducts();
    renderCart();
  }

  function renderFloatingCart() {
    const entries = [...state.cart.values()];
    const itemTotalCount = entries.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const { total } = totals();

    els.cartFabCount.textContent = String(itemTotalCount);
    els.floatingCartTotal.textContent = money(total);

    if (entries.length && total < 2000) {
      els.floatingCartWarning.textContent = 'Minimum order value is ₹2000.00. Please add more items.';
      els.floatingCartWarning.classList.add('show');
    } else {
      els.floatingCartWarning.textContent = '';
      els.floatingCartWarning.classList.remove('show');
    }

    if (!entries.length) {
      els.floatingCartItems.innerHTML = '<div class="empty-cart" style="padding: 18px; margin: 0;">Your cart is empty.</div>';
      els.floatingProceedBtn.disabled = true;
      els.floatingProceedBtn.style.opacity = '0.55';
      els.floatingProceedBtn.style.cursor = 'not-allowed';
      return;
    }

    els.floatingCartItems.innerHTML = entries.map(({ product, qty }) => `
      <div class="floating-cart-item">
        <div class="floating-cart-copy">
          <strong>${escapeHtml(product.name)}</strong><br>
          <span style="color: var(--muted);">${qty} x ${money(product.selling_price)}</span>
        </div>
        <div class="floating-cart-controls">
          <div class="qty-buttons">
            <button type="button" data-qty-id="${escapeHtml(product.id)}" data-delta="-1">−</button>
            <span>${qty}</span>
            <button type="button" data-qty-id="${escapeHtml(product.id)}" data-delta="1">＋</button>
          </div>
          <div style="font-weight: 800; white-space: nowrap;">${money(product.selling_price * qty)}</div>
        </div>
      </div>
    `).join('');

    els.floatingCartItems.querySelectorAll('[data-qty-id]').forEach((button) => {
      button.addEventListener('click', () => updateQty(button.dataset.qtyId, Number(button.dataset.delta)));
    });

    els.floatingProceedBtn.disabled = false;
    els.floatingProceedBtn.style.opacity = '1';
    els.floatingProceedBtn.style.cursor = 'pointer';
  }

  function renderCart() {
    const entries = [...state.cart.values()];
    const { subtotal, deliveryFee, total } = totals();
    const itemTotalCount = entries.reduce((sum, item) => sum + Number(item.qty || 0), 0);

    els.itemCount.textContent = `${itemTotalCount} item${itemTotalCount === 1 ? '' : 's'}`;
    els.subtotal.textContent = money(subtotal);
    els.deliveryFee.textContent = money(deliveryFee);
    els.grandTotal.textContent = money(total);
    renderFloatingCart();

    if (!entries.length) {
      els.cartWarning.textContent = '';
      els.cartWarning.classList.remove('show');
      els.cartEmpty.style.display = 'block';
      els.cartList.style.display = 'none';
      els.proceedBtn.disabled = true;
      els.proceedBtn.style.opacity = '0.55';
      els.proceedBtn.style.cursor = 'not-allowed';
      return;
    }

    if (total < 2000) {
      els.cartWarning.textContent = 'Minimum order value is ₹2000.00. Please add more items.';
      els.cartWarning.classList.add('show');
    } else {
      els.cartWarning.textContent = '';
      els.cartWarning.classList.remove('show');
    }

    els.cartEmpty.style.display = 'none';
    els.cartList.style.display = 'flex';
    els.cartList.innerHTML = entries.map(({ product, qty }) => `
      <div class="cart-item">
        <div class="cart-top">
          <div>
            <div class="cart-name">${escapeHtml(product.name)}</div>
            <div style="color: var(--muted); font-size: 12px;">${money(product.selling_price)} each</div>
          </div>
          <button class="remove-btn" type="button" data-remove-id="${escapeHtml(product.id)}">Remove</button>
        </div>
        <div class="qty-control">
          <div class="qty-buttons">
            <button type="button" data-qty-id="${escapeHtml(product.id)}" data-delta="-1">−</button>
            <span>${qty}</span>
            <button type="button" data-qty-id="${escapeHtml(product.id)}" data-delta="1">+</button>
          </div>
          <div class="price-total">${money(product.selling_price * qty)}</div>
        </div>
      </div>
    `).join('');

    els.cartList.querySelectorAll('[data-remove-id]').forEach((button) => {
      button.addEventListener('click', () => removeItem(button.dataset.removeId));
    });

    els.cartList.querySelectorAll('[data-qty-id]').forEach((button) => {
      button.addEventListener('click', () => updateQty(button.dataset.qtyId, Number(button.dataset.delta)));
    });

    els.proceedBtn.disabled = false;
    els.proceedBtn.style.opacity = '1';
    els.proceedBtn.style.cursor = 'pointer';
  }

  function updateDistrictOptions() {
    const selectedState = els.customerState.value || 'Tamil Nadu';
    const districtList = state.districts[selectedState] || [];
    const currentValue = els.customerDistrict.value || '';

    els.customerDistrict.innerHTML = '<option value="">Select District</option>' +
      districtList.map((district) => `<option value="${district}">${district}</option>`).join('');

    if (districtList.includes(currentValue)) {
      els.customerDistrict.value = currentValue;
    } else {
      els.customerDistrict.value = '';
    }

    const isValidState = Object.prototype.hasOwnProperty.call(state.districts, selectedState);
    els.customerDistrict.disabled = !isValidState;
    els.customerDistrict.setAttribute('aria-disabled', String(!isValidState));
    els.stateWarning.textContent = '';
    els.stateWarning.classList.remove('show');
  }

  function validateCustomerDetails() {
    const name = (els.customerName.value || '').trim();
    const phone = (els.customerPhone.value || '').trim();
    const address = (els.customerAddress.value || '').trim();
    const stateName = (els.customerState.value || '').trim();
    const district = (els.customerDistrict.value || '').trim();

    if (!name) return 'Please enter customer name.';
    if (!phone) return 'Please enter contact number.';
    if (!address) return 'Please enter address.';
    if (!stateName) return 'Please select a state.';
    if (!Object.prototype.hasOwnProperty.call(state.districts, stateName)) return 'Please select a valid state from the list.';
    if (!district) return 'Please select a district.';
    return '';
  }

  function buildOrderData() {
    const entries = [...state.cart.values()];
    const { subtotal, deliveryFee, total } = totals();
    return {
      customerName: (els.customerName.value || '').trim(),
      phone: (els.customerPhone.value || '').trim(),
      address: (els.customerAddress.value || '').trim(),
      state: (els.customerState.value || '').trim(),
      district: (els.customerDistrict.value || '').trim(),
      subtotal,
      deliveryFee,
      total,
      items: entries.map(({ product, qty }) => ({
        name: product.name,
        qty,
        quantity: qty,
        rate: Number(product.selling_price || 0),
        amount: Number(product.selling_price || 0) * qty
      }))
    };
  }

  function buildOrderText(order) {
    const lines = [
      'Please find the order invoice PDF attached (downloaded to your device) for confirmation.',
      '',
      'SHRI SENTHURA CRACKERS',
      'Address: 576, Bharathiyar Road, Murugu Thottam, Thalatheru, Karaikal – 609609 (Near Agriculture Office)',
      'Phone: 99400 51105',
      '',
      'Customer Details',
      `Name: ${order.customerName}`,
      `Phone: ${order.phone}`,
      `Address: ${order.address}`,
      `State: ${order.state}`,
      `District: ${order.district}`,
      '',
      'Ordered Products:',
      ...order.items.map((item) => `${item.name} x ${item.qty} = ${money(item.amount)}`),
      '',
      `Subtotal: ${money(order.subtotal)}`,
      `Delivery: ${money(order.deliveryFee)}`,
      `Total: ${money(order.total)}`
    ];
    return lines.join('\n');
  }

  async function loadLogoDataUrl() {
    const candidates = [
      new URL('../assets/ssLogo.png', window.location.href).toString(),
      `${window.location.origin}/assets/ssLogo.png`,
      `${window.location.origin}/billing/../assets/ssLogo.png`,
      '/assets/ssLogo.png',
      './assets/ssLogo.png'
    ];

    for (const imageUrl of candidates) {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) continue;
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob).catch(() => null);

        if (!imageBitmap) {
          const reader = new FileReader();
          const dataUrl = await new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          return dataUrl;
        }

        const maxSide = 240;
        const scale = Math.min(1, maxSide / Math.max(imageBitmap.width, imageBitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
        canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.6);
      } catch (error) {
        continue;
      }
    }

    try {
      const logoUrl = new URL('../assets/ssLogo.png', window.location.href).toString();
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = logoUrl;
      });

      const maxSide = 240;
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 240, img.naturalHeight || 240));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.naturalWidth || 240) * scale));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || 240) * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch (fallbackError) {
      console.warn('Logo load failed for PDF generation:', fallbackError);
      return null;
    }
  }

  async function generatePdf(order) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const logoDataUrl = await loadLogoDataUrl();

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'JPEG', 14, 12, 20, 20);
    }

    doc.setFillColor(255, 247, 237);
    doc.rect(0, 0, 210, 38, 'F');
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Shri Senthura Crackers', 40, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('576, Bharathiyar Road, Murugu Thottam, Thalatheru, Karaikal – 609609', 40, 25);
    doc.text('(Near Agriculture Office)', 40, 31);
    doc.text('Phone: 99400 51105', 40, 37);

    let y = 48;
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('Customer Details', 14, y);
    y += 9;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${order.customerName}`, 14, y); y += 7;
    doc.text(`Phone: ${order.phone}`, 14, y); y += 7;

    const addressLines = doc.splitTextToSize(`Address: ${order.address}`, 100);
    doc.text(addressLines, 14, y);
    y += addressLines.length * 6 + 2;

    doc.text(`State: ${order.state}`, 14, y); y += 7;
    doc.text(`District: ${order.district}`, 14, y); y += 12;

    doc.setFont('helvetica', 'bold');
    doc.text('Ordered Products', 14, y); y += 8;

    const pageHeight = doc.internal.pageSize.getHeight();
    const drawTableHeader = () => {
      doc.setFont('helvetica', 'bold');
      doc.text('Product', 14, y);
      doc.text('Qty', 110, y);
      doc.text('Rate', 138, y);
      doc.text('Amount', 170, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
    };

    drawTableHeader();

    order.items.forEach((item) => {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 20;
        drawTableHeader();
      }

      const productLine = item.name.length > 24 ? item.name.substring(0, 24) + '...' : item.name;
      doc.text(productLine, 14, y);
      doc.text(String(item.qty), 110, y);
      doc.text(money(item.rate).replace('₹', ''), 138, y);
      doc.text(money(item.amount).replace('₹', ''), 170, y);
      y += 7;
    });

    if (y > pageHeight - 45) {
      doc.addPage();
      y = 20;
    }

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal: ${money(order.subtotal)}`, 140, y); y += 7;
    doc.text(`Delivery: ${money(order.deliveryFee)}`, 140, y); y += 7;
    doc.text(`Total: ${money(order.total)}`, 140, y); y += 12;

    doc.setFont('helvetica', 'normal');
    const footerLines = doc.splitTextToSize(
      'Please share this order invoice PDF to the WhatsApp number +91 99400 51105. Otherwise, your order will not be processed.',
      180
    );
    const footerHeight = footerLines.length * 5 + 8;
    if (y + footerHeight > pageHeight - 10) {
      doc.addPage();
      y = 20;
    }
    doc.text(footerLines, 14, y, { lineHeightFactor: 1.3 });
    y += footerLines.length * 5 + 8;
    doc.text('Thank you for shopping with Shri Senthura Crackers.', 14, y);

    return doc;
  }

  async function confirmOrder() {
    if (!state.cart.size) {
      showError('Please add at least one product before placing the order.');
      return;
    }

    const validationError = validateCustomerDetails();
    if (validationError) {
      showError(validationError);
      return;
    }

    const order = buildOrderData();
    const totalOrderValue = order.subtotal + order.deliveryFee;
    if (totalOrderValue < 2000) {
      showError('Minimum order value is ₹2000.00. Please add more items.');
      return;
    }

    const pdf = await generatePdf(order);
    const fileName = `SriVelavan-Order-${Date.now()}.pdf`;
    pdf.save(fileName);

    const requestNo = `WEB-${Date.now()}`;
    const { error: requestError } = await sb.from('website_order_requests').insert({
      request_no: requestNo,
      customer_name: order.customerName,
      customer_phone: order.phone,
      customer_address: order.address,
      customer_state: order.state,
      customer_district: order.district,
      subtotal: order.subtotal,
      delivery_fee: order.deliveryFee,
      total: order.total,
      total_items: order.items.length,
      total_quantity: order.items.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      items: order.items,
      status: 'pending'
    });
    if (requestError) {
      console.error(requestError);
      showError(`Invoice downloaded, but the order request could not be submitted: ${requestError.message || requestError}`);
      return;
    }

    const whatsappNumber = (config.adminWhatsapp || '+919940051105').replace(/\D/g, '');
    const text = encodeURIComponent(buildOrderText(order));
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${text}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

    toast('Order request submitted. Invoice downloaded and WhatsApp message opened.');
    setTimeout(() => {
      state.cart.clear();
      renderProducts();
      renderCart();
      els.detailsPanel.classList.remove('active');
      els.customerName.value = '';
      els.customerPhone.value = '';
      els.customerAddress.value = '';
      els.customerState.value = 'Tamil Nadu';
      updateDistrictOptions();
      hideError();
    }, 600);
  }

  function showError(message) {
    els.orderError.textContent = message;
    els.orderError.classList.add('show');
  }

  function hideError() {
    els.orderError.textContent = '';
    els.orderError.classList.remove('show');
  }

  function bindEvents() {
    els.searchInput.addEventListener('input', renderProducts);
    els.categoryFilter.addEventListener('change', renderProducts);
    els.customerState.addEventListener('change', updateDistrictOptions);
    els.cartFab.addEventListener('click', () => {
      els.floatingCartPanel.classList.toggle('open');
    });
    els.closeCartPanel.addEventListener('click', () => {
      els.floatingCartPanel.classList.remove('open');
    });
    els.proceedBtn.addEventListener('click', () => {
      if (!state.cart.size) {
        showError('Please add a product to your cart before continuing.');
        return;
      }
      const orderTotal = totals().total;
      if (orderTotal < 2000) {
        showError('Minimum order value is ₹2000.00. Please add more items.');
        return;
      }
      hideError();
      els.detailsPanel.classList.add('active');
      els.floatingCartPanel.classList.remove('open');
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    els.floatingProceedBtn.addEventListener('click', () => {
      if (!state.cart.size) {
        showError('Please add a product to your cart before continuing.');
        els.floatingCartPanel.classList.remove('open');
        return;
      }
      const orderTotal = totals().total;
      if (orderTotal < 2000) {
        showError('Minimum order value is ₹2000.00. Please add more items.');
        els.floatingCartPanel.classList.remove('open');
        return;
      }
      hideError();
      els.detailsPanel.classList.add('active');
      els.floatingCartPanel.classList.remove('open');
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    els.confirmOrderBtn.addEventListener('click', confirmOrder);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    updateDistrictOptions();
    loadProducts();
  });
})();
