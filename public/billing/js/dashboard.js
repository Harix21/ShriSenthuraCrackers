(function () {
  const admin = window.SVAdmin;
  const statsGrid = document.getElementById('statsGrid');
  const recentBillsContainer = document.getElementById('recentBillsContainer');
  const paymentSummary = document.getElementById('paymentSummary');
  const topOrdersContainer = document.getElementById('topOrdersContainer');
  const topProductsContainer = document.getElementById('topProductsContainer');
  const categorySummary = document.getElementById('categorySummary');
  const summaryGrid = document.getElementById('summaryGrid');
  const profitSummaryText = document.getElementById('profitSummaryText');
  const profitInsightText = document.getElementById('profitInsightText');
  const logoutBtn = document.getElementById('logoutBtn');

  function createStatCard(label, value, deltaText = '') {
    return `
      <div class="stat-card">
        <div class="label">${label}</div>
        <div class="value">${value}</div>
        ${deltaText ? `<div class="delta">${deltaText}</div>` : ''}
      </div>
    `;
  }

  function buildPaymentSummary(bills) {
    const summary = {};
    bills.forEach((bill) => {
      const key = bill.payment_method || 'Cash';
      summary[key] = (summary[key] || 0) + Number(bill.grand_total || 0);
    });

    const entries = Object.entries(summary).map(([method, total]) => ({ method, total }));
    if (!entries.length) {
      return '<div class="empty-state">No payment data available</div>';
    }

    const colors = ['#f97316', '#2563eb', '#7c3aed', '#f59e0b', '#10b981', '#6b7280'];
    const listMarkup = entries.map(({ method, total }) => `
      <li>
        <span><span class="badge ${method.toLowerCase() === 'cash' ? 'cash' : method.toLowerCase() === 'upi' ? 'upi' : method.toLowerCase() === 'card' ? 'card' : method.toLowerCase() === 'credit' ? 'credit' : 'other'}">${method}</span></span>
        <strong>${admin.money(total)}</strong>
      </li>
    `).join('');

    const infoMarkup = typeof Chart === 'undefined'
      ? '<div class="empty-state" style="padding: 12px;">Chart unavailable; showing payment totals instead.</div>'
      : '';

    return `
      <div style="display:grid; gap:12px;">
        <canvas id="paymentSummaryChart" style="width:100%; height:220px; display:block;"></canvas>
        ${infoMarkup}
        <ul class="list-compact">${listMarkup}</ul>
      </div>
    `;
  }

  function renderPaymentSummaryChart(bills) {
    if (!paymentSummary || typeof Chart === 'undefined') return;
    const canvas = paymentSummary.querySelector('#paymentSummaryChart');
    if (!canvas) return;

    const summary = {};
    bills.forEach((bill) => {
      const key = bill.payment_method || 'Cash';
      summary[key] = (summary[key] || 0) + Number(bill.grand_total || 0);
    });

    const entries = Object.entries(summary).map(([method, total]) => ({ method, total }));
    if (!entries.length) return;

    const colors = ['#f97316', '#2563eb', '#7c3aed', '#f59e0b', '#10b981', '#6b7280'];

    try {
      new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: entries.map(({ method }) => method),
          datasets: [{
            data: entries.map(({ total }) => total),
            backgroundColor: colors.slice(0, entries.length),
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: { legend: { position: 'bottom' } }
        }
      });
    } catch (error) {
      console.error('Payment summary chart failed to render:', error);
    }
  }

  function buildTopProducts(bills) {
    const productMap = new Map();
    bills.forEach((bill) => {
      const items = admin.getBillItemsArray(bill);
      items.forEach((item) => {
        const key = item?.name || 'Unknown product';
        const qty = Number(item?.quantity || 0);
        const amount = Number(item?.amount || 0);
        if (productMap.has(key)) {
          const current = productMap.get(key);
          current.qty += qty;
          current.amount += amount;
        } else {
          productMap.set(key, { name: key, qty, amount });
        }
      });
    });

    const rows = [...productMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
    if (!rows.length) {
      return '<div class="empty-state">No product sales yet</div>';
    }

    return `
      <ul class="list-compact">
        ${rows.map((row) => `
          <li>
            <span>${row.name}</span>
            <strong>${row.qty} sold</strong>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function buildCategorySummary(bills) {
    const map = new Map();
    bills.forEach((bill) => {
      const items = admin.getBillItemsArray(bill);
      items.forEach((item) => {
        const category = item?.category_name || 'Uncategorized';
        const amount = Number(item?.amount || 0);
        map.set(category, (map.get(category) || 0) + amount);
      });
    });

    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!rows.length) {
      return '<div class="empty-state">No category data available</div>';
    }

    return `
      <ul class="list-compact">
        ${rows.map(([name, total]) => `
          <li>
            <span>${name}</span>
            <strong>${admin.money(total)}</strong>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function buildTopOrders(bills) {
    const rows = [...bills].sort((a, b) => Number(b.grand_total || 0) - Number(a.grand_total || 0)).slice(0, 5);
    if (!rows.length) {
      return '<div class="empty-state">No bills found</div>';
    }

    return `
      <table>
        <thead>
          <tr>
            <th>Bill</th>
            <th>Customer</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((bill) => `
            <tr>
              <td>${bill.bill_no}</td>
              <td>${bill.customer_name || 'Walk-in Customer'}</td>
              <td>${admin.money(bill.grand_total || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function buildRecentBills(bills) {
    const rows = bills.slice(0, 6);
    if (!rows.length) {
      return '<div class="empty-state">No bills recorded yet</div>';
    }

    return `
      <table>
        <thead>
          <tr>
            <th>Bill No</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((bill) => `
            <tr>
              <td>${bill.bill_no}</td>
              <td>${admin.formatCompactDate(bill.bill_date)}</td>
              <td>${bill.customer_name || 'Walk-in Customer'}</td>
              <td>${admin.money(bill.grand_total || 0)}</td>
              <td><span class="badge ${bill.payment_method === 'Cash' ? 'cash' : bill.payment_method === 'UPI' ? 'upi' : bill.payment_method === 'Card' ? 'card' : bill.payment_method === 'Credit' ? 'credit' : 'other'}">${bill.payment_method || 'Cash'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function getDailyProfit(bills) {
    const map = new Map();
    bills.forEach((bill) => {
      const date = new Date(bill.bill_date);
      const key = date.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + admin.getBillProfit(bill));
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  function renderProfitChart(bills) {
    const canvas = document.getElementById('profitTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const data = getDailyProfit(bills);
    const labels = data.map(([key]) => key.slice(5));
    const values = data.map(([, value]) => value);

    try {
      new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Profit',
            data: values,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,81,0.15)',
            fill: true,
            tension: 0.3,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              ticks: { callback: (value) => '₹' + value }
            }
          }
        }
      });
    } catch (error) {
      console.error('Profit chart failed to render:', error);
    }
  }

  function buildSummaryStats(bills) {
    const totalRevenue = admin.getTotalRevenue(bills);
    const totalCost = bills.reduce((sum, bill) => sum + Number(bill.cost_total || admin.getBillItemsArray(bill).reduce((itemSum, item) => itemSum + Number(item.cost_amount || 0), 0)), 0);
    const totalProfit = admin.getTotalProfit(bills);
    const totalOrders = bills.length;
    const totalItems = bills.reduce((sum, bill) => sum + admin.getItemsTotalQty(bill), 0);
    const average = totalOrders ? totalRevenue / totalOrders : 0;

    summaryGrid.innerHTML = `
      <div class="metric-box">
        <div class="small-label">Total revenue</div>
        <div class="metric-value">${admin.money(totalRevenue)}</div>
      </div>
      <div class="metric-box">
        <div class="small-label">Invested cost</div>
        <div class="metric-value">${admin.money(totalCost)}</div>
      </div>
      <div class="metric-box">
        <div class="small-label">Profit</div>
        <div class="metric-value">${admin.money(totalProfit)}</div>
      </div>
      <div class="metric-box">
        <div class="small-label">Average bill</div>
        <div class="metric-value">${admin.money(average)}</div>
      </div>
      <div class="metric-box">
        <div class="small-label">Items sold</div>
        <div class="metric-value">${totalItems}</div>
      </div>
      <div class="metric-box">
        <div class="small-label">Orders</div>
        <div class="metric-value">${totalOrders}</div>
      </div>
    `;

    if (profitSummaryText) {
      profitSummaryText.innerHTML = `
        <div class="metric-box">
          <div class="small-label">Gross sales</div>
          <div class="metric-value">${admin.money(totalRevenue)}</div>
        </div>
        <div class="metric-box">
          <div class="small-label">Cost value</div>
          <div class="metric-value">${admin.money(totalCost)}</div>
        </div>
        <div class="metric-box">
          <div class="small-label">Profit</div>
          <div class="metric-value">${admin.money(totalProfit)}</div>
        </div>
      `;
    }

    if (profitInsightText) {
      const marginPercent = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;
      profitInsightText.innerHTML = `
        <div class="metric-box">
          <div class="small-label">Net margin</div>
          <div class="metric-value">${marginPercent.toFixed(1)}%</div>
        </div>
        <div class="metric-box">
          <div class="small-label">Avg profit / bill</div>
          <div class="metric-value">${admin.money(totalOrders ? totalProfit / totalOrders : 0)}</div>
        </div>
      `;
    }
  }

  async function renderDashboard() {
    const session = await admin.requireAuth();
    if (!session) return;

    try {
      const bills = await admin.fetchBills();
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const weekStart = admin.getPeriodStart('week').start;
      const monthStart = admin.getPeriodStart('month').start;
      const yearStart = admin.getPeriodStart('year').start;

      const todayBills = bills.filter((bill) => new Date(bill.bill_date) >= todayStart);
      const weekBills = bills.filter((bill) => new Date(bill.bill_date) >= weekStart);
      const monthBills = bills.filter((bill) => new Date(bill.bill_date) >= monthStart);
      const yearBills = bills.filter((bill) => new Date(bill.bill_date) >= yearStart);

      const todayRevenue = admin.getTotalRevenue(todayBills);
      const weekRevenue = admin.getTotalRevenue(weekBills);
      const monthRevenue = admin.getTotalRevenue(monthBills);
      const yearRevenue = admin.getTotalRevenue(yearBills);

      const bestBill = bills.reduce((max, current) => {
        const currentTotal = Number(current.grand_total || 0);
        return currentTotal > Number(max.grand_total || 0) ? current : max;
      }, bills[0] || { grand_total: 0 });

      const heroTodayValue = document.getElementById('heroTodayValue');
      const heroOrdersValue = document.getElementById('heroOrdersValue');
      const heroTopValue = document.getElementById('heroTopValue');

      if (heroTodayValue) heroTodayValue.textContent = admin.money(todayRevenue);
      if (heroOrdersValue) heroOrdersValue.textContent = String(todayBills.length || 0);
      if (heroTopValue) heroTopValue.textContent = admin.money(Number(bestBill.grand_total || 0));

      statsGrid.innerHTML = `
        ${createStatCard('Bills Today', todayBills.length, '')}
        ${createStatCard('Sales Today', admin.money(todayRevenue), '')}
        ${createStatCard('Bills This Week', weekBills.length, '')}
        ${createStatCard('Sales This Week', admin.money(weekRevenue), '')}
        ${createStatCard('Bills This Month', monthBills.length, '')}
        ${createStatCard('Sales This Month', admin.money(monthRevenue), '')}
        ${createStatCard('Bills This Year', yearBills.length, '')}
        ${createStatCard('Sales This Year', admin.money(yearRevenue), '')}
      `;

      recentBillsContainer.innerHTML = buildRecentBills(bills);
      paymentSummary.innerHTML = buildPaymentSummary(bills);
      renderPaymentSummaryChart(bills);
      topOrdersContainer.innerHTML = buildTopOrders(bills);
      topProductsContainer.innerHTML = buildTopProducts(bills);
      categorySummary.innerHTML = buildCategorySummary(bills);
      buildSummaryStats(bills);
      renderProfitChart(bills);
    } catch (error) {
      statsGrid.innerHTML = `<div class="empty-state">Unable to load dashboard: ${error.message || error}</div>`;
    }
  }

  logoutBtn.addEventListener('click', async () => {
    const { sb } = admin;
    await sb.auth.signOut();
    window.location.href = 'billing.html';
  });

  admin.requireAuth().then(() => renderDashboard());
})();
