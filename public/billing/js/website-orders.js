(function () {
  const admin = window.SVAdmin;
  const container = document.getElementById('ordersContainer');
  const resultCount = document.getElementById('resultCount');
  let requests = [];

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  }

  function ensureModal() {
    let modal = document.getElementById('svWebsiteOrderModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'svWebsiteOrderModal';
    modal.className = 'sv-modal-backdrop';
    modal.innerHTML = `
      <div class="sv-modal-window">
        <div class="sv-modal-head">
          <h3 id="svWebsiteOrderModalTitle">Website Order Details</h3>
          <button class="sv-modal-close" id="svWebsiteOrderModalClose" type="button" aria-label="Close">×</button>
        </div>
        <div class="sv-modal-body">
          <div id="svWebsiteOrderModalContent"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#svWebsiteOrderModalClose').addEventListener('click', () => {
      modal.classList.remove('open');
      if (!document.querySelector('#svWebsiteOrderModal.open')) {
        document.body.classList.remove('sv-modal-open');
      }
    });
    return modal;
  }

  function parseRequestItems(request) {
    if (Array.isArray(request.items)) return request.items;
    if (!request.items) return [];
    try {
      const parsed = JSON.parse(request.items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function openRequestModal(request) {
    const modal = ensureModal();
    const content = modal.querySelector('#svWebsiteOrderModalContent');
    modal.querySelector('#svWebsiteOrderModalTitle').textContent = `${request.request_no || 'Website Order'}`;

    const items = parseRequestItems(request);
    content.innerHTML = `
      <div class="sv-modal-grid">
        <div class="field"><label>Customer</label><input value="${escapeHtml(request.customer_name || '—')}" readonly></div>
        <div class="field"><label>Phone</label><input value="${escapeHtml(request.customer_phone || '—')}" readonly></div>
        <div class="field"><label>Address</label><input value="${escapeHtml(request.customer_address || '—')}" readonly></div>
        <div class="field"><label>District / State</label><input value="${escapeHtml(request.customer_district || '—')} / ${escapeHtml(request.customer_state || '—')}" readonly></div>
        <div class="field"><label>Payment</label><input value="${escapeHtml(request.payment_method || 'Pending')}" readonly></div>
        <div class="field"><label>Total</label><input value="${admin.money(request.total || 0)}" readonly></div>
      </div>
      <div class="sv-product-table-wrap">
        <table class="sv-product-table">
          <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Unit Rate</th><th>Amount</th></tr></thead>
          <tbody>${items.length ? items.map((item, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(item.name || 'Product')}</td>
              <td>${escapeHtml(item.quantity || item.qty || 0)}</td>
              <td>${admin.money(Number(item.rate || item.price || 0))}</td>
              <td>${admin.money(Number(item.amount || ((Number(item.rate || item.price || 0)) * Number(item.quantity || item.qty || 0))))}</td>
            </tr>
          `).join('') : '<tr><td colspan="5">No order items available.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="sv-modal-actions">
        <button class="cancel" type="button" id="svRequestModalClose">Close</button>
      </div>
    `;
    modal.querySelector('#svRequestModalClose').addEventListener('click', () => {
      modal.classList.remove('open');
      if (!document.querySelector('#svWebsiteOrderModal.open')) {
        document.body.classList.remove('sv-modal-open');
      }
    });
    modal.classList.add('open');
    document.body.classList.add('sv-modal-open');
  }

  function render() {
    resultCount.textContent = `${requests.length} request${requests.length === 1 ? '' : 's'}`;
    if (!requests.length) {
      container.innerHTML = '<div class="empty-state">No pending website orders.</div>';
      return;
    }
    container.innerHTML = `<table><thead><tr><th>Request</th><th>Customer</th><th>Items</th><th>Total</th><th>Received</th><th>Confirm payment</th><th>Action</th></tr></thead><tbody>${requests.map((request) => `
      <tr>
        <td><strong>${escapeHtml(request.request_no)}</strong><br><span class="subtle">${admin.formatDate(request.created_at, true)}</span></td>
        <td>${escapeHtml(request.customer_name)}<br><span class="subtle">${escapeHtml(request.customer_phone)}<br>${escapeHtml(request.customer_address)}, ${escapeHtml(request.customer_district)}</span></td>
        <td>${Number(request.total_quantity || 0)} units</td>
        <td><strong>${admin.money(request.total)}</strong></td>
        <td>${admin.formatDate(request.created_at, true)}</td>
        <td><select data-payment-id="${request.id}"><option value="">Select payment</option><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Card">Card</option></select></td>
        <td><div class="inline-actions"><button class="btn btn-secondary" type="button" data-view-id="${request.id}">View</button><button class="btn btn-primary" type="button" data-confirm-id="${request.id}">Confirm</button><button class="btn btn-danger" type="button" data-cancel-id="${request.id}">Cancel</button></div></td>
      </tr>`).join('')}</tbody></table>`;
  }

  async function loadRequests() {
    container.innerHTML = '<div class="empty-state">Loading website orders...</div>';
    const { data, error } = await admin.sb.from('website_order_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true });
    if (error) {
      container.innerHTML = `<div class="empty-state">Unable to load website orders: ${escapeHtml(error.message || error)}</div>`;
      return;
    }
    requests = data || [];
    render();
  }

  async function confirmRequest(id) {
    const payment = container.querySelector(`[data-payment-id="${id}"]`)?.value;
    if (!payment) { alert('Select a payment method before confirming.'); return; }
    const { error } = await admin.sb.rpc('confirm_website_order', { p_request_id: id, p_payment_method: payment });
    if (error) { alert(`Unable to confirm order: ${error.message || error}`); return; }
    await loadRequests();
  }

  async function cancelRequest(id) {
    if (!window.confirm('Cancel this website order request?')) return;
    const { error } = await admin.sb.from('website_order_requests').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending');
    if (error) { alert(`Unable to cancel order: ${error.message || error}`); return; }
    await loadRequests();
  }

  container.addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-view-id]');
    const confirmButton = event.target.closest('[data-confirm-id]');
    const cancelButton = event.target.closest('[data-cancel-id]');
    if (viewButton) {
      const request = requests.find((row) => row.id === viewButton.dataset.viewId);
      if (request) openRequestModal(request);
    }
    if (confirmButton) confirmRequest(confirmButton.dataset.confirmId);
    if (cancelButton) cancelRequest(cancelButton.dataset.cancelId);
  });
  document.getElementById('refreshBtn').addEventListener('click', loadRequests);
  document.getElementById('logoutBtn').addEventListener('click', async () => { await admin.sb.auth.signOut(); window.location.href = 'billing.html'; });
  (async function initialize() { if (await admin.requireAuth()) await loadRequests(); })();
})();