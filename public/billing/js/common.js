(function () {
  const config = window.SUPABASE_CONFIG || globalThis.SUPABASE_CONFIG;
  if (!config || !config.url || !config.anonKey) {
    throw new Error('Supabase config is missing. Check supabase-config.js.');
  }

  const sb = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'sv-billing-auth-token'
    }
  });

  function money(value) {
    const num = Number(value || 0);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(value, withTime = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: withTime ? 'short' : undefined
    }).format(date);
  }

  function formatCompactDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  function normalizeBillRow(bill) {
    const amount = Number(bill?.grand_total || bill?.amount || 0);
    return {
      ...bill,
      amount,
      bill_no: bill?.bill_no || 'N/A',
      customer_name: bill?.customer_name || 'Walk-in Customer',
      payment_method: bill?.payment_method || 'Cash',
      items: Array.isArray(bill?.items) ? bill.items : safeJsonParse(bill?.items, []),
      bill_date: bill?.bill_date || new Date().toISOString()
    };
  }

  function safeJsonParse(value, fallback = []) {
    if (!value) return fallback;
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function getBillItemsArray(bill) {
    if (!bill) return [];
    const items = Array.isArray(bill.items) ? bill.items : safeJsonParse(bill.items, []);
    return items.filter(Boolean);
  }

  function getItemsTotalQty(bill) {
    return getBillItemsArray(bill).reduce((sum, item) => sum + Number(item?.quantity || 0), 0);
  }

  function getTotalRevenue(bills) {
    return bills.reduce((sum, bill) => sum + Number(bill?.grand_total || 0), 0);
  }

  function getBillProfit(bill) {
    if (!bill) return 0;
    const storedProfit = Number(bill?.profit_total ?? 0);
    if (bill?.profit_total !== undefined && bill?.profit_total !== null && bill?.profit_total !== '') {
      return storedProfit;
    }

    return getBillItemsArray(bill).reduce((sum, item) => {
      const selling = Number(item?.amount || item?.selling_price || 0) * Number(item?.quantity || 1);
      const cost = Number(item?.cost_amount || Number(item?.cost_price || 0) * Number(item?.quantity || 1));
      return sum + (selling - cost);
    }, 0);
  }

  function getTotalProfit(bills) {
    return bills.reduce((sum, bill) => sum + getBillProfit(bill), 0);
  }

  function getPeriodStart(period) {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (period === 'week') {
      const currentDay = start.getDay();
      const diffToSunday = currentDay === 0 ? 0 : currentDay;
      start.setDate(start.getDate() - diffToSunday);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (period === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (period === 'year') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    start.setFullYear(2000, 0, 1);
    end.setFullYear(2100, 11, 31);
    return { start, end };
  }

  function isBillInRange(bill, start, end) {
    const billDate = new Date(bill?.bill_date || 0);
    if (Number.isNaN(billDate.getTime())) return false;
    return billDate >= start && billDate <= end;
  }

  function uniqueBy(items, key) {
    const seen = new Set();
    return items.filter((item) => {
      const val = item?.[key];
      if (!val || seen.has(val)) return false;
      seen.add(val);
      return true;
    });
  }

  async function ensureSession() {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) {
      console.error('Session fetch error:', error);
      return null;
    }
    if (!session) {
      return null;
    }
    return session;
  }

  async function requireAuth() {
    const session = await ensureSession();
    if (!session) {
      if (typeof window !== 'undefined') {
        window.location.href = 'billing.html';
      }
      return null;
    }
    return session;
  }

  async function fetchBills() {
    const { data, error } = await sb
      .from('bills')
      .select('*')
      .order('bill_date', { ascending: false });

    if (error) {
      throw error;
    }
    return (data || []).map(normalizeBillRow);
  }

  async function fetchProducts() {
    const { data, error } = await sb
      .from('products')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function upsertBillsFromImport(rows, { stopOnDuplicate = true } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0, skipped: 0, errors: [] };

    const validRows = rows.filter((row) => row && row.bill_no);
    const uniqueRows = uniqueBy(validRows, 'bill_no');

    const { data: existingRows } = await sb
      .from('bills')
      .select('bill_no')
      .in('bill_no', uniqueRows.map((row) => row.bill_no));

    const existing = new Set((existingRows || []).map((item) => item.bill_no));
    const insertRows = uniqueRows.filter((row) => {
      if (existing.has(row.bill_no)) {
        return false;
      }
      return true;
    });

    if (insertRows.length) {
      const { error } = await sb.from('bills').insert(insertRows);
      if (error) {
        throw error;
      }
    }

    return {
      inserted: insertRows.length,
      skipped: uniqueRows.length - insertRows.length,
      errors: []
    };
  }

  window.SVAdmin = {
    sb,
    money,
    formatDate,
    formatCompactDate,
    safeJsonParse,
    getBillItemsArray,
    getItemsTotalQty,
    getTotalRevenue,
    getBillProfit,
    getTotalProfit,
    getPeriodStart,
    isBillInRange,
    normalizeBillRow,
    requireAuth,
    fetchBills,
    fetchProducts,
    upsertBillsFromImport
  };
})();
