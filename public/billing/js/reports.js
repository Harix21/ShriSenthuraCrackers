(function () {
  const admin = window.SVAdmin;
  const reportPeriod = document.getElementById('reportPeriod');
  const reportFrom = document.getElementById('reportFrom');
  const reportTo = document.getElementById('reportTo');
  const reportSummary = document.getElementById('reportSummary');
  const logoutBtn = document.getElementById('logoutBtn');
  const applyReportBtn = document.getElementById('applyReportBtn');

  let allBills = [];
  let chartInstances = [];

  function destroyCharts() {
    chartInstances.forEach((chart) => chart.destroy());
    chartInstances = [];
  }

  function replaceChart(canvas, config) {
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    const chart = new Chart(canvas, config);
    chartInstances.push(chart);
    return chart;
  }

  function getFilteredBills() {
    let filtered = [...allBills];
    const period = reportPeriod.value;

    if (period !== 'all') {
      const { start, end } = admin.getPeriodStart(period);
      filtered = filtered.filter((bill) => admin.isBillInRange(bill, start, end));
    }

    if (period === 'custom') {
      const from = reportFrom.value ? new Date(`${reportFrom.value}T00:00:00`) : null;
      const to = reportTo.value ? new Date(`${reportTo.value}T23:59:59`) : null;
      if (from) filtered = filtered.filter((bill) => new Date(bill.bill_date) >= from);
      if (to) filtered = filtered.filter((bill) => new Date(bill.bill_date) <= to);
    }

    return filtered;
  }

  function getDailySales(bills) {
    const map = new Map();
    bills.forEach((bill) => {
      const date = new Date(bill.bill_date);
      const key = date.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + admin.getBillProfit(bill));
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  function renderSummary(bills) {
    const totalRevenue = admin.getTotalRevenue(bills);
    const totalCost = bills.reduce((sum, bill) => sum + Number(bill.cost_total || admin.getBillItemsArray(bill).reduce((itemSum, item) => itemSum + Number(item.cost_amount || 0), 0)), 0);
    const totalProfit = admin.getTotalProfit(bills);
    const totalOrders = bills.length;
    const totalQty = bills.reduce((sum, bill) => sum + admin.getItemsTotalQty(bill), 0);
    const avgBill = totalOrders ? totalRevenue / totalOrders : 0;
    const margin = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;

    reportSummary.innerHTML = `
      <div class="metric-box"><div class="small-label">Total Orders</div><div class="metric-value">${totalOrders}</div></div>
      <div class="metric-box"><div class="small-label">Revenue</div><div class="metric-value">${admin.money(totalRevenue)}</div></div>
      <div class="metric-box"><div class="small-label">Cost</div><div class="metric-value">${admin.money(totalCost)}</div></div>
      <div class="metric-box"><div class="small-label">Profit</div><div class="metric-value">${admin.money(totalProfit)}</div></div>
      <div class="metric-box"><div class="small-label">Quantity Sold</div><div class="metric-value">${totalQty}</div></div>
      <div class="metric-box"><div class="small-label">Average Bill</div><div class="metric-value">${admin.money(avgBill)}</div></div>
      <div class="metric-box"><div class="small-label">Net Margin</div><div class="metric-value">${margin.toFixed(1)}%</div></div>
    `;
  }

  function buildChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    };
  }

  function renderDailyChart(bills) {
    const data = getDailySales(bills);
    const labels = data.map(([key]) => key.slice(5));
    const values = data.map(([, value]) => value);

    replaceChart(document.getElementById('dailyChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Profit', data: values, borderColor: '#10b981', backgroundColor: 'rgba(16,185,81,0.18)', tension: 0.25, fill: true, borderWidth: 2 }]
      },
      options: {
        ...buildChartOptions(),
        scales: { y: { ticks: { callback: (value) => '₹' + value } } }
      }
    });
  }

  function renderPaymentChart(bills) {
    const map = new Map();
    bills.forEach((bill) => {
      const key = bill.payment_method || 'Cash';
      map.set(key, (map.get(key) || 0) + Number(bill.grand_total || 0));
    });

    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const fullEntries = entries;
    const chartEntries = entries.slice(0, 5);
    const chart = replaceChart(document.getElementById('paymentChart'), {
      type: 'bar',
      data: {
        labels: chartEntries.map(([name]) => name),
        datasets: [{ label: 'Payment', data: chartEntries.map(([, total]) => total), backgroundColor: ['#f97316','#2563eb','#7c3aed','#f59e0b','#6b7280'] }]
      },
      options: {
        ...buildChartOptions(),
        scales: { y: { ticks: { callback: (value) => '₹' + value } } },
        onClick: () => {
          const canvas = document.getElementById('paymentChart');
          const enabled = canvas.dataset.full === 'true';
          canvas.dataset.full = enabled ? 'false' : 'true';
          renderPaymentChart(bills);
        }
      }
    });
    chart.fullEntries = fullEntries;
    chart.isFull = document.getElementById('paymentChart').dataset.full === 'true';
    
    const fullToggle = document.getElementById('paymentFullToggle');
    if (fullToggle) {
      fullToggle.textContent = document.getElementById('paymentChart').dataset.full === 'true' ? 'View Top 5' : 'View Full Graph';
      fullToggle.style.display = fullEntries.length > 5 ? 'inline-flex' : 'none';
      fullToggle.onclick = () => {
        const canvas = document.getElementById('paymentChart');
        const isFull = canvas.dataset.full === 'true';
        canvas.dataset.full = isFull ? 'false' : 'true';
        renderPaymentChart(bills);
      };
    }
  }

  function renderProductChart(bills) {
    const map = new Map();
    bills.forEach((bill) => {
      admin.getBillItemsArray(bill).forEach((item) => {
        const name = item.name || 'Unknown';
        map.set(name, (map.get(name) || 0) + Number(item.quantity || 0));
      });
    });

    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const fullEntries = entries;
    const chartEntries = entries.slice(0, 5);
    const canvas = document.getElementById('productChart');
    const isFull = canvas.dataset.full === 'true';
    const selectedEntries = isFull ? fullEntries : chartEntries;
    const chart = replaceChart(canvas, {
      type: 'bar',
      data: {
        labels: selectedEntries.map(([name]) => name),
        datasets: [{ label: 'Units Sold', data: selectedEntries.map(([, qty]) => qty), backgroundColor: ['#fdba74','#fb923c','#f97316','#f59e0b','#fbbf24'] }]
      },
      options: {
        ...buildChartOptions(),
        scales: { y: { beginAtZero: true } },
        onClick: () => {
          canvas.dataset.full = canvas.dataset.full === 'true' ? 'false' : 'true';
          renderProductChart(bills);
        }
      }
    });
    const fullToggle = document.getElementById('productFullToggle');
    if (fullToggle) {
      fullToggle.textContent = isFull ? 'View Top 5' : 'View Full Graph';
      fullToggle.style.display = fullEntries.length > 5 ? 'inline-flex' : 'none';
      fullToggle.onclick = () => {
        canvas.dataset.full = canvas.dataset.full === 'true' ? 'false' : 'true';
        renderProductChart(bills);
      };
    }
    return chart;
  }

  function renderCategoryChart(bills) {
    const map = new Map();
    bills.forEach((bill) => {
      admin.getBillItemsArray(bill).forEach((item) => {
        const name = item.category_name || 'Uncategorized';
        map.set(name, (map.get(name) || 0) + Number(item.amount || 0));
      });
    });

    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const fullEntries = entries;
    const chartEntries = entries.slice(0, 5);
    const canvas = document.getElementById('categoryChart');
    const isFull = canvas.dataset.full === 'true';
    const selectedEntries = isFull ? fullEntries : chartEntries;
    const colors = ['#f97316', '#fb923c', '#f59e0b', '#fbbf24', '#fdba74', '#fcd34d', '#f59e0b', '#ea580c'];
    const chart = replaceChart(canvas, {
      type: 'pie',
      data: {
        labels: selectedEntries.map(([name]) => name),
        datasets: [{
          label: 'Category Sales',
          data: selectedEntries.map(([, total]) => total),
          backgroundColor: colors.slice(0, selectedEntries.length),
          borderColor: '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        ...buildChartOptions(),
        plugins: { legend: { position: 'bottom' } },
        onClick: () => {
          canvas.dataset.full = canvas.dataset.full === 'true' ? 'false' : 'true';
          renderCategoryChart(bills);
        }
      }
    });
    const fullToggle = document.getElementById('categoryFullToggle');
    if (fullToggle) {
      fullToggle.textContent = isFull ? 'View Top 5' : 'View Full Graph';
      fullToggle.style.display = fullEntries.length > 5 ? 'inline-flex' : 'none';
      fullToggle.onclick = () => {
        canvas.dataset.full = canvas.dataset.full === 'true' ? 'false' : 'true';
        renderCategoryChart(bills);
      };
    }
    return chart;
  }

  function renderReports() {
    const filtered = getFilteredBills();
    renderSummary(filtered);
    destroyCharts();
    renderDailyChart(filtered);
    renderPaymentChart(filtered);
    renderProductChart(filtered);
    renderCategoryChart(filtered);
  }

  logoutBtn.addEventListener('click', async () => {
    await admin.sb.auth.signOut();
    window.location.href = 'billing.html';
  });

  applyReportBtn.addEventListener('click', renderReports);
  reportPeriod.addEventListener('change', () => {
    const isCustom = reportPeriod.value === 'custom';
    reportFrom.disabled = !isCustom;
    reportTo.disabled = !isCustom;
    renderReports();
  });

  admin.requireAuth().then(async (session) => {
    if (!session) return;
    allBills = await admin.fetchBills();
    reportFrom.disabled = true;
    reportTo.disabled = true;
    renderReports();
  }).catch((error) => {
    document.getElementById('reportSummary').innerHTML = `<div class="empty-state">Unable to load analytics: ${error.message || error}</div>`;
  });
})();
