const DELIVERY_CENTRE = { latitude: 12.815047, longitude: 77.691037 };
const MAX_DELIVERY_RADIUS_KM = 5.5;
let cachedRoadDistanceKm = null;
let cachedRouteKey = "";
let routeRequest = null;
function getDeliveryCoordinates() {
  const lat = document.getElementById('delivery-latitude')?.value;
  const lon = document.getElementById('delivery-longitude')?.value;
  if (lat === undefined || lat === null || lat === '' || lon === undefined || lon === null || lon === '') return null;
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
  const controller = new AbortController();
  routeRequest = controller;
  const response = await fetch('/api/delivery/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude }),
    signal: controller.signal,
    cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok || !Number.isFinite(Number(result.distanceKm))) {
    throw new Error(result.error || 'Road distance could not be calculated.');
  }
  if (routeRequest !== controller) throw new DOMException('Route request superseded', 'AbortError');
  cachedRouteKey = coordinates.key;
  cachedRoadDistanceKm = Number(result.distanceKm);
  return cachedRoadDistanceKm;
}
async function refreshDeliveryQuote() {
  const feeEl = document.getElementById('delivery-fee');
  const submit = document.getElementById('submit-order-btn');
  const coordinates = getDeliveryCoordinates();
  cachedRoadDistanceKm = null;
  cachedRouteKey = '';
  if (routeRequest) routeRequest.abort();
  if (!coordinates) {
    if (feeEl) feeEl.textContent = 'Choose location';
    if (typeof renderCart === 'function') renderCart(false);
    return;
  }
  if (feeEl) feeEl.textContent = 'Calculating road distance…';
  try {
    const distanceKm = await fetchRoadDistance();
    if (getDeliveryCoordinates()?.key !== coordinates.key) return;
    if (distanceKm > MAX_DELIVERY_RADIUS_KM) {
      if (feeEl) feeEl.textContent = 'Outside 5.5 km service area';
      if (submit) submit.disabled = true;
    } else if (feeEl) {
      feeEl.textContent = '₹' + getDeliveryFee(distanceKm, Object.values(cart || {}).reduce((sum, item) => sum + item.price * item.qty, 0)).toFixed(2);
    }
    if (typeof renderCart === 'function') renderCart(false);
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (feeEl) feeEl.textContent = 'Unable to calculate — retry location';
    if (submit) submit.disabled = true;
  }
}
document.addEventListener('deliverylocationchange', refreshDeliveryQuote);

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
const BISLERI_20L_NAME = 'Bisleri 20L Can';
const BISLERI_CONTAINER_DEPOSIT = 150;
const BISLERI_RETURN_STORAGE_KEY = 'neerbeku_bisleri_container_return_v1';
function getBisleriReturnState() {
  const canQty = Number(cart?.[BISLERI_20L_NAME]?.qty || 0);
  try {
    const saved = JSON.parse(localStorage.getItem(BISLERI_RETURN_STORAGE_KEY) || 'null');
    if (!saved || Number(saved.cartQty) !== canQty) return { canQty, returnedContainers: 0, hasAnswer: true };
    return { canQty, returnedContainers: Math.max(0, Math.min(canQty, Number(saved.returnedContainers) || 0)), hasAnswer: true };
  } catch { return { canQty, returnedContainers: 0, hasAnswer: true }; }
}
function setBisleriReturnCount(value) {
  const state = getBisleriReturnState();
  const returned = Math.max(0, Math.min(state.canQty, Math.floor(Number(value) || 0)));
  localStorage.setItem(BISLERI_RETURN_STORAGE_KEY, JSON.stringify({ cartQty: state.canQty, returnedContainers: returned, hasContainer: returned > 0 }));
  renderCart(false);
}
function calculateOrderTotals(items, distanceKm = cachedRoadDistanceKm) {
  const productSubtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const bisleriQty = items.find(item => item.name === BISLERI_20L_NAME)?.qty || 0;
  const returnState = getBisleriReturnState();
  const returnedContainers = bisleriQty ? Math.min(bisleriQty, returnState.returnedContainers) : 0;
  const containerDeposit = bisleriQty * BISLERI_CONTAINER_DEPOSIT;
  const returnCredit = returnedContainers * BISLERI_CONTAINER_DEPOSIT;
  const subtotal = productSubtotal + containerDeposit - returnCredit;
  const handlingFee = items.length ? getHandlingFee(subtotal) : 0;
  const deliveryFee = items.length && distanceKm != null ? getDeliveryFee(distanceKm, subtotal) : 0;
  return { productSubtotal, containerDeposit, returnedContainers, returnCredit, subtotal, deliveryFee, handlingFee, distanceKm, total: subtotal + deliveryFee + handlingFee };
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

    function showQuantityLimitNotice(anchor) {
      if (!anchor || !document.body) return;
      document.querySelectorAll('.quantity-limit-notice').forEach(node => node.remove());
      const notice = document.createElement('div');
      notice.className = 'quantity-limit-notice';
      notice.textContent = 'Maximum 5 quantity per order';
      notice.setAttribute('role', 'alert');
      Object.assign(notice.style, {
        position: 'fixed', zIndex: '10000', maxWidth: '230px',
        padding: '8px 12px', borderRadius: '8px',
        background: '#fff1f2', border: '1px solid #fecdd3',
        color: '#b91c1c', fontSize: '12px', fontWeight: '800',
        lineHeight: '1.35', textAlign: 'center',
        boxShadow: '0 4px 14px rgba(0,0,0,.14)',
        pointerEvents: 'none'
      });
      document.body.appendChild(notice);
      const rect = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - notice.offsetWidth - 8,
        rect.left + rect.width / 2 - notice.offsetWidth / 2));
      let top = rect.bottom + 7;
      if (top + notice.offsetHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - notice.offsetHeight - 7);
      }
      notice.style.left = left + 'px';
      notice.style.top = top + 'px';
      window.setTimeout(() => notice.remove(), 2200);
    }

    function changeModalQty(change) {
      const qtyEl = document.getElementById('modalQtyVal');
      const current = parseInt(qtyEl.innerText, 10) || 1;
      if (change > 0 && current >= 5) {
        showQuantityLimitNotice(qtyEl.closest('.card-qty-controls') || qtyEl);
        return;
      }
      const updated = Math.min(5, Math.max(1, current + change));
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
    async function refreshLivePrices() {
      try {
        const response = await fetch('/api/prices', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.prices) return;
        for (const [name, value] of Object.entries(data.prices)) {
          if (!Object.hasOwn(catalog, name) || !Number.isFinite(Number(value.sellingPrice)) || !Number.isFinite(Number(value.mrp))) continue;
          catalog[name].price = Number(value.sellingPrice);
          catalog[name].mrp = Number(value.mrp);
        }
        document.querySelectorAll('.water-card').forEach(card => {
          const item = catalog[card.dataset.name];
          if (!item) return;
          card.dataset.price = String(item.price);
          card.dataset.mrp = String(item.mrp);
          const block = card.querySelector('.water-price-block');
          if (!block) return;
          const top = block.querySelector('.water-price-top');
          const mrpEl = top?.querySelector('.water-mrp');
          const savingsEl = top?.querySelector('.water-savings');
          const discounted = item.mrp > item.price;
          if (top) top.hidden = !discounted;
          if (mrpEl) mrpEl.textContent = '₹' + item.mrp.toFixed(2);
          if (savingsEl) {
            savingsEl.hidden = !discounted;
            savingsEl.textContent = 'Save ₹' + (item.mrp - item.price).toFixed(2);
          }
          const mainPrice = block.querySelector('.water-price');
          if (mainPrice) {
            const suffix = mainPrice.querySelector('span');
            mainPrice.firstChild.textContent = '₹' + item.price.toFixed(2) + ' ';
            if (suffix) mainPrice.append(suffix);
          }
          const caseMeta = block.querySelector('.water-case-meta');
          if (caseMeta && item.caseQty) caseMeta.textContent = 'Case of ' + item.caseQty + ' · ₹' + (item.price / item.caseQty).toFixed(2) + ' per bottle';
        });
        cart = normalizeCart(cart);
        renderCart(false);
      } catch (error) {
        console.warn('Live product prices could not be refreshed:', error);
      }
    }

    function normalizeCart(value) {
      const clean = {};
      if (!value || typeof value !== 'object') return clean;
      for (const [name, item] of Object.entries(value)) {
        if (!Object.hasOwn(catalog, name) || !item) continue;
        const qty = Number(item.qty);
        if (!Number.isInteger(qty) || qty < 1) continue;
        clean[name] = { ...catalog[name], qty: Math.min(5, qty) };
      }
      return clean;
    }
    function readCart() {
      try { return normalizeCart(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '{}')); }
      catch { return {}; }
    }
    let cart = readCart();
    const CART_NOTICE_CHANGE_KEY = 'neerbeku_cart_notice_change_v1';
    const CART_NOTICE_LAST_SHOWN_KEY = 'neerbeku_cart_notice_last_shown_v1';
    const CART_NOTICE_COUNT_KEY = 'neerbeku_cart_notice_count_v1';

    function markCartChangedForNotice() {
      try {
        // localStorage survives the navigation from the storefront to cart.html
        // and also works when the cart is opened in another same-origin tab.
        localStorage.setItem(CART_NOTICE_CHANGE_KEY, String(Date.now()) + ':' + String(Math.random()));
      } catch (error) {
        console.warn('Could not save cart notice state.', error);
      }
    }

    function maybeShowCartRequirementsNotice() {
      const notice = document.getElementById('cart-requirements-notice');
      if (!notice) return;
      try {
        const hasItems = Object.keys(readCart()).length > 0;
        if (!hasItems) return;

        // The Bisleri 20L return question must not depend on whether the
        // separate cart-requirements notice was already shown this session.
        const changeToken = localStorage.getItem(CART_NOTICE_CHANGE_KEY);
        const lastShownToken = sessionStorage.getItem(CART_NOTICE_LAST_SHOWN_KEY);
        const shownCount = Number(sessionStorage.getItem(CART_NOTICE_COUNT_KEY) || '0');
        if (!changeToken || changeToken === lastShownToken || shownCount >= 2) return;
        sessionStorage.setItem(CART_NOTICE_LAST_SHOWN_KEY, changeToken);
        sessionStorage.setItem(CART_NOTICE_COUNT_KEY, String(shownCount + 1));
        notice.hidden = false;
        document.body.classList.add('cart-notice-open');
      } catch (error) {
        console.warn('Could not read cart notice session state.', error);
      }
    }

    function closeCartRequirementsNotice() {
      const notice = document.getElementById('cart-requirements-notice');
      if (notice) notice.hidden = true;
      document.body.classList.remove('cart-notice-open');
    }

    window.closeCartRequirementsNotice = closeCartRequirementsNotice;
    maybeShowCartRequirementsNotice();
    function persistCart() {
      try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); }
      catch { alert('Your browser could not save the cart. Please enable site storage before opening checkout.'); }
    }
    function changeCartQty(name, change, button) {
      if (!cart[name] || orderSubmitting) return;
      const qty = cart[name].qty + change;
      if (qty <= 0) { removeFromCart(name); return; }
      if (qty > 5) {
        showQuantityLimitNotice(button || document.querySelector('[data-product="' + CSS.escape(name) + '"]'));
        return;
      }
      cart[name].qty = qty;
      renderCart();
    }

    function changeCardQty(button, change) {
      const controls = button.closest('.card-qty-controls');
      const valueEl = controls.querySelector('.card-qty-value');
      const current = parseInt(valueEl.textContent, 10) || 1;
      if (change > 0 && current >= 5) {
        showQuantityLimitNotice(button);
        return;
      }
      valueEl.textContent = Math.min(5, Math.max(1, current + change));
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

      markCartChangedForNotice();

      const existingQty = cart[name]?.qty || 0;
      if (existingQty + qty > 5) {
        showQuantityLimitNotice(button);
        return;
      }
      if (cart[name]) {
        cart[name].price = price;
        cart[name].qty = existingQty + qty;
      } else {
        cart[name] = { ...catalog[name], price, qty };
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
      const money = value => '₹' + Number(value || 0).toFixed(2);
      const totals = calculateOrderTotals(items, cachedRoadDistanceKm);
      const bisleriQty = items.find(item => item.name === BISLERI_20L_NAME)?.qty || 0;
      const additionalJarDeposit = Math.max(0, totals.containerDeposit - totals.returnCredit);
      document.querySelectorAll('[data-cart-count], #cart-count').forEach(el => el.textContent = count);
      document.querySelectorAll('[data-cart-total], #cart-total').forEach(el => el.textContent = money(totals.total));

      const subtotalEl = document.getElementById('items-subtotal');
      if (subtotalEl) subtotalEl.textContent = money(totals.productSubtotal);
      const returnedEl = document.getElementById('bisleri-return-count-summary');
      if (returnedEl) returnedEl.textContent = totals.returnedContainers + (totals.returnedContainers === 1 ? ' jar' : ' jars');
      const exchangeSection = document.getElementById('checkout-jar-exchange');
      if (exchangeSection) exchangeSection.hidden = bisleriQty === 0;
      const newCansEl = document.getElementById('bisleri-new-cans');
      if (newCansEl) newCansEl.textContent = String(bisleriQty);
      const depositEl = document.getElementById('bisleri-additional-deposit');
      if (depositEl) depositEl.textContent = money(additionalJarDeposit);
      const depositRow = document.getElementById('checkout-deposit-summary-row');
      if (depositRow) depositRow.hidden = bisleriQty === 0;
      const depositValue = document.getElementById('checkout-deposit-value');
      if (depositValue) depositValue.textContent = money(additionalJarDeposit);
      const jarNote = document.getElementById('checkout-jar-note');
      if (jarNote) jarNote.textContent = totals.returnedContainers > 0
        ? 'Please hand over your empty Bisleri 20L jars to our delivery partner during delivery.'
        : 'A refundable ₹150 container deposit applies to each new Bisleri 20L can.';

      const deliveryEl = document.getElementById('delivery-fee');
      if (deliveryEl && cachedRoadDistanceKm !== null) deliveryEl.textContent = cachedRoadDistanceKm > MAX_DELIVERY_RADIUS_KM ? 'Outside 5.5 km service area' : money(totals.deliveryFee);
      else if (deliveryEl && !getDeliveryCoordinates()) deliveryEl.textContent = 'Choose location';
      const handlingEl = document.getElementById('handling-fee');
      if (handlingEl) handlingEl.textContent = money(totals.handlingFee);
      const totalDisplay = document.getElementById('total-display');
      if (totalDisplay) totalDisplay.textContent = money(totals.total);

      const summaryItems = document.getElementById('checkout-summary-items');
      if (summaryItems) summaryItems.innerHTML = items.length
        ? items.map(item => '<div class="checkout-summary-row"><span>' + escapeHtml(item.name) + ' × ' + item.qty + '</span><strong>' + money(item.price * item.qty) + '</strong></div>').join('')
        : '<p class="checkout-summary-empty">Your cart is empty.</p>';

      const totalInput = document.getElementById('input-total-bill');
      if (totalInput) totalInput.value = money(totals.total);
      const itemsInput = document.getElementById('cart-items-input');
      if (itemsInput) itemsInput.value = items.map(item => item.name + ' x ' + item.qty + ' (' + money(item.price * item.qty) + ')').join(' | ');

      const list = document.getElementById('cart-items');
      if (list) {
        const jarState = getBisleriReturnState();
        const jarOptions = Array.from({ length: bisleriQty }, (_, index) => index + 1)
          .map(quantity => '<option value="' + quantity + '"' + (jarState.returnedContainers === quantity ? ' selected' : '') + '>' + quantity + ' empty jar' + (quantity === 1 ? '' : 's') + '</option>').join('');
        const jarExchange = bisleriQty ? (
          '<section class="checkout-exchange-card">' +
            '<div class="checkout-exchange-title">↻ &nbsp;20L CAN EXCHANGE</div>' +
            '<label for="bisleri-return-choice">Do you have empty Bisleri 20L cans to return?</label>' +
            '<select id="bisleri-return-choice" data-bisleri-return-choice>' +
              '<option value="0"' + (jarState.returnedContainers === 0 ? ' selected' : '') + '>No, I don\'t have empty cans</option>' +
              '<option value="1"' + (jarState.returnedContainers > 0 ? ' selected' : '') + '>Yes, I have empty cans to return</option>' +
            '</select>' +
            '<div class="checkout-exchange-quantity"' + (jarState.returnedContainers > 0 ? '' : ' hidden') + '>' +
              '<label for="bisleri-return-count-inline">How many empty cans will you return?</label>' +
              '<select id="bisleri-return-count-inline" data-bisleri-return-count>' + jarOptions + '</select>' +
            '</div>' +
            '<small>₹150 refundable deposit is charged for each new can without an accepted empty-can return.</small>' +
            '<div class="checkout-exchange-credit"><span>Refundable deposit</span><strong>' + money(additionalJarDeposit) + '</strong></div>' +
          '</section>'
        ) : '';
        if (!items.length) {
          list.innerHTML = '<div class="cart-empty"><h3>Your cart is empty</h3><p>Add some water or accessories to get started.</p><a href="index.html" class="view-cart-button">Browse products →</a></div>';
        } else {
          list.innerHTML = items.map(item =>
            '<article class="checkout-item">' +
              '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '">' +
              '<div class="checkout-item-info"><h3>' + escapeHtml(item.name) + '</h3><p>' + money(item.price) + ' per unit</p>' +
                '<div class="checkout-qty"><button type="button" data-cart-action="minus" data-product="' + escapeHtml(item.name) + '" aria-label="Decrease ' + escapeHtml(item.name) + ' quantity">−</button><span>' + item.qty + '</span><button type="button" data-cart-action="plus" data-product="' + escapeHtml(item.name) + '" aria-label="Increase ' + escapeHtml(item.name) + ' quantity">+</button></div>' +
                '<button type="button" class="checkout-remove" data-cart-action="remove" data-product="' + escapeHtml(item.name) + '">Remove</button>' +
              '</div><strong class="checkout-line-total">' + money(item.price * item.qty) + '</strong>' +
            '</article>' + (item.name === BISLERI_20L_NAME ? jarExchange : '')
          ).join('');
        }
      }
      const submit = document.getElementById('submit-order-btn');
      if (submit) submit.disabled = !items.length || orderSubmitting || !getDeliveryCoordinates() || cachedRoadDistanceKm === null || cachedRoadDistanceKm > MAX_DELIVERY_RADIUS_KM;
      document.querySelectorAll('.water-card').forEach(card => card.classList.toggle('in-cart', !!cart[card.dataset.name]));
    }
        document.addEventListener('click', event => {
      const button = event.target.closest('[data-cart-action]');
      if (!button || orderSubmitting) return;
      const name = button.dataset.product;
      if (button.dataset.cartAction === 'remove') removeFromCart(name);
      else changeCartQty(name, button.dataset.cartAction === 'plus' ? 1 : -1, button);
    });
    document.addEventListener('change', event => {
      if (event.target.matches('[data-bisleri-return-choice]')) {
        setBisleriReturnCount(Number(event.target.value) > 0 ? 1 : 0);
      } else if (event.target.matches('[data-bisleri-return-count]')) {
        setBisleriReturnCount(event.target.value);
      }
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

          markCartChangedForNotice();
          renderCart();
          window.location.href = 'cart.html';
        }
      } catch (e) {
        console.error('Quick reorder failed:', e);
      }
    }

    if (document.getElementById('heroCarousel')) initHeroCarousel();
    initProductCarousels();
    refreshLivePrices();

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
      const bisleriQty = order.items.find(item => item.name === BISLERI_20L_NAME)?.qty || 0;
      const returnedContainers = Math.min(bisleriQty, Number(order.bisleriReturnedContainers ?? breakdown.returnedContainers) || 0);
      const additionalJarDeposit = Math.max(0, breakdown.containerDeposit - returnedContainers * BISLERI_CONTAINER_DEPOSIT);
      const additionalCharges = additionalJarDeposit + breakdown.deliveryFee + breakdown.handlingFee;
      document.getElementById('confirm-subtotal').textContent = '₹' + breakdown.productSubtotal.toFixed(2);
      document.getElementById('confirm-new-cans').textContent = String(bisleriQty);
      document.getElementById('confirm-bisleri-returns').textContent = returnedContainers + (returnedContainers === 1 ? ' jar' : ' jars');
      document.getElementById('confirm-additional-deposit').textContent = '₹' + additionalJarDeposit.toFixed(2);
      document.getElementById('confirm-exchange-section').hidden = bisleriQty === 0;
      document.getElementById('confirm-exchange-note').textContent = returnedContainers > 0
        ? 'Please hand over your empty Bisleri 20L jars to our delivery partner during delivery.'
        : 'A refundable ₹150 container deposit applies to each new Bisleri 20L can.';
      document.getElementById('confirm-delivery-fee').textContent = '₹' + breakdown.deliveryFee.toFixed(2);
      document.getElementById('confirm-handling-fee').textContent = '₹' + breakdown.handlingFee.toFixed(2);
      document.getElementById('confirm-additional-charges').textContent = '₹' + additionalCharges.toFixed(2);
      document.getElementById('confirm-total').textContent = order.total;
      document.getElementById('confirm-time').textContent = order.time;
      document.getElementById('confirm-address').textContent = order.address;
      document.getElementById('confirm-contact').textContent = `${order.name}, ${order.phone}`;
    }

    let orderSubmitting = false;
    const form = document.getElementById('waterForm');
    // Indian mobile numbers: accept digits only and cap both fields at 10 digits.
    ['customer-phone', 'customer-alt-phone'].forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\\D/g, '').slice(0, 10);
        if (input.value !== digits) input.value = digits;
      });
    });
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

      const customerName = document.getElementById('customer-name').value.trim();
      const customerPhone = document.getElementById('customer-phone').value.trim();
      const alternatePhone = document.getElementById('customer-alt-phone')?.value.trim() || '';
      const normalizedAlternatePhone = alternatePhone.replace(/\D/g, '');
      if (alternatePhone && normalizedAlternatePhone.length !== 10) {
        alert('Please enter a valid 10-digit alternate mobile number.');
        document.getElementById('customer-alt-phone').focus();
        return;
      }
      if (!customerName) {
        alert('Please enter your name to place the order.');
        document.getElementById('customer-name').focus();
        return;
      }
      if (!/^\\d{10}$/.test(customerPhone)) {\n        alert('Please enter a valid 10-digit mobile number.');\n        document.getElementById('customer-phone').focus();\n        return;\n      }\n      if (!customerPhone) {
        alert('Please enter your mobile number to place the order.');
        document.getElementById('customer-phone').focus();
        return;
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
      // Persist the first checkout's complete details to the signed-in account.
      if (window.saveCurrentNeerBekuAddress && !(await window.saveCurrentNeerBekuAddress())) {
        throw new Error('We could not save your delivery details. Please check them and try again.');
      }

      const orderTotals = calculateOrderTotals(Object.values(cart), deliveryDistanceKm);
      const totalBill = '₹' + orderTotals.total.toFixed(2);

      const payload = {
        orderId: orderRef,
        name: customerName,
        phone: customerPhone,
        alternatePhone: alternatePhone || '',
        address: customerAddress,
        addressDetails: {
          house: document.getElementById('address-house').value.trim(),
          street: document.getElementById('address-street').value.trim(),
          area: document.getElementById('address-area').value.trim(),
          city: document.getElementById('address-city').value.trim(),
          postcode: document.getElementById('address-postcode').value.trim(),
          landmark: landmarkNotes === 'None' ? '' : landmarkNotes
        },
        notes: `${landmarkNotes}${alternatePhone ? ' | Alternate mobile: ' + alternatePhone : ''} | Product subtotal: ₹${orderTotals.productSubtotal.toFixed(2)}; Bisleri 20L container deposit: ₹${orderTotals.containerDeposit.toFixed(2)}; Returned Bisleri containers: ${orderTotals.returnedContainers}; Return credit: ₹${orderTotals.returnCredit.toFixed(2)}; Payable items subtotal: ₹${orderTotals.subtotal.toFixed(2)}; Delivery fee: ₹${orderTotals.deliveryFee.toFixed(2)}; Handling fee: ₹${orderTotals.handlingFee.toFixed(2)}`,
        items: Object.values(cart).map(item => ({
          productId: item.id || item.productId || item.name,
          name: item.name,
          unitPrice: Number(item.price),
          quantity: Number(item.qty),
          lineTotal: Number(item.price) * Number(item.qty)
        })),
        productSubtotal: orderTotals.productSubtotal,
        bisleri20LQuantity: Object.values(cart).find(item => item.name === BISLERI_20L_NAME)?.qty || 0,
        bisleriContainerDeposit: orderTotals.containerDeposit,
        bisleriReturnedContainers: orderTotals.returnedContainers,
        bisleriReturnCredit: orderTotals.returnCredit,
        cart: document.getElementById('cart-items-input').value,
        qty: Number(document.getElementById('cart-count').textContent) || 0,
        bill: totalBill,
        subtotal: orderTotals.subtotal,
        deliveryFee: orderTotals.deliveryFee,
        handlingFee: orderTotals.handlingFee,
        distanceKm: deliveryDistanceKm,
        deliveryWindow: deliveryWindow,
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
  let editingAddressId = null;

  const field = id => document.getElementById(id);
  const setText = (element, value) => { if (element) element.textContent = value || ''; };
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function setEntryVisible(visible) {
    if (!entryPanel) return;
    // Keep the saved fields and map visible during faster checkout; lock fields
    // until the customer chooses to add or change an address.
    entryPanel.hidden = false;
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
    chooseAddressButton.textContent = 'Manage saved addresses';
    chooseAddressButton.hidden = addresses.length === 0;
    addAddressButton.hidden = addresses.length >= 2;
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
    field('address-house').value = address.house || '';
    field('address-street').value = address.street || '';
    field('address-area').value = address.area || '';
    field('address-city').value = address.city || '';
    field('address-postcode').value = address.postcode || '';
    field('delivery-latitude').value = address.latitude ?? '';
    field('delivery-longitude').value = address.longitude ?? '';
    field('delivery-address-source').value = 'saved-account';
    field('landmark-notes').value = address.landmark || '';
    field('account-address-label').value = address.label || 'Home';
    if (address.latitude != null && address.longitude != null) {
      window.restoreDeliveryLocation?.(Number(address.latitude), Number(address.longitude));
    }
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
          <button type="button" data-edit-address="${escape(address.id)}">Edit</button>
          <button type="button" class="saved-address-delete" data-delete-address="${escape(address.id)}" aria-label="Delete ${escape(address.label || 'address')}">Delete</button>
        </div>
      </article>`).join('');
    addressListEl.querySelectorAll('[data-edit-address]').forEach(button => button.addEventListener('click', () => {
      const address = addresses.find(item => item.id === button.dataset.editAddress);
      if (!address) return;
      editingAddressId = address.id;
      selectedAddress = null;
      populateCheckoutFields(address);
      setEntryVisible(true);
      saveRow.hidden = false;
      cancelButton.hidden = false;
      field('account-address-label').value = address.label;
      saveButton.textContent = 'Update saved address';
      addressListEl.hidden = true;
      showingAddressList = false;
      window.switchAddressMode?.('manual');
      entryPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setText(saveMessage, 'Edit the details below and save your changes.');
    }));
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
    editingAddressId = null;
    saveButton.textContent = 'Save address to my account';
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
    const savedLabels = addresses.map(item => item.label);
    field('account-address-label').value = !savedLabels.includes('Home') ? 'Home' : 'Work';
    window.switchAddressMode?.('manual');
    entryPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveAddress() {
    if (window.syncDeliveryAddress) window.syncDeliveryAddress();
    const name = field('customer-name').value.trim();
    const phone = field('customer-phone').value.trim();
    const address = field('customer-address').value.trim();
    const label = field('account-address-label').value.trim();
    const house = field('address-house').value.trim();
    const street = field('address-street').value.trim();
    const area = field('address-area').value.trim();
    const city = field('address-city').value.trim();
    const postcode = field('address-postcode').value.trim();
    const latitude = field('delivery-latitude').value;
    const longitude = field('delivery-longitude').value;
    if (!name || !/^\\d{10}$/.test(phone) || !house || !street || !area || !city || !address || !latitude || !longitude) {
      setText(saveMessage, 'Complete your name, mobile number, house, street, area, city, and select your map location before saving.');
      return;
    }
    saveButton.disabled = true;
    setText(saveMessage, 'Saving address…');
    try {
      const response = await fetch('/api/customer/addresses', {
        method: editingAddressId ? 'PUT' : 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingAddressId ? { action: 'edit', id: editingAddressId } : {}),
          label, name, phone, address,
          house, street, area, city, postcode,
          landmark: field('landmark-notes').value.trim(),
          latitude, longitude,
          isDefault: true
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save this address.');
      if (editingAddressId) {
        const refreshResponse = await fetch('/api/customer/addresses', { credentials: 'same-origin', cache: 'no-store' });
        const refreshed = await refreshResponse.json();
        if (!refreshResponse.ok) throw new Error(refreshed.error || 'Address updated, but the list could not be refreshed.');
        addresses = refreshed.addresses || [];
      } else {
        addresses = result.addresses || [];
      }
      const saved = addresses.find(item => item.id === (editingAddressId || result.id)) || addresses.find(item => item.is_default) || addresses[0];
      editingAddressId = null;
      saveButton.textContent = 'Save address to my account';
      if (saved) populateCheckoutFields(saved);
      showAccountAddress(saved || null);
      renderAddressChoices();
      setText(addressMessage, 'Address saved. It will be available the next time you sign in.');
      return true;
    } catch (error) {
      setText(saveMessage, error.message || 'Could not save this address.');
      return false;
    } finally { saveButton.disabled = false; }
  }

  window.saveCurrentNeerBekuAddress = async () => {
    if (!accountUser || selectedAddress) return true;
    return await saveAddress();
  };

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
