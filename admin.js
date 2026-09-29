    // Set your admin passkey here
    const ADMIN_PASSWORD = "admin";

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

    // Check auth on load
    document.addEventListener('DOMContentLoaded', () => {
      const isAuthenticated = sessionStorage.getItem('adminAuthenticated');
      if (isAuthenticated === 'true') {
        showDashboard();
      } else {
        hideDashboard();
      }
    });

    function verifyPassword() {
      const input = document.getElementById('adminPasswordInput').value;
      if (input === ADMIN_PASSWORD) {
        sessionStorage.setItem('adminAuthenticated', 'true');
        showDashboard();
      } else {
        document.getElementById('authError').style.display = 'block';
        document.getElementById('adminPasswordInput').value = '';
      }
    }

    function logoutAdmin() {
      sessionStorage.removeItem('adminAuthenticated');
      hideDashboard();
    }

    function showDashboard() {
      document.getElementById('authOverlay').style.display = 'none';
      document.getElementById('adminDashboard').style.display = 'block';
      renderProductControls();
      loadLogs();
    }

    function hideDashboard() {
      document.getElementById('authOverlay').style.display = 'flex';
      document.getElementById('adminDashboard').style.display = 'none';
      document.getElementById('authError').style.display = 'none';
    }

    /* Render Product Stock Toggles */
    function renderProductControls() {
      const container = document.getElementById('productGridContainer');
      const stockState = JSON.parse(localStorage.getItem('productStockState')) || {};

      container.innerHTML = '';

      PRODUCTS.forEach(product => {
        const isAvailable = stockState[product.id] !== false;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
          <div>
            <div class="product-title">${escapeHtml(product.name)}</div>
            <div class="status-badge ${isAvailable ? 'in-stock' : 'out-of-stock'}">
              ${isAvailable ? 'IN STOCK' : 'OUT OF STOCK'}
            </div>
          </div>
          <button class="toggle-btn ${isAvailable ? 'btn-out' : 'btn-in'}" 
                  onclick="toggleProductStock('${product.id}')">
            ${isAvailable ? 'Set Out of Stock' : 'Set In Stock'}
          </button>
        `;
        container.appendChild(card);
      });
    }

    /* Toggle individual product stock */
    function toggleProductStock(productId) {
      const stockState = JSON.parse(localStorage.getItem('productStockState')) || {};
      const currentStatus = stockState[productId] !== false;
      
      stockState[productId] = !currentStatus;
      localStorage.setItem('productStockState', JSON.stringify(stockState));
      
      renderProductControls();
    }

    /* Load Order Logs */
    function loadLogs() {
      const orders = JSON.parse(localStorage.getItem('waterOrders')) || [];
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
          <td>${order.time || 'N/A'}</td>
          <td>${escapeHtml(order.name || 'N/A')}</td>
          <td>${escapeHtml(order.phone || 'N/A')}</td>
          <td>${escapeHtml(order.item || '20L Can')} (${order.quantity || 1})</td>
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
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
