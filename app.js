const DELIVERY_CENTRE = { latitude: 12.815047, longitude: 77.691037 };
const MAX_DELIVERY_RADIUS_KM = 5.5;
let cachedRoadDistanceKm = null;
let cachedRouteKey = "";
let routeRequest = null;
function getDeliveryCoordinates() {
  const lat = document.getElementById('delivery-latitude')?.value;
  const lon = document.getElementById('delivery-longitude')?.value;
  if (!lat || !lon) return null;
  const latitude = Number(lat), longitude = Number(lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude, key: latitude.toFixed(7) + ',' + longitude.toFixed(7) };
}
async function fetchRoadDistance(force = false) {
  const coordinates = getDeliveryCoordinates();
  if (!coordinates) throw new Error('Please select your delivery location using GPS or the map.');
  if (!force && cachedRouteKey === coordinates.key && cachedRoadDistanceKm !== null) return cachedRoadDistanceKm;
  if (routeRequest) routeRequest.abort();
  routeRequest = new AbortController();
  const response = await fetch('/api/delivery/route', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude }),
    signal: routeRequest.signal, cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok || !Number.isFinite(Number(result.distanceKm))) throw new Error(result.error || 'Road distance could not be calculated.');
  cachedRouteKey = coordinates.key;
  cachedRoadDistanceKm = Number(result.distanceKm);
  return cachedRoadDistanceKm;
}
function getDeliveryFee(distanceKm, subtotal) {
  if (distanceKm == null || distanceKm > MAX_DELIVERY_RADIUS_KM) return 0;
  const band = distanceKm < 1 ? 0 : distanceKm <= 2 ? 1 : distanceKm <= 4 ? 2 : 3;
  const tiers = [
    [{ max: 300, fee: 15 }, { max: Infinity, fee: 0 }],
    [{ max: 200, fee: 25 }, { max: 400, fee: 15 }, { max: 600, fee: 5 }, { max: Infinity, fee: 0 }],
    [{ max: 250, fee: 45 }, { max: 500, fee: 35 }, { max: 750, fee: 25 }, { max: 900, fee: 15 }, { max: Infinity, fee: 0 }],
    [{ max: 400, fee: 55 }, { max: 700, fee: 45 }, { max: 1000, fee: 35 }, { max: 1200, fee: 15 }, { max: Infinity, fee: 0 }]
  ];
  return tiers[band].find(t => subtotal <= t.max).fee;
}
function getHandlingFee(subtotal) {
  if (subtotal <= 200) return 5;
  if (subtotal <= 500) return 7;
  if (subtotal <= 1000) return 8;
  return 10;
}
function calculateOrderTotals(items, distanceKm = cachedRoadDistanceKm) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const handlingFee = items.length ? getHandlingFee(subtotal) : 0;
  const deliveryFee = items.length && distanceKm != null ? getDeliveryFee(distanceKm, subtotal) : 0;
  return { subtotal, deliveryFee, handlingFee, distanceKm, total: subtotal + deliveryFee + handlingFee };
}
document.addEventListener('deliverylocationchange', () => {
  if (typeof renderCart === 'function') renderCart(false);
});

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
      const { subtotal, deliveryFee, handlingFee, total } = calculateOrderTotals(items, cachedRoadDistanceKm);
      const money = value => '₹' + value.toFixed(2);
      document.querySelectorAll('[data-cart-count], #cart-count').forEach(el => el.textContent = count);
      document.querySelectorAll('[data-cart-total], #cart-total, #total-display').forEach(el => el.textContent = money(total));
      const subtotalEl = document.getElementById('items-subtotal');
      const deliveryEl = document.getElementById('delivery-fee');
      if (subtotalEl) subtotalEl.textContent = money(subtotal);
      if (deliveryEl) deliveryEl.textContent = cachedRoadDistanceKm == null ? 'Calculating road distance…' : money(deliveryFee);
       const handlingEl = document.getElementById('handling-fee');
       if (handlingEl) handlingEl.textContent = money(handlingFee);
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
      const breakdown = calculateOrderTotals(order.items, order.distanceKm);
      document.getElementById('confirm-subtotal').textContent = '₹' + breakdown.subtotal.toFixed(2);
      document.getElementById('confirm-delivery-fee').textContent = '₹' + breakdown.deliveryFee.toFixed(2);
       document.getElementById('confirm-handling-fee').textContent = '₹' + breakdown.handlingFee.toFixed(2);
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
      
      const savedAccountAddress = window.getSelectedNeerBekuAddress?.();
      if (savedAccountAddress) {
        document.getElementById('customer-address').value = savedAccountAddress.address;
        document.getElementById('delivery-latitude').value = savedAccountAddress.latitude || '';
        document.getElementById('delivery-longitude').value = savedAccountAddress.longitude || '';
        document.getElementById('delivery-address-source').value = 'saved-account';
        document.getElementById('customer-name').value = savedAccountAddress.name;
        document.getElementById('customer-phone').value = savedAccountAddress.phone;
        document.getElementById('landmark-notes').value = savedAccountAddress.landmark || '';
      } else if (window.syncDeliveryAddress) {
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

      const deliveryWindow = getDeliveryWindow();
      if (!deliveryWindow) return;

      const landmarkNotes = document.getElementById('landmark-notes').value || 'None';
      const requiredAddressFields = ['address-house', 'address-street', 'address-area', 'address-city'];
      if (requiredAddressFields.some(id => !document.getElementById(id)?.value.trim())) {
        alert('Please complete your house/flat, street, area and city details.');
        return;
      }
      let deliveryDistanceKm;
      try {
        deliveryDistanceKm = await fetchRoadDistance(true);
      } catch (error) {
        alert(error.message || 'We could not calculate your road distance. Please select your location again.');
        return;
      }
      if (deliveryDistanceKm > MAX_DELIVERY_RADIUS_KM) {
        alert('Sorry, this address is outside our 5.5 km delivery area. You can browse products, but checkout is not available at this location.');
        return;
      }
      const orderTotals = calculateOrderTotals(Object.values(cart), deliveryDistanceKm);
      const totalBill = '₹' + orderTotals.total.toFixed(2);

      const payload = {
        orderId: orderRef,
        name: customerName,
        phone: customerPhone,
        address: customerAddress,
        notes: `${landmarkNotes} | Items subtotal: ₹${orderTotals.subtotal.toFixed(2)}; Delivery fee: ₹${orderTotals.deliveryFee.toFixed(2)}; Handling fee: ₹${orderTotals.handlingFee.toFixed(2)}`,
        cart: document.getElementById('cart-items-input').value,
        qty: document.getElementById('cart-count').textContent,
        bill: totalBill,
        subtotal: orderTotals.subtotal,
        deliveryFee: orderTotals.deliveryFee,
        handlingFee: orderTotals.handlingFee,
        distanceKm: deliveryDistanceKm,
        time: deliveryWindow,
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
            distanceKm: deliveryDistanceKm,
            total: totalBill,
            time: deliveryWindow,
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
      stockNotice.textContent = '';
      stockNotice.hidden = true;
      return true;
    } catch {
      stockReady = false;
      stockNotice.hidden = false;
      stockNotice.textContent = 'Cannot check availability. Reconnecting…';
      return false;
    } finally { applyLiveStock(); }
  })().finally(() => { stockRequest = null; });
  return stockRequest;
}

const stockNotice = document.createElement('p');
stockNotice.setAttribute('role', 'status');
stockNotice.textContent = '';
stockNotice.hidden = true;
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

// Resolve requested delivery dates in the store's timezone, not the visitor's.
function storeDateParts() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}
function nextStoreDate(date) {
  const next = new Date(date + 'T12:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
function refreshDeliveryChoices() {
  const select = document.getElementById('preferred-time');
  if (!select) return;
  const now = storeDateParts();
  for (const option of select.options) {
    if (option.dataset.day === 'today') option.disabled = now.hour >= Number(option.dataset.end);
  }
  const scheduled = select.value === 'scheduled';
  document.getElementById('scheduled-delivery-fields').hidden = !scheduled;
  for (const id of ['delivery-date', 'scheduled-slot']) {
    const field = document.getElementById(id);
    field.disabled = !scheduled;
    field.required = scheduled;
  }
  document.getElementById('delivery-date').min = nextStoreDate(now.date);
}
function getDeliveryWindow() {
  refreshDeliveryChoices();
  const select = document.getElementById('preferred-time');
  const now = storeDateParts();
  const option = select.selectedOptions[0];
  if (!option || option.disabled) {
    alert('That delivery window has passed. Please choose another window.');
    select.focus();
    return null;
  }
  if (select.value === 'scheduled') {
    const input = document.getElementById('delivery-date');
    if (!input.value || !input.checkValidity() || input.value < input.min) {
      input.reportValidity();
      input.focus();
      return null;
    }
    return `${input.value} - ${document.getElementById('scheduled-slot').value} (IST)`;
  }
  if (option.dataset.day) {
    const date = option.dataset.day === 'today' ? now.date : nextStoreDate(now.date);
    return `${option.textContent} - ${date} (IST)`;
  }
  return option.textContent;
}
if (document.getElementById('preferred-time')) {
  document.getElementById('preferred-time').addEventListener('change', refreshDeliveryChoices);
  window.addEventListener('focus', refreshDeliveryChoices);
  refreshDeliveryChoices();
}


// Google sign-in with NeerBeku-saved delivery addresses. Guest checkout remains available.
(() => {
  const clientId = document.querySelector('meta[name="google-client-id"]')?.content;
  const button = document.getElementById('google-signin-button');
  const status = document.getElementById('google-account-status');
  if (!button || !status) return;

  const signout = document.getElementById('google-signout');
  const accountTitle = document.getElementById('account-card-title');
  const connectedIdentity = document.getElementById('google-connected-identity');
  const connectedUser = document.getElementById('google-connected-user');
  const accountPanel = document.getElementById('account-address-panel');
  const activeAddressEl = document.getElementById('account-active-address');
  const addressListEl = document.getElementById('saved-address-list');
  const chooseAddressButton = document.getElementById('choose-saved-address');
  const addAddressButton = document.getElementById('add-saved-address');
  const entryPanel = document.getElementById('delivery-entry-panel');
  const saveRow = document.getElementById('account-save-address-row');
  const saveButton = document.getElementById('save-address-to-account');
  const cancelButton = document.getElementById('cancel-address-entry');
  const addressMessage = document.getElementById('account-address-message');
  const saveMessage = document.getElementById('save-address-message');
  let addresses = [];
  let selectedAddress = null;
  let accountUser = null;
  let showingAddressList = false;

  const field = id => document.getElementById(id);
  const setText = (element, value) => { if (element) element.textContent = value || ''; };
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function setEntryVisible(visible) {
    if (!entryPanel) return;
    entryPanel.hidden = !visible;
    entryPanel.querySelectorAll('input, select, textarea, button').forEach(control => {
      if (control.id === 'delivery-date' || control.id === 'scheduled-slot') return;
      control.disabled = !visible;
    });
  }

  function showAccountAddress(address) {
    selectedAddress = address || null;
    if (!accountPanel) return;
    accountPanel.hidden = false;
    showingAddressList = false;
    addressListEl.hidden = true;
    chooseAddressButton.textContent = 'Choose another address';
    chooseAddressButton.hidden = addresses.length < 2;
    if (address) {
      activeAddressEl.innerHTML = `<strong class="saved-address-label">${escape(address.label || 'Delivery address')}</strong><span>${escape(address.address)}</span><span>${escape(address.name)} · ${escape(address.phone)}</span>${address.landmark ? `<small>${escape(address.landmark)}</small>` : ''}`;
      setEntryVisible(false);
      saveRow.hidden = true;
      setText(addressMessage, 'This address is selected for your order.');
    } else {
      activeAddressEl.innerHTML = '<strong>No saved delivery address yet</strong><span>Add your details once and NeerBeku can show them here next time.</span>';
      setEntryVisible(true);
      saveRow.hidden = false;
      cancelButton.hidden = addresses.length === 0;
      setText(addressMessage, 'Your details are saved to your NeerBeku account when you choose “Save address”.');
    }
  }

  function populateCheckoutFields(address) {
    if (!address) return;
    field('customer-name').value = address.name || accountUser?.name || '';
    field('customer-phone').value = address.phone || '';
    field('customer-address').value = address.address || '';
    field('delivery-latitude').value = address.latitude || '';
    field('delivery-longitude').value = address.longitude || '';
    field('delivery-address-source').value = 'saved-account';
    field('landmark-notes').value = address.landmark || '';
  }

  function renderAddressChoices() {
    if (!addresses.length) {
      addressListEl.replaceChildren();
      return;
    }
    addressListEl.innerHTML = addresses.map(address => `
      <article class="saved-address-option${selectedAddress?.id === address.id ? ' is-selected' : ''}">
        <div><strong>${escape(address.label || 'Delivery address')}</strong><p>${escape(address.address)}</p><small>${escape(address.name)} · ${escape(address.phone)}</small></div>
        <div class="saved-address-option-actions">
          <button type="button" data-use-address="${escape(address.id)}">${selectedAddress?.id === address.id ? 'Selected' : 'Use this'}</button>
          <button type="button" class="saved-address-delete" data-delete-address="${escape(address.id)}" aria-label="Delete ${escape(address.label || 'address')}">Delete</button>
        </div>
      </article>`).join('');
    addressListEl.querySelectorAll('[data-use-address]').forEach(button => button.addEventListener('click', () => {
      const choose = async () => {
        const chosen = addresses.find(item => item.id === button.dataset.useAddress);
        if (!chosen) return;
        try {
          const response = await fetch('/api/customer/addresses', {
            method: 'PUT', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chosen.id })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Could not select this address.');
          addresses = addresses.map(item => ({ ...item, is_default: item.id === chosen.id }));
          populateCheckoutFields(chosen);
          showAccountAddress(chosen);
          renderAddressChoices();
        } catch (error) { setText(addressMessage, error.message); }
      };
      choose();
    }));
    addressListEl.querySelectorAll('[data-delete-address]').forEach(button => button.addEventListener('click', async () => {
      const address = addresses.find(item => item.id === button.dataset.deleteAddress);
      if (!address || !confirm(`Delete the saved ${address.label || 'delivery'} address?`)) return;
      setText(addressMessage, 'Deleting address…');
      try {
        const response = await fetch(`/api/customer/addresses?id=${encodeURIComponent(address.id)}`, {
          method: 'DELETE', credentials: 'same-origin'
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not delete this address.');
        addresses = result.addresses || [];
        const next = addresses.find(item => item.is_default) || addresses[0] || null;
        if (next) populateCheckoutFields(next);
        showAccountAddress(next);
        renderAddressChoices();
      } catch (error) { setText(addressMessage, error.message); }
    }));
  }

  async function loadAddresses() {
    if (!accountUser) return;
    setText(addressMessage, 'Loading your saved addresses…');
    try {
      const response = await fetch('/api/customer/addresses', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load saved addresses.');
      addresses = Array.isArray(result.addresses) ? result.addresses : [];
      const preferred = addresses.find(item => item.is_default) || addresses[0] || null;
      if (preferred) populateCheckoutFields(preferred);
      showAccountAddress(preferred);
      renderAddressChoices();
    } catch (error) {
      accountPanel.hidden = false;
      setEntryVisible(true);
      saveRow.hidden = true;
      setText(addressMessage, `${error.message} You can still enter an address and check out as a guest.`);
    }
  }

  function openAddressEntry() {
    showAccountAddress(null);
    selectedAddress = null;
    setEntryVisible(true);
    saveRow.hidden = false;
    cancelButton.hidden = addresses.length === 0;
    addressListEl.hidden = true;
    showingAddressList = false;
    setText(saveMessage, '');
    field('customer-name').value ||= accountUser?.name || '';
    field('customer-phone').value = '';
    field('address-house').value = '';
    field('address-street').value = '';
    field('address-area').value = '';
    field('address-city').value = '';
    field('address-postcode').value = '';
    field('landmark-notes').value = '';
    field('customer-address').value = '';
    field('delivery-latitude').value = '';
    field('delivery-longitude').value = '';
    field('account-address-label').value = addresses.length ? '' : 'Home';
    window.switchAddressMode?.('manual');
    entryPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveAddress() {
    if (window.syncDeliveryAddress) window.syncDeliveryAddress();
    const name = field('customer-name').value.trim();
    const phone = field('customer-phone').value.trim();
    const address = field('customer-address').value.trim();
    const label = field('account-address-label').value.trim() || 'Delivery address';
    if (!name || !phone || !address) {
      setText(saveMessage, 'Enter your name, mobile number, and a complete delivery address first.');
      return;
    }
    saveButton.disabled = true;
    setText(saveMessage, 'Saving address…');
    try {
      const response = await fetch('/api/customer/addresses', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label, name, phone, address,
          landmark: field('landmark-notes').value.trim(),
          latitude: field('delivery-latitude').value || null,
          longitude: field('delivery-longitude').value || null,
          isDefault: true
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save this address.');
      addresses = result.addresses || [];
      const saved = addresses.find(item => item.id === result.id) || addresses.find(item => item.is_default) || addresses[0];
      if (saved) populateCheckoutFields(saved);
      showAccountAddress(saved || null);
      renderAddressChoices();
      setText(addressMessage, 'Address saved. It will be available the next time you sign in.');
    } catch (error) {
      setText(saveMessage, error.message || 'Could not save this address.');
    } finally { saveButton.disabled = false; }
  }

  function handleSignedIn(user) {
    accountUser = user;
    button.hidden = true;
    status.hidden = true;
    connectedIdentity.hidden = false;
    setText(connectedUser, `${user.name || 'Customer'}${user.email ? ` · ${user.email}` : ''}`);
    signout.hidden = false;
    setText(accountTitle, 'Your NeerBeku account is connected');
    setText(status, `Signed in as ${user.name}${user.email ? ` (${user.email})` : ''}.`);
    if (user.name && !field('customer-name').value) field('customer-name').value = user.name;
    loadAddresses();
  }

  window.getSelectedNeerBekuAddress = () => selectedAddress;
  chooseAddressButton.addEventListener('click', () => {
    showingAddressList = !showingAddressList;
    addressListEl.hidden = !showingAddressList;
    chooseAddressButton.textContent = showingAddressList ? 'Close address list' : 'Choose another address';
  });
  addAddressButton.addEventListener('click', openAddressEntry);
  saveButton.addEventListener('click', saveAddress);
  cancelButton.addEventListener('click', () => {
    const preferred = addresses.find(item => item.is_default) || addresses[0] || null;
    if (preferred) { populateCheckoutFields(preferred); showAccountAddress(preferred); }
  });

  window.handleGoogleCredential = async response => {
    connectedIdentity.hidden = true;
    status.hidden = false;
    setText(status, 'Signing in…');
    try {
      const result = await fetch('/api/auth/google', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || 'Sign-in failed.');
      handleSignedIn(data.user);
    } catch (error) { setText(status, error.message || 'Could not sign in. Please try again.'); }
  };

  signout.addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
    accountUser = null;
    addresses = [];
    selectedAddress = null;
    accountPanel.hidden = true;
    addressListEl.hidden = true;
    saveRow.hidden = true;
    setEntryVisible(true);
    signout.hidden = true;
    connectedIdentity.hidden = true;
    status.hidden = false;
    button.hidden = false;
    setText(accountTitle, 'Faster checkout next time');
    setText(status, 'Signed out. Guest checkout is still available.');
  });

  fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
    .then(response => response.json())
    .then(data => { if (data.signedIn) handleSignedIn(data.user); })
    .catch(() => {});

  if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
    setText(status, 'Google sign-in is not configured yet. Guest checkout is available.');
    return;
  }
  let attempts = 0;
  let renderedWidth = 0;
  const renderButton = () => {
    if (window.google?.accounts?.id) {
      const availableWidth = button.parentElement?.getBoundingClientRect().width || 360;
      const width = Math.max(200, Math.min(400, Math.floor(availableWidth)));
      if (width === renderedWidth) return;
      renderedWidth = width;
      window.google.accounts.id.initialize({ client_id: clientId, callback: window.handleGoogleCredential });
      window.google.accounts.id.renderButton(button, { theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill', width });
    } else if (++attempts < 30) setTimeout(renderButton, 100);
  };
  renderButton();
  window.addEventListener('resize', renderButton);
})();
