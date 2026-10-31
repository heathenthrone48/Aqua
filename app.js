    const STORAGE_KEY_USER = 'neer_bekuuu_user_info';
    const STORAGE_KEY_LAST_ORDER = 'neer_bekuuu_last_order';

    let activeModalCardRef = null;

    function openProductModal(clickableEl) {
      const card = clickableEl.closest('.water-card');
      activeModalCardRef = card;

      const name = card.dataset.name;
      const price = card.dataset.price;
      const badge = card.querySelector('.badge-type').innerText;
      const title = card.querySelector('.water-title').innerText;
      const desc = card.querySelector('.water-desc').textContent.trim();
      const img = card.querySelector('.product-image-slide img')?.src || '';

      document.getElementById('modalBadge').innerText = badge;
      document.getElementById('modalTitle').innerText = title;
      document.getElementById('modalSubtitle').innerText = desc;
      document.getElementById('modalPrice').innerHTML = `₹${price} <span style="font-size:.75rem;color:var(--text-muted);font-weight:600;">/ unit</span>`;
      document.getElementById('modalImg').src = img;
      document.getElementById('modalQtyVal').innerText = card.querySelector('.card-qty-value').innerText || '1';

      const featuresBox = document.getElementById('modalBoxFeatures');
      const hygieneBox = document.getElementById('modalBoxHygiene');
      
      if (card.dataset.category === 'accessories') {
        featuresBox.innerText = "High-efficiency ergonomic water dispenser attachment designed for seamless compatibility with standard 20L bubble top jars. Durable food-grade material.";
        hygieneBox.innerHTML = "<li>Wipe nozzle clean before first use.</li><li>Do not submerge electronic parts in water.</li><li>Charge via USB for ~3-4 hours before continuous use.</li>";
      } else {
        featuresBox.innerText = "Rigorous multi-stage Reverse Osmosis (RO) and UV purification treatment. Carefully balanced essential minerals offer a fresh and clean taste.";
        hygieneBox.innerHTML = "<li>Store in a cool, dry place away from direct sunlight.</li><li>Keep the seal intact until ready for dispenser attachment or drinking.</li><li>Ensure dispenser nozzle is clean prior to installation.</li>";
      }

      document.getElementById('productModalBackdrop').classList.add('active');
      applyLiveStock();
    }

    function closeProductModal(e) {
      if (e.target.id === 'productModalBackdrop') {
        closeProductModalDirect();
      }
    }

    function closeProductModalDirect() {
      document.getElementById('productModalBackdrop').classList.remove('active');
    }

    function changeModalQty(change) {
      const qtyEl = document.getElementById('modalQtyVal');
      const current = parseInt(qtyEl.innerText, 10) || 1;
      const updated = Math.min(99, Math.max(1, current + change));
      qtyEl.innerText = updated;

      if (activeModalCardRef) {
        activeModalCardRef.querySelector('.card-qty-value').innerText = updated;
      }
    }

    function addModalItemToCart() {
      if (activeModalCardRef) {
        const addBtn = activeModalCardRef.querySelector('.add-cart-btn');
        addToCart(addBtn);
        closeProductModalDirect();
      }
    }

    function filterCategory(category, buttonEl) {
      document.querySelectorAll('.category-tab').forEach(tab => tab.classList.remove('active'));
      buttonEl.classList.add('active');
      document.querySelectorAll('.category-tab').forEach(tab => tab.setAttribute('aria-pressed', String(tab === buttonEl)));

      document.querySelectorAll('.water-card').forEach(card => {
        if (category === 'all' || card.dataset.category === category) {
          card.classList.remove('is-hidden');
        } else {
          card.classList.add('is-hidden');
        }
      });
    }

    let heroTimer = null;

    function initHeroCarousel() {
      const carousel = document.getElementById('heroCarousel');
      const images = JSON.parse(carousel.dataset.images || '[]');
      const track = carousel.querySelector('.hero-carousel-track');
      const dots = carousel.querySelector('.hero-carousel-dots');

      if (!images.length) return;

      track.innerHTML = images.map((src, index) => `
        <div class="hero-carousel-slide">
          <img src="${escapeHtml(src)}"
               alt="NEER BEKUUU Banner ${index + 1}"
               loading="${index === 0 ? 'eager' : 'lazy'}"
               onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=&quot;display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-weight:700;&quot;>Banner image ${index + 1}</div>';">
        </div>
      `).join('');

      dots.innerHTML = images.map((_, index) => `
        <button type="button"
                class="hero-carousel-dot${index === 0 ? ' active' : ''}"
                aria-label="Go to banner ${index + 1}"
                onclick="goToHeroSlide(${index})"></button>
      `).join('');

      carousel.dataset.index = '0';
      startHeroAutoPlay();

      carousel.addEventListener('mouseenter', stopHeroAutoPlay);
      carousel.addEventListener('mouseleave', startHeroAutoPlay);
      carousel.addEventListener('touchstart', stopHeroAutoPlay, { passive: true });
      carousel.addEventListener('touchend', startHeroAutoPlay, { passive: true });
    }

    function renderHeroSlide(newIndex) {
      const carousel = document.getElementById('heroCarousel');
      const images = JSON.parse(carousel.dataset.images || '[]');
      if (!images.length) return;

      const index = (newIndex + images.length) % images.length;
      carousel.dataset.index = String(index);

      const track = carousel.querySelector('.hero-carousel-track');
      track.style.transform = `translateX(-${index * 100}%)`;

      carousel.querySelectorAll('.hero-carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });
    }

    function changeHeroSlide(direction) {
      const carousel = document.getElementById('heroCarousel');
      const index = parseInt(carousel.dataset.index || '0', 10);
      renderHeroSlide(index + direction);
      resetHeroAutoPlay();
    }

    function goToHeroSlide(index) {
      renderHeroSlide(index);
      resetHeroAutoPlay();
    }

    function startHeroAutoPlay() {
      stopHeroAutoPlay();
      heroTimer = setInterval(() => {
        const carousel = document.getElementById('heroCarousel');
        const index = parseInt(carousel.dataset.index || '0', 10);
        renderHeroSlide(index + 1);
      }, 4000);
    }

    function stopHeroAutoPlay() {
      if (heroTimer) clearInterval(heroTimer);
    }

    function resetHeroAutoPlay() {
      startHeroAutoPlay();
    }

    const productTimers = new Map();

    function initProductCarousels() {
      document.querySelectorAll('.product-image-carousel').forEach(carousel => {
        const images = JSON.parse(carousel.dataset.images || '[]');
        const track = carousel.querySelector('.product-image-track');
        const dots = carousel.querySelector('.product-carousel-dots');
        const count = carousel.querySelector('.product-image-count');
        const prev = carousel.querySelector('.product-carousel-arrow.prev');
        const next = carousel.querySelector('.product-carousel-arrow.next');

        if (!images.length) {
          track.innerHTML = `
            <div class="product-image-slide">
              <div style="color:var(--text-muted);font-size:.8rem;">Add product images</div>
            </div>`;
          prev.classList.add('is-hidden');
          next.classList.add('is-hidden');
          count.textContent = '0 photos';
          return;
        }

        track.innerHTML = images.map((src, index) => `
          <div class="product-image-slide">
            <img src="${escapeHtml(src)}"
                 alt="Product image ${index + 1}"
                 loading="${index === 0 ? 'eager' : 'lazy'}"
                 onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=&quot;color:var(--text-muted);font-size:.78rem;padding:20px;text-align:center;&quot;>Image unavailable</div>';">
          </div>
        `).join('');

        dots.innerHTML = images.map((_, index) => `
          <button type="button"
                  class="product-carousel-dot${index === 0 ? ' active' : ''}"
                  aria-label="Go to image ${index + 1}"
                  onclick="event.stopPropagation(); goToProductImage(this, ${index})"></button>
        `).join('');

        count.textContent = `${images.length} ${images.length === 1 ? 'photo' : 'photos'}`;
        carousel.dataset.index = '0';

        if (images.length <= 1) {
          prev.classList.add('is-hidden');
          next.classList.add('is-hidden');
          dots.style.display = 'none';
        } else {
          startProductAutoPlay(carousel);

          carousel.addEventListener('mouseenter', () => stopProductAutoPlay(carousel));
          carousel.addEventListener('mouseleave', () => startProductAutoPlay(carousel));
          carousel.addEventListener('touchstart', () => stopProductAutoPlay(carousel), { passive: true });
          carousel.addEventListener('touchend', () => startProductAutoPlay(carousel), { passive: true });
        }
      });
    }

    function getCarouselData(carousel) {
      const images = JSON.parse(carousel.dataset.images || '[]');
      const index = parseInt(carousel.dataset.index || '0', 10) || 0;
      return { images, index };
    }

    function renderCarousel(carousel, newIndex) {
      const { images } = getCarouselData(carousel);
      if (!images.length) return;

      const index = (newIndex + images.length) % images.length;
      carousel.dataset.index = String(index);

      const track = carousel.querySelector('.product-image-track');
      track.style.transform = `translateX(-${index * 100}%)`;

      carousel.querySelectorAll('.product-carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });
    }

    function changeProductImage(button, direction) {
      const carousel = button.closest('.product-image-carousel');
      const { images, index } = getCarouselData(carousel);
      if (images.length <= 1) return;
      renderCarousel(carousel, index + direction);
      resetProductAutoPlay(carousel);
    }

    function goToProductImage(button, index) {
      const carousel = button.closest('.product-image-carousel');
      renderCarousel(carousel, index);
      resetProductAutoPlay(carousel);
    }

    function startProductAutoPlay(carousel) {
      stopProductAutoPlay(carousel);
      const timer = setInterval(() => {
        const { images, index } = getCarouselData(carousel);
        if (images.length > 1) {
          renderCarousel(carousel, index + 1);
        }
      }, 3500);
      productTimers.set(carousel, timer);
    }

    function stopProductAutoPlay(carousel) {
      if (productTimers.has(carousel)) {
        clearInterval(productTimers.get(carousel));
        productTimers.delete(carousel);
      }
    }

    function resetProductAutoPlay(carousel) {
      startProductAutoPlay(carousel);
    }

    const CART_STORAGE_KEY = 'neerbeku_cart_v1';
    const catalog = window.NEER_CATALOG;
    function normalizeCart(value) {
      const clean = {};
      if (!value || typeof value !== 'object') return clean;
      for (const [name, item] of Object.entries(value)) {
        if (!Object.hasOwn(catalog, name) || !item) continue;
        const qty = Number(item.qty);
        if (!Number.isInteger(qty) || qty < 1) continue;
        clean[name] = { ...catalog[name], qty: Math.min(99, qty) };
      }
      return clean;
    }
    function readCart() {
      try { return normalizeCart(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '{}')); }
      catch { return {}; }
    }
    let cart = readCart();
    function persistCart() {
      try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); }
      catch { alert('Your browser could not save the cart. Please enable site storage before opening checkout.'); }
    }
    function changeCartQty(name, change) {
      if (!cart[name] || orderSubmitting) return;
      const qty = cart[name].qty + change;
      if (qty <= 0) { removeFromCart(name); return; }
      cart[name].qty = Math.min(99, qty);
      renderCart();
    }

    function changeCardQty(button, change) {
      const controls = button.closest('.card-qty-controls');
      const valueEl = controls.querySelector('.card-qty-value');
      const current = parseInt(valueEl.textContent, 10) || 1;
      valueEl.textContent = Math.min(99, Math.max(1, current + change));
    }

    function addToCart(button) {
      const card = button.closest('.water-card');
      const name = card.dataset.name;
      if (!stockReady || liveStock[name] !== true) {
        alert('This product is currently unavailable.');
        return;
      }
      const price = parseFloat(card.dataset.price);
      const qty = parseInt(card.querySelector('.card-qty-value').textContent, 10) || 1;

      if (cart[name]) {
        cart[name].qty = Math.min(99, cart[name].qty + qty);
      } else {
        cart[name] = { ...catalog[name], qty };
      }

      button.classList.add('added');
      button.innerText = '✓ ADDED TO CART';
      card.classList.add('in-cart');

      setTimeout(() => {
        button.classList.remove('added');
        applyLiveStock();
      }, 900);

      renderCart();
    }

    function removeFromCart(name) {
      delete cart[name];
      const card = [...document.querySelectorAll('.water-card')]
        .find(el => el.dataset.name === name);

      if (card) {
        card.classList.remove('in-cart');
      }

      renderCart();
    }

    function renderCart(save = true) {
      cart = normalizeCart(cart);
      if (save) persistCart();
      const items = Object.values(cart);
      const count = items.reduce((n, item) => n + item.qty, 0);
      const total = items.reduce((n, item) => n + item.qty * item.price, 0);
      const money = value => '₹' + value.toFixed(2);
      document.querySelectorAll('[data-cart-count], #cart-count').forEach(el => el.textContent = count);
      document.querySelectorAll('[data-cart-total], #cart-total, #total-display').forEach(el => el.textContent = money(total));
      const totalInput = document.getElementById('input-total-bill');
      if (totalInput) totalInput.value = money(total);
      const itemsInput = document.getElementById('cart-items-input');
      if (itemsInput) itemsInput.value = items.map(i => `${i.name} x ${i.qty} (${money(i.price * i.qty)})`).join(' | ');
      const list = document.getElementById('cart-items');
      if (list) {
        list.innerHTML = items.length ? items.map(item => `
          <article class="checkout-item">
            <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
            <div class="checkout-item-info"><h3>${escapeHtml(item.name)}</h3><p>${money(item.price)} each</p>
            <div class="checkout-qty"><button type="button" data-cart-action="minus" data-product="${escapeHtml(item.name)}" aria-label="Decrease ${escapeHtml(item.name)} quantity">−</button><span>${item.qty}</span><button type="button" data-cart-action="plus" data-product="${escapeHtml(item.name)}" aria-label="Increase ${escapeHtml(item.name)} quantity">+</button></div>
            <button type="button" class="checkout-remove" data-cart-action="remove" data-product="${escapeHtml(item.name)}">Remove</button>
            </div><strong class="checkout-line-total">${money(item.price * item.qty)}</strong>
          </article>`).join('') : '<div class="cart-empty"><h3>Your cart is empty</h3><p>Add some water or accessories to get started.</p><a href="index.html" class="view-cart-button">Browse products →</a></div>';
      }
      const submit = document.getElementById('submit-order-btn');
      if (submit) submit.disabled = !items.length || orderSubmitting;
      document.querySelectorAll('.water-card').forEach(card => card.classList.toggle('in-cart', !!cart[card.dataset.name]));
    }
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-cart-action]');
      if (!button || orderSubmitting) return;
      const name = button.dataset.product;
      if (button.dataset.cartAction === 'remove') removeFromCart(name);
      else changeCartQty(name, button.dataset.cartAction === 'plus' ? 1 : -1);
    });
    window.addEventListener('storage', event => {
      if (event.key === CART_STORAGE_KEY && !orderSubmitting) { cart = readCart(); renderCart(false); }
    });
    window.addEventListener('pageshow', () => { if (!orderSubmitting) { cart = readCart(); renderCart(false); } });

    function loadSavedCustomerData() {
      try {
        const savedUser = localStorage.getItem(STORAGE_KEY_USER);
        if (savedUser) {
          const user = JSON.parse(savedUser);
          if (user.name && document.getElementById('customer-name')) document.getElementById('customer-name').value = user.name;
          if (user.phone && document.getElementById('customer-phone')) document.getElementById('customer-phone').value = user.phone;
          if (user.address && document.getElementById('customer-address')) document.getElementById('customer-address').value = user.address;
          if (user.notes && document.getElementById('landmark-notes')) document.getElementById('landmark-notes').value = user.notes;
        }

        const savedOrder = localStorage.getItem(STORAGE_KEY_LAST_ORDER);
        if (savedOrder && savedUser && document.getElementById('reorder-banner')) {
          const user = JSON.parse(savedUser);
          const lastOrder = JSON.parse(savedOrder);
          
          if (lastOrder.cart && Object.keys(lastOrder.cart).length > 0) {
            document.getElementById('reorder-user-name').innerText = user.name || 'Customer';
            
            const itemListStr = Object.values(lastOrder.cart)
              .map(i => `${i.qty}× ${i.name}`)
              .join(', ');

            document.getElementById('reorder-summary').innerText = `Last Order: ${itemListStr} (${lastOrder.bill || '₹0.00'})`;
            document.getElementById('reorder-banner').classList.remove('hidden');
          }
        }
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }
    }

    function saveCustomerData(userInfo, lastCart, billStr) {
      try {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userInfo));
        localStorage.setItem(STORAGE_KEY_LAST_ORDER, JSON.stringify({
          cart: lastCart,
          bill: billStr,
          timestamp: new Date().toISOString()
        }));
      } catch (e) {
        console.warn('Failed to save to localStorage:', e);
      }
    }

    async function executeQuickReorder() {
      if (!(await refreshLiveStock())) {
        alert('Cannot check stock right now. Please try again.');
        return;
      }
      try {
        const savedOrder = localStorage.getItem(STORAGE_KEY_LAST_ORDER);
        if (!savedOrder) return;
        
        const lastOrder = JSON.parse(savedOrder);
        if (lastOrder.cart) {
          cart = normalizeCart(lastOrder.cart);
          const unavailable = Object.keys(cart).filter(name => liveStock[name] !== true);
          unavailable.forEach(name => delete cart[name]);
          if (unavailable.length) alert('Unavailable items were excluded: ' + unavailable.join(', '));
          
          document.querySelectorAll('.water-card').forEach(card => {
            const name = card.dataset.name;
            if (cart[name]) {
              card.classList.add('in-cart');
            } else {
              card.classList.remove('in-cart');
            }
          });

          renderCart();
          window.location.href = 'cart.html';
        }
      } catch (e) {
        console.error('Quick reorder failed:', e);
      }
    }

    if (document.getElementById('heroCarousel')) initHeroCarousel();
    initProductCarousels();

    // Match the rendered media height to its actual width on narrow screens.
    function syncMobileImageSquares() {
      const mobile = window.matchMedia('(max-width: 620px)').matches;
      document.querySelectorAll('.water-card .product-image-carousel').forEach(carousel => {
        carousel.style.height = mobile ? `${carousel.getBoundingClientRect().width}px` : '';
      });
    }
    syncMobileImageSquares();
    window.addEventListener('resize', syncMobileImageSquares);
    if (window.ResizeObserver && document.querySelector('.water-grid')) {
      new ResizeObserver(syncMobileImageSquares).observe(document.querySelector('.water-grid'));
    }

    loadSavedCustomerData();

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[char]));
    }

    function generateMemorableOrderId() {
      const words = ['AQUA', 'BLUE', 'PURE', 'FLOW', 'DROP', 'SPLASH', 'WAVE', 'RIVER', 'CLEAR'];
      const randomWord = words[Math.floor(Math.random() * words.length)];
      const randomNumber = Math.floor(1000 + Math.random() * 9000);
      return `NEER-${randomWord}-${randomNumber}`;
    }

        function renderConfirmation(order) {
      const rows = order.items.map(item => {
        const row = document.createElement('div');
        row.className = 'confirm-item';
        const label = document.createElement('span');
        label.textContent = `${item.name} × ${item.qty}`;
        const amount = document.createElement('span');
        amount.textContent = `₹${(item.price * item.qty).toFixed(2)}`;
        row.append(label, amount);
        return row;
      });
      document.getElementById('confirm-items').replaceChildren(...rows);
      document.getElementById('confirm-total').textContent = order.total;
      document.getElementById('confirm-time').textContent = order.time;
      document.getElementById('confirm-address').textContent = order.address;
      document.getElementById('confirm-contact').textContent = `${order.name}, ${order.phone}`;
    }

    let orderSubmitting = false;
    const form = document.getElementById('waterForm');
    form?.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (orderSubmitting) return;
      orderSubmitting = true;
      const checkingButton = form.querySelector('.submit-btn');
      checkingButton.disabled = true;
      checkingButton.innerText = 'CHECKING STOCK...';
      try {
        if (!(await refreshLiveStock())) {
          alert('Cannot check stock right now. Please try again.');
          return;
        }
        const unavailable = Object.keys(cart).filter(name => liveStock[name] !== true);
        if (unavailable.length) {
          unavailable.forEach(removeFromCart);
          alert('These items are out of stock and were removed: ' + unavailable.join(', ') + '. Please review your cart.');
          return;
        }

      if (Object.keys(cart).length === 0) {
        alert('Please add at least one product to your cart.');
        return;
      }

      const submitBtn = form.querySelector('.submit-btn');
      submitBtn.innerText = 'SENDING ORDER...';
      submitBtn.disabled = true;

      const orderRef = generateMemorableOrderId();
      const CLOUDFLARE_WORKER_URL = "https://water-order-sms.ashinsobharaj1.workers.dev/";

      const customerName = document.getElementById('customer-name').value;
      const customerPhone = document.getElementById('customer-phone').value;
      
      if (window.syncDeliveryAddress) {
        window.syncDeliveryAddress();
      }

      const customerAddress = document.getElementById('customer-address').value.trim();
      const latitude = document.getElementById('delivery-latitude').value || null;
      const longitude = document.getElementById('delivery-longitude').value || null;
      const addressSource = document.getElementById('delivery-address-source').value;

      if (!customerAddress) {
        alert('Please choose or enter your delivery address.');
        return;
      }

      const landmarkNotes = document.getElementById('landmark-notes').value || 'None';
      const totalBill = document.getElementById('input-total-bill').value;

      const payload = {
        orderId: orderRef,
        name: customerName,
        phone: customerPhone,
        address: customerAddress,
        notes: landmarkNotes,
        cart: document.getElementById('cart-items-input').value,
        qty: document.getElementById('cart-count').textContent,
        bill: totalBill,
        time: document.getElementById('preferred-time').value,
        latitude: latitude,
        longitude: longitude,
        addressSource: addressSource
      };

      try {
        const response = await fetch(CLOUDFLARE_WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
          saveCustomerData({
            name: customerName,
            phone: customerPhone,
            address: customerAddress,
            notes: landmarkNotes
          }, cart, totalBill);

          document.getElementById('order-ref-code').innerText = orderRef;
          
          renderConfirmation({
            items: Object.values(cart),
            total: totalBill,
            time: document.getElementById('preferred-time').selectedOptions[0].textContent,
            name: customerName,
            phone: customerPhone,
            address: customerAddress
          });

          document.getElementById('order-screen').classList.add('hidden');
          document.getElementById('thankyou-screen').classList.remove('hidden');
          cart = {};
          persistCart();
          renderCart(false);
          window.scrollTo(0, 0);
        } else {
          alert("Order dispatch failed: " + JSON.stringify(result.details || result));
          submitBtn.innerText = 'PLACE ORDER (PAY ON DELIVERY)';
          submitBtn.disabled = false;
        }
      } catch (error) {
        console.error("Error:", error);
        alert("Network error. Please try again or call directly.");
        submitBtn.innerText = 'PLACE ORDER (PAY ON DELIVERY)';
        submitBtn.disabled = false;
      }
      } finally {
        orderSubmitting = false;
        checkingButton.disabled = Object.keys(cart).length === 0;
        checkingButton.innerText = 'PLACE ORDER (PAY ON DELIVERY)';
      }
    });

// Shared stock from the existing /api/stock Worker endpoint.
let liveStock = {};
let stockReady = false;
let stockRequest = null;

function applyLiveStock() {
  document.querySelectorAll('.water-card').forEach(card => {
    const available = stockReady && liveStock[card.dataset.name] === true;
    const button = card.querySelector('.add-cart-btn');
    button.disabled = !available;
    button.style.opacity = available ? '' : '0.6';
    button.style.cursor = available ? '' : 'not-allowed';
    button.textContent = !stockReady ? 'CHECKING STOCK…' : available ? 'ADD TO CART' : 'OUT OF STOCK';
  });
  if (activeModalCardRef) {
    const button = document.getElementById('modalAddToCartBtn');
    button.disabled = !stockReady || liveStock[activeModalCardRef.dataset.name] !== true;
    button.textContent = !stockReady ? 'CHECKING STOCK…' : button.disabled ? 'OUT OF STOCK' : 'ADD TO CART';
  }
}

function refreshLiveStock() {
  if (stockRequest) return stockRequest;
  stockRequest = (async () => {
    try {
      const response = await fetch('/api/stock', {
        cache: 'no-store', signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const cards = Object.keys(catalog).map(name => ({ dataset: { name } }));
      if (!data.stock || cards.some(card => typeof data.stock[card.dataset.name] !== 'boolean')) {
        throw new Error('Unexpected stock response');
      }
      liveStock = data.stock;
      stockReady = true;
      stockNotice.textContent = 'Availability updates automatically.';
      return true;
    } catch {
      stockReady = false;
      stockNotice.textContent = 'Cannot check availability. Reconnecting…';
      return false;
    } finally { applyLiveStock(); }
  })().finally(() => { stockRequest = null; });
  return stockRequest;
}

const stockNotice = document.createElement('p');
stockNotice.setAttribute('role', 'status');
stockNotice.textContent = 'Checking availability…';
(document.querySelector('.water-grid') || document.querySelector('.cart-panel')).before(stockNotice);
applyLiveStock();
refreshLiveStock();
setInterval(() => { if (!document.hidden) refreshLiveStock(); }, 10000);
window.addEventListener('focus', refreshLiveStock);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshLiveStock();
});

// Size the sticky category bar against the actual responsive header.
const siteHeader = document.querySelector('header');
function syncHeaderHeight() {
  document.documentElement.style.setProperty('--shop-header-height', siteHeader.getBoundingClientRect().height + 'px');
}
syncHeaderHeight();
if (window.ResizeObserver) new ResizeObserver(syncHeaderHeight).observe(siteHeader);
window.addEventListener('resize', syncHeaderHeight);
renderCart(false);
if (document.body.classList.contains('cart-page') && !['neerbeku.com', 'www.neerbeku.com'].includes(location.hostname)) {
  document.getElementById('cart-feedback').textContent = 'Test checkout — orders will not be sent from this address.';
}
