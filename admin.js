const PRODUCTS = [
{id:"Bisleri 20L Can",name:"Bisleri 20L Can"},
{id:"Bisleri 1L Case",name:"Bisleri 1L Case"},
{id:"Bailey 1L Case",name:"Bailey 1L Case"},
{id:"Kinley 1L Case",name:"Kinley 1L Case"},
{id:"Bisleri 2L Case",name:"Bisleri 2L Case"},
{id:"Bailey 2L Case",name:"Bailey 2L Case"},
{id:"Kinley 2L Case",name:"Kinley 2L Case"},
{id:"Bisleri 500ml Case",name:"Bisleri 500ml Case"},
{id:"Bisleri 10L Can",name:"Bisleri 10L Can"},
{id:"Bailey 10L Can",name:"Bailey 10L Can"},
{id:"Bisleri 5L Bottle",name:"Bisleri 5L Bottle"},
{id:"Bailey 5L Can",name:"Bailey 5L Can"},
{id:"Manual Water Dispenser Hand Pump",name:"Manual Water Dispenser Hand Pump"},
{id:"Automatic Electric Water Dispenser Pump",name:"Automatic Electric Water Dispenser Pump"}
];

// Availability is shared through Cloudflare D1. The password stays in memory only.
let adminPassword = "";
let stockState = {};
let savingStock = false;
let loadingStock = false;
let priceState = {};
let savingPriceId = "";
let loginPending = false;
let orderOffset = 0;
let orderTotal = 0;
const ORDER_PAGE_SIZE = 50;
let orderSearchTimer = null;

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
  if (method !== 'GET' || path.startsWith('/api/admin/')) headers.Authorization = `Bearer ${adminPassword}`;
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
  try { await refreshAdminCatalog(); } catch (e) { document.getElementById('priceStatus').textContent = e.message; }
  await Promise.all([refreshAdminStock(), refreshAdminPrices()]);
}

function hideDashboard() {
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('adminDashboard').style.display = 'none';
  document.getElementById('authError').style.display = 'none';
}


async function refreshAdminCatalog() {
 const data = await stockApi('/api/admin/products');
 (data.products || []).forEach(p => { if (!PRODUCTS.some(x => x.id === p.id)) PRODUCTS.push({id:p.id,name:p.name}); });
}
async function refreshAdminPrices() {
  const status = document.getElementById('priceStatus');
  const body = document.getElementById('priceTableBody');
  try {
    const data = await stockApi('/api/prices');
    if (!data.prices) {
      throw new Error('Unexpected price response. Check the Worker and D1 migration.');
    }
    priceState = data.prices;
    renderPriceTable();
    status.textContent = 'Connected — prices are shared across devices.';
  } catch (problem) {
    body.replaceChildren();
    status.textContent = 'Cannot load prices. Apply product-prices-schema.sql to the staging D1 database, then refresh. ' + problem.message;
  }
}

function renderPriceTable() {
  const body = document.getElementById('priceTableBody');
  body.replaceChildren();
  PRODUCTS.forEach(product => {
    const price = priceState[product.id];
    if (!price) return;
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = product.name;
    const sellingCell = document.createElement('td');
    const sellingInput = document.createElement('input');
    sellingInput.type = 'number';
    sellingInput.min = '0';
    sellingInput.max = '1000000';
    sellingInput.step = '0.01';
    sellingInput.className = 'price-input';
    sellingInput.setAttribute('aria-label', product.name + ' selling price');
    sellingInput.value = Number(price.sellingPrice).toFixed(2);
    const mrpCell = document.createElement('td');
    const mrpInput = document.createElement('input');
    mrpInput.type = 'number';
    mrpInput.min = '0';
    mrpInput.max = '1000000';
    mrpInput.step = '0.01';
    mrpInput.className = 'price-input';
    mrpInput.setAttribute('aria-label', product.name + ' MRP');
    mrpInput.value = Number(price.mrp).toFixed(2);
    sellingCell.append(sellingInput);
    mrpCell.append(mrpInput);
    const actionCell = document.createElement('td');
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn price-save-btn';
    save.textContent = 'Save';
    save.disabled = Boolean(savingPriceId);
    save.onclick = () => saveProductPrice(product.id, sellingInput, mrpInput, save);
    actionCell.append(save);
    row.append(name, sellingCell, mrpCell, actionCell);
    body.append(row);
  });
}

async function saveProductPrice(id, sellingInput, mrpInput, button) {
  if (!adminPassword || savingPriceId) return;
  const sellingPrice = Number(sellingInput.value);
  const mrp = Number(mrpInput.value);
  if (!sellingInput.value.trim() || !mrpInput.value.trim() ||
      !Number.isFinite(sellingPrice) || !Number.isFinite(mrp) ||
      sellingPrice < 0 || mrp < 0 || sellingPrice > 1000000 || mrp > 1000000) {
    document.getElementById('priceStatus').textContent = 'Enter valid non-negative prices for both fields.';
    return;
  }
  savingPriceId = id;
  button.disabled = true;
  button.textContent = 'Saving…';
  document.getElementById('priceStatus').textContent = 'Saving price…';
  try {
    await stockApi('/api/prices', 'PUT', { id, sellingPrice, mrp });
    const data = await stockApi('/api/prices');
    const saved = data.prices?.[id];
    if (!saved || Number(saved.sellingPrice) !== Math.round(sellingPrice * 100) / 100 ||
        Number(saved.mrp) !== Math.round(mrp * 100) / 100) {
      throw new Error('Price read-back did not match. Reload prices and try again.');
    }
    priceState = data.prices;
    document.getElementById('priceStatus').textContent = 'Saved. Storefront and cart will use the new prices on their next refresh.';
  } catch (problem) {
    document.getElementById('priceStatus').textContent = 'Could not save price. ' + problem.message;
  } finally {
    savingPriceId = '';
    renderPriceTable();
  }
}

async function refreshAdminStock() {
  if (savingStock || loadingStock || !adminPassword) return;
  loadingStock = true;
  try {
    const data = await stockApi('/api/stock');
    if (!data.stock) {
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

    /* Durable order history loaded from the connected D1 database. */
    async function loadLogs(reset = true) {
      const tbody = document.getElementById('logsTableBody');
      const emptyMsg = document.getElementById('emptyLogMsg');
      const status = document.getElementById('orderHistoryStatus');
      const countDisplay = document.getElementById('totalOrdersCount');
      const resultCount = document.getElementById('orderResultCount');
      const loadMore = document.getElementById('loadMoreOrders');
      if (!tbody || !adminPassword) return;
      if (reset) {
        orderOffset = 0;
        orderTotal = 0;
        tbody.replaceChildren();
      }
      status.textContent = 'Loading saved orders…';
      loadMore.disabled = true;

      const params = new URLSearchParams({ limit: String(ORDER_PAGE_SIZE), offset: String(orderOffset) });
      const query = document.getElementById('orderSearch').value.trim();
      const fromValue = document.getElementById('orderDateFrom').value;
      const toValue = document.getElementById('orderDateTo').value;
      if (query) params.set('q', query);
      const dateBoundary = (value, nextDay = false) => {
        const [year, month, day] = value.split('-').map(Number);
        return Math.floor(new Date(year, month - 1, day + (nextDay ? 1 : 0)).getTime() / 1000);
      };
      if (fromValue) params.set('from', String(dateBoundary(fromValue)));
      if (toValue) params.set('to', String(dateBoundary(toValue, true)));

      try {
        const data = await stockApi('/api/admin/orders?' + params.toString());
        orderTotal = Number(data.total) || 0;
        (data.orders || []).forEach(order => {
          const items = Array.isArray(order.items) && order.items.length
            ? order.items.map(item => `${item.name} × ${item.quantity}`).join(', ')
            : '—';
          const created = Number(order.createdAt);
          const dateLabel = Number.isFinite(created)
            ? new Date(created * 1000).toLocaleString()
            : '—';
          const telegramLabel = order.telegramStatus === 'sent' ? 'Sent' :
            order.telegramStatus === 'failed' ? 'Failed' : 'Pending';
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${escapeHtml(dateLabel)}</td>
            <td>${escapeHtml(order.orderId || '—')}</td>
            <td>${escapeHtml(order.name || '—')}</td>
            <td>${escapeHtml(order.phone || '—')}</td>
            <td>${escapeHtml(items)}</td>
            <td>${escapeHtml('₹' + Number(order.totalAmount || 0).toFixed(2))}</td>
            <td>${escapeHtml(order.address || '—')}</td>
            <td>${escapeHtml(order.deliveryWindow || '—')}</td>
            <td><span class="telegram-order-status telegram-${escapeHtml(order.telegramStatus || 'pending')}">${escapeHtml(telegramLabel)}</span></td>
          `;
          tbody.appendChild(row);
        });
        orderOffset += (data.orders || []).length;
        countDisplay.textContent = String(orderTotal);
        resultCount.textContent = orderTotal
          ? `Showing ${Math.min(orderOffset, orderTotal)} of ${orderTotal} matching orders`
          : '0 matching orders';
        emptyMsg.style.display = orderOffset ? 'none' : 'block';
        status.textContent = 'Connected — order records are saved in this environment’s D1 database.';
        loadMore.hidden = orderOffset >= orderTotal;
      } catch (problem) {
        status.textContent = 'Could not load saved orders. Apply migrations/0005_orders.sql to this environment’s D1 database, then refresh. ' + problem.message;
        if (reset) emptyMsg.style.display = 'none';
        loadMore.hidden = true;
      } finally {
        loadMore.disabled = false;
      }
    }

    document.getElementById('orderSearch')?.addEventListener('input', () => {
      clearTimeout(orderSearchTimer);
      orderSearchTimer = setTimeout(() => loadLogs(true), 250);
    });
    document.getElementById('orderDateFrom')?.addEventListener('change', () => loadLogs(true));
    document.getElementById('orderDateTo')?.addEventListener('change', () => loadLogs(true));
    document.getElementById('resetOrderFilters')?.addEventListener('click', () => {
      document.getElementById('orderSearch').value = '';
      document.getElementById('orderDateFrom').value = '';
      document.getElementById('orderDateTo').value = '';
      loadLogs(true);
    });
    document.getElementById('loadMoreOrders')?.addEventListener('click', () => loadLogs(false));

    function escapeHtml(text) {
      return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

document.addEventListener('DOMContentLoaded', () => {
 const form=document.getElementById('addProductForm'); if(!form)return;
 form.addEventListener('submit',event=>{
  event.preventDefault(); if(!adminPassword)return;
  const status=document.getElementById('addProductStatus'),button=document.getElementById('addProductSubmit'),file=document.getElementById('newProductImage').files[0];
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024){status.textContent='Choose a PNG, JPG or WebP image no larger than 1 MB.';return;}
  const reader=new FileReader();reader.onerror=()=>status.textContent='Could not read image.';
  reader.onload=async()=>{
   button.disabled=true;button.textContent='Saving…';status.textContent='Adding product…';
   try{
    await stockApi('/api/admin/products','POST',{
     name:document.getElementById('newProductName').value.trim(),brand:document.getElementById('newProductBrand').value.trim(),
     description:document.getElementById('newProductDescription').value.trim(),category:document.getElementById('newProductCategory').value,
     unitLabel:document.getElementById('newProductUnit').value.trim(),sellingPrice:Number(document.getElementById('newProductPrice').value),
     mrp:Number(document.getElementById('newProductMrp').value),caseQty:document.getElementById('newProductCaseQty').value?Number(document.getElementById('newProductCaseQty').value):null,
     imageMime:file.type,imageData:String(reader.result).split(',')[1]||''
    });
    status.textContent='Product added. Refresh the storefront to see it.';form.reset();
    await refreshAdminCatalog();await Promise.all([refreshAdminStock(),refreshAdminPrices()]);
   }catch(e){status.textContent='Could not add product. '+e.message;}
   finally{button.disabled=false;button.textContent='Add product';}
  };reader.readAsDataURL(file);
 });
});
