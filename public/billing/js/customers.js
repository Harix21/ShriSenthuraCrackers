(function () {
  const admin = window.SVAdmin;
  const table = document.getElementById('customerTable');
  const search = document.getElementById('customerSearch');
  const modal = document.getElementById('customerModal');
  const form = document.getElementById('customerForm');
  let customers = [];
  let bills = [];
  let editingId = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function openModal(customer) {
    editingId = customer?.id || null;
    document.getElementById('customerModalTitle').textContent = editingId ? 'Edit Customer' : 'Add Customer';
    document.getElementById('customerName').value = customer?.name || '';
    document.getElementById('customerPhone').value = customer?.phone || '';
    document.getElementById('customerAddress').value = customer?.address || '';
    document.getElementById('customerNotes').value = customer?.notes || '';
    const customerBills = customer ? bills.filter((bill) => bill.customer_id === customer.id || (bill.customer_phone && bill.customer_phone === customer.phone)) : [];
    document.getElementById('customerOrders').innerHTML = customer ? `<h4 style="margin:0 0 10px;">Previous Orders</h4>${customerBills.length ? customerBills.map((bill) => {
      const items = Array.isArray(bill.items) ? bill.items : [];
      const itemText = items.map((item) => `${escapeHtml(item.name || 'Product')} × ${Number(item.quantity || 0)}`).join(', ') || 'Items unavailable';
      return `<div style="border-bottom:1px solid var(--border);padding:9px 0;"><div style="display:flex;justify-content:space-between;gap:10px;"><strong>${escapeHtml(bill.bill_no || 'Bill')}</strong><strong>${admin.money(bill.grand_total)}</strong></div><div class="subtle">${admin.formatCompactDate(bill.bill_date)} · ${escapeHtml(bill.payment_method || 'Cash')}</div><div style="font-size:.82rem;margin-top:4px;">${itemText}</div></div>`;
    }).join('') : '<div class="subtle">No previous orders.</div>'}` : '';
    modal.classList.add('open');
  }

  function closeModal() { modal.classList.remove('open'); form.reset(); editingId = null; }

  function render() {
    const query = search.value.trim().toLowerCase();
    const rows = customers.filter((customer) => !query || `${customer.name} ${customer.phone || ''}`.toLowerCase().includes(query));
    document.getElementById('customerCount').textContent = `${rows.length} customer${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) { table.innerHTML = '<div class="empty-state">No customers found.</div>'; return; }
    table.innerHTML = `<table><thead><tr><th>Customer</th><th>Phone</th><th>Purchases</th><th>Total Spent</th><th>Last Purchase</th><th>Actions</th></tr></thead><tbody>${rows.map((customer) => {
      const customerBills = bills.filter((bill) => bill.customer_id === customer.id || (bill.customer_phone && bill.customer_phone === customer.phone));
      const total = customerBills.reduce((sum, bill) => sum + Number(bill.grand_total || 0), 0);
      const last = customerBills[0]?.bill_date ? admin.formatCompactDate(customerBills[0].bill_date) : '—';
      return `<tr><td><button type="button" class="btn btn-secondary" data-view="${customer.id}">${escapeHtml(customer.name)}</button><br><span class="subtle">${escapeHtml(customer.address || 'No address')}</span></td><td>${escapeHtml(customer.phone || '—')}</td><td>${customerBills.length}</td><td>${admin.money(total)}</td><td>${last}</td><td><button class="btn btn-secondary" data-edit="${customer.id}">Edit</button></td></tr>`;
    }).join('')}</tbody></table>`;
    table.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openModal(customers.find((customer) => customer.id === button.dataset.edit))));
    table.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => openModal(customers.find((customer) => customer.id === button.dataset.view))));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = { name: document.getElementById('customerName').value.trim(), phone: document.getElementById('customerPhone').value.trim() || null, address: document.getElementById('customerAddress').value.trim() || null, notes: document.getElementById('customerNotes').value.trim() || null };
    const request = editingId ? admin.sb.from('customers').update(payload).eq('id', editingId) : admin.sb.from('customers').insert([payload]);
    const { error } = await request;
    if (error) { alert(error.message); return; }
    closeModal(); await load();
  });

  async function load() {
    const [customerResult, billResult] = await Promise.all([admin.sb.from('customers').select('*').order('name'), admin.sb.from('bills').select('customer_id,customer_phone,bill_no,items,payment_method,grand_total,bill_date').order('bill_date', { ascending: false })]);
    if (customerResult.error) {
      table.innerHTML = `<div class="empty-state">Unable to load customers: ${customerResult.error.message || customerResult.error}</div>`;
      return;
    }
    if (billResult.error) {
      table.innerHTML = `<div class="empty-state">Unable to load billing history: ${billResult.error.message || billResult.error}</div>`;
      return;
    }
    customers = customerResult.data || []; bills = billResult.data || []; render();
  }

  document.getElementById('newCustomerBtn').addEventListener('click', () => openModal());
  document.getElementById('closeCustomerModal').addEventListener('click', closeModal);
  document.getElementById('cancelCustomerBtn').addEventListener('click', closeModal);
  search.addEventListener('input', render);
  document.getElementById('logoutBtn').addEventListener('click', async () => { await admin.sb.auth.signOut(); window.location.href = 'billing.html'; });
  admin.sb.auth.getSession().then(({ data: { session }, error }) => {
    if (error || !session) {
      if (window.top !== window.self) window.top.location.href = 'billing.html';
      else window.location.href = 'billing.html';
      return;
    }
    return load();
  }).catch((error) => {
    table.innerHTML = `<div class="empty-state">Unable to load customers: ${error.message || error}</div>`;
  });
})();
