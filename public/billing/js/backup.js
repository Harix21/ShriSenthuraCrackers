(function () {
  const admin = window.SVAdmin;
  const overviewCards = document.getElementById('overviewCards');
  const backupSummary = document.getElementById('backupSummary');
  const restoreInfo = document.getElementById('restoreInfo');
  const restoreFileInput = document.getElementById('restoreFileInput');
  const createBackupBtn = document.getElementById('createBackupBtn');
  const exportProductsBtn = document.getElementById('exportProductsBtn');
  const exportBillsBtn = document.getElementById('exportBillsBtn');
  const validateBackupBtn = document.getElementById('validateBackupBtn');
  const restoreBackupBtn = document.getElementById('restoreBackupBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  let backupData = null;
  let selectedFile = null;

  function downloadFile(filename, data, type) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function loadOverview() {
    const [catRes, prodRes, billRes] = await Promise.all([
      admin.sb.from('categories').select('id', { count: 'exact' }),
      admin.sb.from('products').select('id', { count: 'exact' }),
      admin.sb.from('bills').select('id', { count: 'exact' })
    ]);

    const categories = catRes.count || 0;
    const products = prodRes.count || 0;
    const bills = billRes.count || 0;

    overviewCards.innerHTML = `
      <div class="metric-box"><div class="small-label">Categories</div><div class="metric-value">${categories}</div></div>
      <div class="metric-box"><div class="small-label">Products</div><div class="metric-value">${products}</div></div>
      <div class="metric-box"><div class="small-label">Bills</div><div class="metric-value">${bills}</div></div>
    `;

    return { categories, products, bills };
  }

  async function buildBackup() {
    const [categoriesRes, productsRes, billsRes] = await Promise.all([
      admin.sb.from('categories').select('*'),
      admin.sb.from('products').select('*'),
      admin.sb.from('bills').select('*')
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (productsRes.error) throw productsRes.error;
    if (billsRes.error) throw billsRes.error;

    const payload = {
      backup_version: 1,
      backup_date: new Date().toISOString(),
      categories: categoriesRes.data || [],
      products: productsRes.data || [],
      bills: billsRes.data || []
    };

    backupData = payload;
    backupSummary.innerHTML = `
      <div><strong>Categories:</strong> ${payload.categories.length}</div>
      <div><strong>Products:</strong> ${payload.products.length}</div>
      <div><strong>Bills:</strong> ${payload.bills.length}</div>
      <div style="margin-top:12px; color: var(--muted);">Ready to download.</div>
    `;

    return payload;
  }

  async function exportJson(type) {
    const payload = await buildBackup();
    if (type === 'products') {
      downloadFile('sri-velavan-products.json', JSON.stringify(payload.products, null, 2), 'application/json');
      return;
    }
    if (type === 'bills') {
      downloadFile('sri-velavan-bills.json', JSON.stringify(payload.bills, null, 2), 'application/json');
      return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`sri-velavan-pos-backup-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
  }

  function validateBackupObject(obj) {
    if (!obj || typeof obj !== 'object') return { valid: false, message: 'Backup file is not valid JSON.' };
    if (obj.backup_version === undefined) return { valid: false, message: 'Missing backup_version.' };
    if (!Array.isArray(obj.categories)) return { valid: false, message: 'Missing categories array.' };
    if (!Array.isArray(obj.products)) return { valid: false, message: 'Missing products array.' };
    if (!Array.isArray(obj.bills)) return { valid: false, message: 'Missing bills array.' };
    return { valid: true, message: 'Backup structure is valid.' };
  }

  async function restoreBackup() {
    if (!backupData || !selectedFile) {
      alert('Please select a valid backup file first.');
      return;
    }

    const confirmRestore = confirm('This will add or update business data in Supabase. Existing records will not be blindly deleted. Continue?');
    if (!confirmRestore) return;

    const summary = { added: 0, updated: 0, skipped: 0, failed: 0 };

    try {
      for (const category of backupData.categories || []) {
        if (!category?.id) continue;
        const { data: existing } = await admin.sb.from('categories').select('id').eq('id', category.id).single();
        if (existing) {
          const { error } = await admin.sb.from('categories').update({ name: category.name }).eq('id', category.id);
          if (error) { summary.failed++; } else { summary.updated++; }
        } else {
          const { error } = await admin.sb.from('categories').insert([{ id: category.id, name: category.name, created_at: category.created_at || new Date().toISOString(), updated_at: category.updated_at || new Date().toISOString() }]);
          if (error) { summary.failed++; } else { summary.added++; }
        }
      }

      for (const product of backupData.products || []) {
        if (!product?.id) continue;
        const { data: existing } = await admin.sb.from('products').select('id').eq('id', product.id).single();
        if (existing) {
          const { error } = await admin.sb.from('products').update({
            name: product.name,
            category_id: product.category_id,
            original_price: product.original_price,
            selling_price: product.selling_price,
            image_url: product.image_url,
            ...(product.image_public_id ? { image_public_id: product.image_public_id } : {}),
            description: product.description,
            is_active: product.is_active
          }).eq('id', product.id);
          if (error) { summary.failed++; } else { summary.updated++; }
        } else {
          const { error } = await admin.sb.from('products').insert([{
            id: product.id,
            name: product.name,
            category_id: product.category_id,
            original_price: product.original_price,
            selling_price: product.selling_price,
            image_url: product.image_url,
            ...(product.image_public_id ? { image_public_id: product.image_public_id } : {}),
            description: product.description,
            is_active: product.is_active,
            created_at: product.created_at || new Date().toISOString(),
            updated_at: product.updated_at || new Date().toISOString()
          }]);
          if (error) { summary.failed++; } else { summary.added++; }
        }
      }

      for (const bill of backupData.bills || []) {
        if (!bill?.bill_no) continue;
        const { data: existing } = await admin.sb.from('bills').select('id').eq('bill_no', bill.bill_no).single();
        if (existing) {
          const { error } = await admin.sb.from('bills').update({
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
            items: bill.items,
            notes: bill.notes
          }).eq('bill_no', bill.bill_no);
          if (error) { summary.failed++; } else { summary.updated++; }
        } else {
          const { error } = await admin.sb.from('bills').insert([{
            ...bill,
            id: bill.id || undefined,
            created_at: bill.created_at || new Date().toISOString(),
            updated_at: bill.updated_at || new Date().toISOString()
          }]);
          if (error) { summary.failed++; } else { summary.added++; }
        }
      }

      alert(`Restore completed. Added: ${summary.added}, Updated: ${summary.updated}, Failed: ${summary.failed}, Skipped: ${summary.skipped}.`);
      await loadOverview();
    } catch (error) {
      alert(`Restore failed: ${error.message || error}`);
    }
  }

  restoreFileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    selectedFile = file;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const validation = validateBackupObject(parsed);
      if (!validation.valid) {
        restoreInfo.innerHTML = `<div class="empty-state">${validation.message}</div>`;
        return;
      }

      backupData = parsed;
      restoreInfo.innerHTML = `
        <div><strong>Backup file:</strong> ${file.name}</div>
        <div><strong>Backup date:</strong> ${new Date(parsed.backup_date).toLocaleString()}</div>
        <div><strong>Categories:</strong> ${parsed.categories.length}</div>
        <div><strong>Products:</strong> ${parsed.products.length}</div>
        <div><strong>Bills:</strong> ${parsed.bills.length}</div>
      `;
    } catch (error) {
      restoreInfo.innerHTML = '<div class="empty-state">Invalid JSON file. Please choose a valid backup.</div>';
    }
  });

  createBackupBtn.addEventListener('click', async () => {
    try {
      await buildBackup();
      exportJson('full');
    } catch (error) {
      alert(error.message || 'Unable to create backup.');
    }
  });

  exportProductsBtn.addEventListener('click', () => exportJson('products'));
  exportBillsBtn.addEventListener('click', () => exportJson('bills'));
  validateBackupBtn.addEventListener('click', () => {
    if (!selectedFile) {
      restoreInfo.innerHTML = '<div class="empty-state">Please select a backup file to validate.</div>';
      return;
    }
    restoreInfo.innerHTML = '<div class="empty-state">Validation is done when a valid file is selected.</div>';
  });
  restoreBackupBtn.addEventListener('click', restoreBackup);

  logoutBtn.addEventListener('click', async () => {
    await admin.sb.auth.signOut();
    window.location.href = 'billing.html';
  });

  admin.requireAuth().then(async () => {
    await loadOverview();
  }).catch(() => {
    window.location.href = 'billing.html';
  });
})();
