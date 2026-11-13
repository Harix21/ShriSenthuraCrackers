(function () {
  const admin = window.SVAdmin;
  const billTable = document.getElementById('historyTableContainer');
  const resultCount = document.getElementById('resultCount');
  const searchBillNo = document.getElementById('searchBillNo');
  const searchCustomer = document.getElementById('searchCustomer');
  const searchPhone = document.getElementById('searchPhone');
  const searchProduct = document.getElementById('searchProduct');
  const periodFilter = document.getElementById('periodFilter');
  const paymentFilter = document.getElementById('paymentFilter');
  const fromDate = document.getElementById('fromDate');
  const toDate = document.getElementById('toDate');
  const minTotal = document.getElementById('minTotal');
  const maxTotal = document.getElementById('maxTotal');
  const logoutBtn = document.getElementById('logoutBtn');
  const importInput = document.getElementById('importJsonInput');

  let allBills = [];

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  }

  function buildOrderDetailRows(items) {
    return items.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(item.name || 'Product')}</td>
        <td>${escapeHtml(item.quantity || 0)}</td>
        <td>${admin.money(item.rate || 0)}</td>
        <td>${admin.money(Number(item.amount || 0))}</td>
      </tr>
    `).join('');
  }

  function listProductsFromItems(items) {
    return items.map(item => `${item.name || 'Product'} x ${item.quantity || 0}`).join('<br>');
  }

  function ensureModal() {
    let modal = document.getElementById('svOrderModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'svOrderModal';
    modal.className = 'sv-modal-backdrop';
    modal.innerHTML = `
      <div class="sv-modal-window">
        <div class="sv-modal-head">
          <h3 id="svOrderModalTitle">Order Details</h3>
          <button class="sv-modal-close" id="svOrderModalClose" type="button" aria-label="Close">×</button>
        </div>
        <div class="sv-modal-body">
          <div id="svOrderModalContent"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#svOrderModalClose').addEventListener('click', () => closeModal());
    return modal;
  }

  function openModal(bill) {
    const modal = ensureModal();
    const content = modal.querySelector('#svOrderModalContent');
    const title = modal.querySelector('#svOrderModalTitle');
    title.textContent = `Bill ${bill.bill_no}`;
    const items = admin.getBillItemsArray(bill);
    const totalItems = admin.getItemsTotalQty(bill);
    content.innerHTML = `
      <div class="sv-modal-grid">
        <div class="field"><label>Customer</label><input value="${escapeHtml(bill.customer_name || 'Walk-in Customer')}" readonly></div>
        <div class="field"><label>Phone</label><input value="${escapeHtml(bill.customer_phone || '—')}" readonly></div>
        <div class="field"><label>Address</label><input value="${escapeHtml(bill.customer_address || '—')}" readonly></div>
        <div class="field"><label>Payment</label><input value="${escapeHtml(bill.payment_method || 'Cash')}" readonly></div>
      </div>
      <div class="sv-product-table-wrap">
        <table class="sv-product-table">
          <thead>
            <tr><th>#</th><th>Product</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>${buildOrderDetailRows(items)}</tbody>
        </table>
      </div>
      <div class="sv-modal-actions">
        <button class="cancel" type="button" id="svModalPrint">Print</button>
        <button class="cancel" type="button" id="svModalEdit">Edit</button>
        <button class="cancel" type="button" id="svModalClose2">Close</button>
      </div>
      <div class="subtle" style="margin-top:12px;">${totalItems} total quantity • ${admin.money(bill.grand_total || 0)}</div>
    `;

    modal.querySelector('#svModalClose2').addEventListener('click', closeModal);
    modal.querySelector('#svModalEdit').addEventListener('click', () => {
      closeModal();
      openEditModal(bill.bill_no);
    });
    modal.querySelector('#svModalPrint').addEventListener('click', () => printBill(bill.bill_no));
    modal.classList.add('open');
    document.body.classList.add('sv-modal-open');
  }

  function closeModal() {
    const modal = ensureModal();
    modal.classList.remove('open');
    if (!document.querySelector('#svOrderModal.open')) {
      document.body.classList.remove('sv-modal-open');
    }
  }

  function showAlert(message, type = 'success') {
    let toast = document.getElementById('svAlertToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'svAlertToast';
      toast.className = 'sv-alert-toast';
      toast.innerHTML = `
        <span class="sv-alert-toast-icon">✓</span>
        <span class="sv-alert-toast-message"></span>
        <button class="sv-alert-toast-close" type="button" aria-label="Close">×</button>
      `;
      document.body.appendChild(toast);
      toast.querySelector('.sv-alert-toast-close').addEventListener('click', () => {
        toast.className = 'sv-alert-toast';
      });
    }

    const icon = toast.querySelector('.sv-alert-toast-icon');
    const text = toast.querySelector('.sv-alert-toast-message');
    toast.className = `sv-alert-toast show ${type === 'error' ? 'error' : 'success'}`;
    icon.textContent = type === 'error' ? '×' : '✓';
    icon.style.background = type === 'error' ? 'var(--danger)' : 'var(--success)';
    text.textContent = message;

    window.setTimeout(() => {
      toast.className = 'sv-alert-toast';
    }, 2600);
  }

  function openEditModal(billNo) {
    const bill = allBills.find((row) => row.bill_no === billNo);
    if (!bill) return;

    const items = admin.getBillItemsArray(bill);
    const modal = ensureModal();
    const title = modal.querySelector('#svOrderModalTitle');
    title.textContent = `Edit ${bill.bill_no}`;
    const content = modal.querySelector('#svOrderModalContent');

    const productCatalogPromise = admin.fetchProducts().catch(() => []);
    productCatalogPromise.then((catalog) => {
      const options = catalog.length ? catalog.map((product) => `<option value="${product.id}">${escapeHtml(product.name || 'Product')}</option>`).join('') : '';
      content.innerHTML = `
        <div class="sv-modal-grid">
          <div class="field"><label>Bill Number</label><input value="${escapeHtml(bill.bill_no || '')}" readonly></div>
          <div class="field"><label>Bill Date</label><input value="${escapeHtml(admin.formatDate(bill.bill_date, true))}" readonly></div>
          <div class="field"><label>Customer Name</label><input id="editCustomerName" value="${escapeHtml(bill.customer_name || '')}"></div>
          <div class="field"><label>Phone</label><input id="editCustomerPhone" value="${escapeHtml(bill.customer_phone || '')}"></div>
          <div class="field"><label>Address</label><textarea id="editCustomerAddress" rows="2">${escapeHtml(bill.customer_address || '')}</textarea></div>
          <div class="field"><label>Payment Method</label>
            <select id="editPaymentMethod">
              <option ${bill.payment_method === 'Cash' ? 'selected' : ''}>Cash</option>
              <option ${bill.payment_method === 'UPI' ? 'selected' : ''}>UPI</option>
              <option ${bill.payment_method === 'Card' ? 'selected' : ''}>Card</option>
              <option ${bill.payment_method === 'Credit' ? 'selected' : ''}>Credit</option>
              <option ${bill.payment_method === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
        </div>

        <div class="sv-modal-grid" style="margin-top: 16px; align-items: end;">
          <div class="field">
            <label>Add Product</label>
            <select id="addProductSelect">${options}</select>
          </div>
          <div class="field">
            <label>Quantity</label>
            <input id="addProductQty" type="number" min="1" value="1" />
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <button class="btn btn-primary" type="button" id="addProductRowBtn">Add Product</button>
          </div>
        </div>

        <div class="sv-product-table-wrap">
          <table class="sv-product-table">
            <thead>
              <tr><th>#</th><th>Product</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Remove</th></tr>
            </thead>
            <tbody id="editProductTableBody">
              ${items.map((item, idx) => {
                const rowProduct = catalog.find((p) => String(p.id) === String(item.product_id) || p.name === item.name) || { id: item.product_id || '', name: item.name || 'Product', selling_price: Number(item.rate || 0) };
                return `<tr data-edit-row="${idx}">
                  <td>${idx + 1}</td>
                  <td><select data-edit-product="${idx}">${catalog.map((product) => `<option value="${product.id}" ${String(product.id) === String(rowProduct.id) || product.name === item.name ? 'selected' : ''}>${escapeHtml(product.name)}</option>`).join('')}</select></td>
                  <td><input type="number" min="1" value="${Number(item.quantity || 0)}" data-edit-qty="${idx}" style="width:80px;"></td>
                  <td>${admin.money(Number(rowProduct.selling_price || item.rate || 0))}</td>
                  <td>${admin.money(Number(item.amount || Number(rowProduct.selling_price || item.rate || 0) * Number(item.quantity || 0)))}</td>
                  <td><button class="btn btn-danger" type="button" data-remove-edit-row="${idx}">Remove</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="sv-modal-actions">
          <button class="cancel" type="button" id="svDeleteBill">Delete Bill</button>
          <button class="cancel" type="button" id="svCancelEdit">Cancel</button>
          <button class="save" type="button" id="svSaveEdit">Save Changes</button>
        </div>
      `;

      const addRowBtn = content.querySelector('#addProductRowBtn');
      const productSelect = content.querySelector('#addProductSelect');
      const qtyInput = content.querySelector('#addProductQty');
      const productTableBody = content.querySelector('#editProductTableBody');

      addRowBtn.addEventListener('click', () => {
        const productId = productSelect.value;
        const selectedProduct = catalog.find((p) => String(p.id) === String(productId));
        const qty = Math.max(1, Number(qtyInput.value || 1));
        if (!selectedProduct) return;
        const idx = productTableBody.rows.length;
        const amount = qty * Number(selectedProduct.selling_price || 0);
        const newRow = document.createElement('tr');
        newRow.dataset.editRow = String(idx);
        newRow.innerHTML = `<td>${idx + 1}</td>
          <td><select data-edit-product="${idx}">${catalog.map((product) => `<option value="${product.id}" ${product.id === selectedProduct.id ? 'selected' : ''}>${escapeHtml(product.name)}</option>`).join('')}</select></td>
          <td><input type="number" min="1" value="${qty}" data-edit-qty="${idx}" style="width:80px;"></td>
          <td>${admin.money(Number(selectedProduct.selling_price || 0))}</td>
          <td>${admin.money(amount)}</td>
          <td><button class="btn btn-danger" type="button" data-remove-edit-row="${idx}">Remove</button></td>`;
        productTableBody.appendChild(newRow);
      });

      productTableBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-remove-edit-row]');
        if (!button) return;
        const row = button.closest('tr');
        if (row) row.remove();
      });

      productTableBody.addEventListener('change', (event) => {
        const row = event.target.closest('tr');
        if (!row) return;
        const productSelect = row.querySelector('[data-edit-product]');
        const qtyInput = row.querySelector('[data-edit-qty]');
        if (!productSelect || !qtyInput) return;
        const selectedProduct = catalog.find((product) => String(product.id) === String(productSelect.value));
        if (!selectedProduct) return;
        const rate = Number(selectedProduct.selling_price || 0);
        const qty = Math.max(1, Number(qtyInput.value || 1));
        const amount = rate * qty;
        row.cells[3].textContent = admin.money(rate);
        row.cells[4].textContent = admin.money(amount);
      });

      productTableBody.addEventListener('input', (event) => {
        const row = event.target.closest('tr');
        if (!row) return;
        if (event.target.matches('[data-edit-qty]')) {
          const productSelect = row.querySelector('[data-edit-product]');
          const qtyInput = row.querySelector('[data-edit-qty]');
          if (!productSelect || !qtyInput) return;
          const selectedProduct = catalog.find((product) => String(product.id) === String(productSelect.value));
          if (!selectedProduct) return;
          const rate = Number(selectedProduct.selling_price || 0);
          const qty = Math.max(1, Number(qtyInput.value || 1));
          row.cells[3].textContent = admin.money(rate);
          row.cells[4].textContent = admin.money(rate * qty);
        }
      });

      modal.querySelector('#svCancelEdit').addEventListener('click', () => openModal(bill));

      modal.querySelector('#svDeleteBill').addEventListener('click', async () => {
        const confirmModal = document.createElement('div');
        confirmModal.className = 'sv-modal-backdrop open';
        confirmModal.style.zIndex = '120';
        confirmModal.innerHTML = `
          <div class="sv-modal-window" style="width:min(420px, calc(100vw - 40px));">
            <div class="sv-modal-head">
              <h3>Delete Bill</h3>
              <button class="sv-modal-close" type="button" data-delete-confirm-close>×</button>
            </div>
            <div class="sv-modal-body">
              <div class="subtle">Delete <strong>${escapeHtml(bill.bill_no)}</strong>? This cannot be undone.</div>
              <div class="sv-modal-actions">
                <button class="cancel" type="button" data-delete-confirm-close>Cancel</button>
                <button class="save" type="button" data-delete-confirm-ok>Delete</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(confirmModal);

        const closeDeleteConfirm = () => {
          confirmModal.remove();
        };

        confirmModal.querySelector('[data-delete-confirm-close]').addEventListener('click', closeDeleteConfirm);
        confirmModal.querySelector('[data-delete-confirm-ok]').addEventListener('click', async () => {
          const { error } = await admin.sb.from('bills').delete().eq('bill_no', bill.bill_no);
          if (error) {
            closeDeleteConfirm();
            alert('Unable to delete bill: ' + (error.message || error));
            return;
          }
          allBills = allBills.filter((row) => row.bill_no !== bill.bill_no);
          closeDeleteConfirm();
          closeModal();
          refresh();
          showAlert('Bill deleted successfully.');
        });
      });

      modal.querySelector('#svSaveEdit').addEventListener('click', async () => {
        const rows = Array.from(productTableBody.querySelectorAll('tr'));
        const items = [];

        rows.forEach((row) => {
          const productId = row.querySelector('[data-edit-product]').value;
          const qty = Math.max(1, Number(row.querySelector('[data-edit-qty]').value || 1));
          const product = catalog.find((p) => String(p.id) === String(productId));
          if (!product || !qty) return;

          const rate = Number(product.selling_price || 0);
          const amount = Number((rate * qty).toFixed(2));
          items.push({
            product_id: product.id,
            name: product.name,
            category_id: product.category_id || null,
            category_name: product.category_name || 'Uncategorized',
            quantity: qty,
            rate,
            amount
          });
        });

        const subtotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const discount = Number(bill.discount || 0);
        const extraCharges = Number(bill.extra_charges || 0);
        const taxAmount = Number(bill.tax_amount || 0);
        const grandTotal = Math.max(0, subtotal - discount + extraCharges + taxAmount);

        const next = {
          customer_name: content.querySelector('#editCustomerName').value.trim() || null,
          customer_phone: content.querySelector('#editCustomerPhone').value.trim() || null,
          customer_address: content.querySelector('#editCustomerAddress').value.trim() || null,
          payment_method: content.querySelector('#editPaymentMethod').value || 'Cash',
          items,
          total_items: items.length,
          total_quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          subtotal: Number(subtotal.toFixed(2)),
          discount: Number(discount.toFixed(2)),
          extra_charges: Number(extraCharges.toFixed(2)),
          tax_amount: Number(taxAmount.toFixed(2)),
          grand_total: Number(grandTotal.toFixed(2))
        };

        const { error } = await admin.sb.from('bills').update(next).eq('bill_no', bill.bill_no);
        if (error) {
          alert('Unable to update order: ' + (error.message || error));
          return;
        }

        const idx = allBills.findIndex((row) => row.bill_no === bill.bill_no);
        if (idx >= 0) allBills[idx] = { ...allBills[idx], ...next, bill_no: bill.bill_no, bill_date: bill.bill_date };

        closeModal();
        renderTable(applyFilters());
        showAlert('Order updated successfully.');
      });

      modal.classList.add('open');
    });
  }

  function applyFilters() {
    let filtered = [...allBills];
    const billNo = searchBillNo.value.trim().toLowerCase();
    const customer = searchCustomer.value.trim().toLowerCase();
    const phone = searchPhone.value.trim().toLowerCase();
    const product = searchProduct.value.trim().toLowerCase();
    const payment = paymentFilter.value;
    const min = Number(minTotal.value || 0);
    const max = Number(maxTotal.value || Number.MAX_SAFE_INTEGER);

    if (billNo) {
      filtered = filtered.filter((bill) => (bill.bill_no || '').toLowerCase().includes(billNo));
    }
    if (customer) {
      filtered = filtered.filter((bill) => (bill.customer_name || '').toLowerCase().includes(customer));
    }
    if (phone) {
      filtered = filtered.filter((bill) => (bill.customer_phone || '').toLowerCase().includes(phone));
    }
    if (product) {
      filtered = filtered.filter((bill) => 
        admin.getBillItemsArray(bill).some((item) => (item?.name || '').toLowerCase().includes(product))
      );
    }
    if (payment) {
      filtered = filtered.filter((bill) => (bill.payment_method || 'Cash') === payment);
    }
    if (min > 0) {
      filtered = filtered.filter((bill) => Number(bill.grand_total || 0) >= min);
    }
    if (max && max < Number.MAX_SAFE_INTEGER) {
      filtered = filtered.filter((bill) => Number(bill.grand_total || 0) <= max);
    }

    const period = periodFilter.value;
    if (period !== 'all') {
      const { start, end } = admin.getPeriodStart(period);
      filtered = filtered.filter((bill) => admin.isBillInRange(bill, start, end));
    }

    if (period === 'custom') {
      const from = fromDate.value ? new Date(`${fromDate.value}T00:00:00`) : null;
      const to = toDate.value ? new Date(`${toDate.value}T23:59:59`) : null;
      if (from) filtered = filtered.filter((bill) => new Date(bill.bill_date) >= from);
      if (to) filtered = filtered.filter((bill) => new Date(bill.bill_date) <= to);
    }

    return filtered;
  }

  function renderTable(rows) {
    resultCount.textContent = `${rows.length} result${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) {
      billTable.innerHTML = '<div class="empty-state">No bills match the current filters</div>';
      return;
    }

    billTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Bill No</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Products</th>
            <th>Payment</th>
            <th>Total</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((bill) => `
            <tr>
              <td>${bill.bill_no}</td>
              <td>${admin.formatDate(bill.bill_date, true)}</td>
              <td>${bill.customer_name || 'Walk-in Customer'}</td>
              <td>${admin.getItemsTotalQty(bill)}</td>
              <td><span class="badge ${bill.payment_method === 'Cash' ? 'cash' : bill.payment_method === 'UPI' ? 'upi' : bill.payment_method === 'Card' ? 'card' : bill.payment_method === 'Credit' ? 'credit' : 'other'}">${bill.payment_method || 'Cash'}</span></td>
              <td>${admin.money(bill.grand_total || 0)}</td>
              <td>
                <div class="inline-actions">
                  <button class="btn btn-secondary" type="button" onclick="window.openOrderDetails('${encodeURIComponent(bill.bill_no)}')">View</button>
                  <button class="btn btn-warning" type="button" onclick="window.openEditOrder('${encodeURIComponent(bill.bill_no)}')">Edit</button>
                  <button class="btn btn-primary" type="button" onclick="printBill('${bill.bill_no}')">Print</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function refresh() {
    renderTable(applyFilters());
  }

  function downloadJson(rows) {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'srivelavan-bills.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportExcel(rows) {
    const worksheet = XLSX.utils.json_to_sheet(rows.map((bill) => ({
      bill_no: bill.bill_no,
      bill_date: bill.bill_date,
      customer_name: bill.customer_name,
      customer_phone: bill.customer_phone,
      customer_address: bill.customer_address,
      payment_method: bill.payment_method,
      subtotal: bill.subtotal,
      discount: bill.discount,
      extra_charges: bill.extra_charges,
      tax_amount: bill.tax_amount,
      grand_total: bill.grand_total,
      amount_received: bill.amount_received,
      change_amount: bill.change_amount,
      total_items: bill.total_items,
      total_quantity: bill.total_quantity,
      items: JSON.stringify(bill.items || [])
    })));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bills');
    XLSX.writeFile(workbook, 'srivelavan-bills.xlsx');
  }

  async function importJson(file) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed?.bills || [];
    if (!rows.length) {
      alert('No bill records found in the imported JSON file.');
      return;
    }

    const result = await admin.upsertBillsFromImport(rows, { stopOnDuplicate: true });
    alert(`Import complete: ${result.inserted} bills added, ${result.skipped} skipped.`);
    await initialize();
  }

  async function initialize() {
    const session = await admin.requireAuth();
    if (!session) return;

    try {
      const bills = await admin.fetchBills();
      allBills = bills;
      renderTable(applyFilters());
    } catch (error) {
      billTable.innerHTML = `<div class="empty-state">Unable to load bills: ${error.message || error}</div>`;
    }
  }

  logoutBtn.addEventListener('click', async () => {
    await admin.sb.auth.signOut();
    window.location.href = 'billing.html';
  });

  document.getElementById('applyFiltersBtn').addEventListener('click', refresh);
  document.getElementById('resetFiltersBtn').addEventListener('click', () => {
    searchBillNo.value = '';
    searchCustomer.value = '';
    searchPhone.value = '';
    searchProduct.value = '';
    periodFilter.value = 'all';
    paymentFilter.value = '';
    fromDate.value = '';
    toDate.value = '';
    minTotal.value = '';
    maxTotal.value = '';
    refresh();
  });

  document.getElementById('exportJsonBtn').addEventListener('click', () => downloadJson(applyFilters()));
  document.getElementById('exportExcelBtn').addEventListener('click', () => exportExcel(applyFilters()));
  importInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (file) await importJson(file);
    event.target.value = '';
  });

  ['input', 'change'].forEach((eventName) => {
    [searchBillNo, searchCustomer, searchPhone, searchProduct, paymentFilter, periodFilter, minTotal, maxTotal, fromDate, toDate].forEach((el) => {
      el.addEventListener(eventName, refresh);
    });
  });

  function printHtmlBill(bill) {
    const itemsHtml = admin.getBillItemsArray(bill).map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(item.name || 'Product')}</td>
        <td>${escapeHtml(item.quantity || 0)}</td>
        <td>${admin.money(item.rate || 0)}</td>
        <td>${admin.money(Number(item.amount || 0))}</td>
      </tr>
    `).join('');

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Bill ${bill.bill_no}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 30px; color: #111; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #666; padding: 8px; text-align: left; }
            .top { display: flex; justify-content: space-between; }
            .meta { margin-top: 12px; }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <h2>Shri Senthura Crackers</h2>
              <div>576, Bharathiyar Road, Murugu Thottam, Thalatheru, Karaikal – 609609</div>
              <div>(Near Agriculture Office)</div>
              <div>Phone: 99400 51105</div>
              <div>Website: www.shrisenthuracrackers.com</div>
              <div>Tax Invoice</div>
            </div>
            <div><div>Bill No: ${escapeHtml(bill.bill_no)}</div><div>Date: ${admin.formatDate(bill.bill_date)}</div></div>
          </div>
          <div class="meta">
            <div>Customer: ${escapeHtml(bill.customer_name || 'Walk-in Customer')}</div>
            <div>Phone: ${escapeHtml(bill.customer_phone || '—')}</div>
            <div>Address: ${escapeHtml(bill.customer_address || '—')}</div>
          </div>
          <table>
            <thead><tr><th>S.No</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div style="margin-top: 16px; text-align: right;">
            <div>Subtotal: ${admin.money(bill.subtotal || 0)}</div>
            <div>Discount: ${admin.money(bill.discount || 0)}</div>
            <div>Grand Total: ${admin.money(bill.grand_total || 0)}</div>
            <div>Payment: ${escapeHtml(bill.payment_method || 'Cash')}</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    try {
      printWindow.print();
    } catch (error) {
      console.warn('Native print failed:', error);
    }
  }

  function printAsPdf(bill) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      printHtmlBill(bill);
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = 60;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Shri Senthura Crackers', 40, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y += 18;
    doc.text('576, Bharathiyar Road, Murugu Thottam, Thalatheru, Karaikal – 609609', 40, y);
    y += 14;
    doc.text('(Near Agriculture Office)', 40, y);
    y += 14;
    doc.text('Phone: 99400 51105', 40, y);
    y += 14;
    doc.text('Website: www.shrisenthuracrackers.com', 40, y);
    y += 20;
    doc.text(`Bill No: ${bill.bill_no}`, 40, y);
    y += 16;
    doc.text(`Date: ${admin.formatDate(bill.bill_date)}`, 40, y);
    y += 18;
    doc.text(`Customer: ${bill.customer_name || 'Walk-in Customer'}`, 40, y);
    y += 16;
    doc.text(`Phone: ${bill.customer_phone || '—'}`, 40, y);
    y += 16;
    doc.text(`Address: ${bill.customer_address || '—'}`, 40, y);
    y += 22;
    doc.setFont('helvetica', 'bold');
    doc.text('Item', 40, y);
    doc.text('Qty', 260, y);
    doc.text('Rate', 330, y);
    doc.text('Amount', 450, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    admin.getBillItemsArray(bill).forEach((item) => {
      doc.text(item.name || 'Product', 40, y);
      doc.text(String(item.quantity || 0), 260, y);
      doc.text(admin.money(item.rate || 0).replace('₹', ''), 330, y);
      doc.text(admin.money(Number(item.amount || 0)).replace('₹', ''), 450, y);
      y += 16;
    });
    y += 16;
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: ${admin.money(bill.grand_total || 0)}`, 40, y);
    doc.text(`Payment: ${bill.payment_method || 'Cash'}`, 330, y);
    doc.save(`${bill.bill_no}.pdf`);
  }

  window.openOrderDetails = (billNo) => {
    const bill = allBills.find((item) => item.bill_no === decodeURIComponent(billNo));
    if (!bill) return;
    openModal(bill);
  };

  window.openEditOrder = (billNo) => {
    const bill = allBills.find((item) => item.bill_no === decodeURIComponent(billNo));
    if (!bill) return;
    openEditModal(bill.bill_no);
  };

  window.printBill = (billNo) => {
    const bill = allBills.find((item) => item.bill_no === billNo);
    if (!bill) return;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || /Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1;
    if (isIOS) {
      printAsPdf(bill);
      return;
    }
    printHtmlBill(bill);
  };

  admin.requireAuth().then(() => initialize());
})();
