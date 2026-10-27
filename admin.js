    const PRODUCTS = [
  // BISLERI
  { id: "Bisleri 20L Can", name: "Bisleri 20L Can" },
  { id: "Bisleri 10L Can", name: "Bisleri 10L Can" },
  { id: "Bisleri 5L Bottle", name: "Bisleri 5L Bottle" },
  { id: "Bisleri 2L Bottle", name: "Bisleri 2L Bottle" },
  { id: "Bisleri 1L Bottle", name: "Bisleri 1L Bottle" },

  // BAILLEY
  { id: "Bailley 10L Can", name: "Bailley 10L Can" },
  { id: "Bailley 5L Can", name: "Bailley 5L Can" },
  { id: "Bailley 2L Bottle", name: "Bailley 2L Bottle" },
  { id: "Bailley 1L Bottle", name: "Bailley 1L Bottle" },

  // KINLEY
  { id: "Kinley 2L Bottle", name: "Kinley 2L Bottle" },
  { id: "Kinley 1L Bottle", name: "Kinley 1L Bottle" },

  // ACCESSORIES
  { id: "Manual Water Dispenser Hand Pump", name: "Hand Pump Dispenser" },
  { id: "Automatic Electric Water Dispenser Pump", name: "Electric Water Pump" }
];

// Availability is shared through Cloudflare D1. The password stays in memory only.
let adminPassword = "";
let stockState = {};
let savingStock = false;
let loadingStock = false;
let loginPending = false;

function stockMessage(text) {
  let element = document.getElementById('liveStockStatus');
  if (!element) {
    element = document.createElement('p');
    element.id = 'liveStockStatus';
    element.setAttribute('role', 'status');
    document.getElementById('productGridContainer').before(element);
  }
  element.textContent = text;
}

async function stockApi(path, method = 'GET', data) {
  const headers = {};
  if (method !== 'GET') headers.Authorization = `Bearer ${adminPassword}`;
  if (data) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method, headers, cache: 'no-store',
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) logoutAdmin();
    throw new Error(result.error || 'Request failed. Please try again.');
  }
  return result;
}

document.addEventListener('DOMContentLoaded', () => {
  hideDashboard();
  // Existing order records are local; dispatcher health is not monitored here.
  const dispatcher = document.getElementById('telegramStatus');
  if (dispatcher) dispatcher.textContent = 'Not monitored';
});

async function verifyPassword() {
  if (loginPending) return;
  loginPending = true;
  const input = document.getElementById('adminPasswordInput');
  const error = document.getElementById('authError');
  error.style.display = 'none';
  adminPassword = input.value;
  try {
    await stockApi('/api/admin/login', 'POST');
    input.value = '';
    await showDashboard();
  } catch (problem) {
    adminPassword = '';
    error.textContent = problem.message;
    error.style.display = 'block';
  } finally { loginPending = false; }
}

function logoutAdmin() {
  adminPassword = '';
  hideDashboard();
}

async function showDashboard() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'block';
  loadLogs();
  await refreshAdminStock();
}

function hideDashboard() {
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('adminDashboard').style.display = 'none';
  document.getElementById('authError').style.display = 'none';
}

async function refreshAdminStock() {
  if (savingStock || loadingStock || !adminPassword) return;
  loadingStock = true;
  try {
    const data = await stockApi('/api/stock');
    if (!data.stock || PRODUCTS.some(p => typeof data.stock[p.id] !== 'boolean')) {
      throw new Error('Unexpected stock response. Check worker.js.');
    }
    stockState = data.stock;
    renderProductControls();
    stockMessage('Connected — stock is shared across devices.');
  } catch (problem) {
    document.getElementById('productGridContainer').replaceChildren();
    stockMessage('Cannot load live stock. Retrying automatically. ' + problem.message);
  } finally { loadingStock = false; }
}

function renderProductControls() {
  const container = document.getElementById('productGridContainer');
  container.replaceChildren();
  PRODUCTS.forEach(product => {
    const available = stockState[product.id] === true;
    const card = document.createElement('div');
    card.className = 'product-card';
    const information = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'product-title';
    title.textContent = product.name;
    const badge = document.createElement('div');
    badge.className = 'status-badge ' + (available ? 'in-stock' : 'out-of-stock');
    badge.textContent = available ? 'IN STOCK' : 'OUT OF STOCK';
    const button = document.createElement('button');
    button.className = 'toggle-btn ' + (available ? 'btn-out' : 'btn-in');
    button.textContent = available ? 'Set Out of Stock' : 'Set In Stock';
    button.disabled = savingStock;
    button.onclick = () => toggleProductStock(product.id, !available);
    information.append(title, badge);
    card.append(information, button);
    container.append(card);
  });
}

async function toggleProductStock(productId, available) {
  if (savingStock || loadingStock || !adminPassword) return;
  savingStock = true;
  renderProductControls();
  stockMessage('Saving…');
  try {
    await stockApi('/api/stock', 'PUT', { id: productId, available });
    stockState[productId] = available;
    stockMessage('Saved — customer pages update within 10 seconds.');
  } catch (problem) {
    stockMessage('Could not confirm the change. ' + problem.message);
  } finally {
    savingStock = false;
    renderProductControls();
  }
}

setInterval(() => {
  if (adminPassword && !document.hidden) refreshAdminStock();
}, 10000);
window.addEventListener('focus', refreshAdminStock);

    /* Load Order Logs */
    function loadLogs() {
      let orders = [];
      try { const saved = JSON.parse(localStorage.getItem('waterOrders')); if (Array.isArray(saved)) orders = saved.filter(order => order && typeof order === 'object'); } catch {}
      const tbody = document.getElementById('logsTableBody');
      const emptyMsg = document.getElementById('emptyLogMsg');
      const countDisplay = document.getElementById('totalOrdersCount');

      countDisplay.textContent = orders.length;
      tbody.innerHTML = '';

      if (orders.length === 0) {
        emptyMsg.style.display = 'block';
        return;
      }

      emptyMsg.style.display = 'none';

      orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(order.time || 'N/A')}</td>
          <td>${escapeHtml(order.name || 'N/A')}</td>
          <td>${escapeHtml(order.phone || 'N/A')}</td>
          <td>${escapeHtml(order.item || '20L Can')} (${escapeHtml(order.quantity || 1)})</td>
          <td>${escapeHtml(order.address || 'N/A')}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    function clearLogs() {
      if (confirm("Are you sure you want to clear local submission records?")) {
        localStorage.removeItem('waterOrders');
        loadLogs();
      }
    }

    function escapeHtml(text) {
      return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
