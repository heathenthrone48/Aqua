const MAX_DELIVERY_RADIUS_KM = 5.5;
const MAX_PRODUCT_QUANTITY = 15;
let cachedRoadDistanceKm = null;
let cachedRouteResult = null;
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
    body: JSON.stringify({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      productNames: Object.values(cart || {}).map(item => item.name)
    }),
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
  cachedRouteResult = result;
  if (checkoutAddressConfirmed && getDeliveryCoordinates()?.key === coordinates.key) {
    window.updateCheckoutPinPreview?.(coordinates, result);
  }
  return cachedRoadDistanceKm;
}
async function refreshDeliveryQuote() {
  const feeEl = document.getElementById('delivery-fee');
  const coordinates = getDeliveryCoordinates();
  cachedRoadDistanceKm = null;
  cachedRouteKey = '';
  cachedRouteResult = null;
  if (routeRequest) routeRequest.abort();
  if (!coordinates) {
    if (feeEl) feeEl.textContent = 'Choose location';
    if (typeof renderCart === 'function') renderCart(false);
    return;
  }
  if (feeEl) feeEl.textContent = 'Calculating road distance…';
  updateOrderButton();
  try {
    const distanceKm = await fetchRoadDistance();
    if (getDeliveryCoordinates()?.key !== coordinates.key) return;
    if (distanceKm > MAX_DELIVERY_RADIUS_KM || cachedRouteResult?.selectedHub === null) {
      if (feeEl) feeEl.textContent = 'Outside 5.5 km service area';
    } else if (feeEl) {
      feeEl.textContent = formatDeliveryFee(getDeliveryFee(distanceKm, Object.values(cart || {}).reduce((sum, item) => sum + item.price * item.qty, 0)));
    }
    if (typeof renderCart === 'function') renderCart(false);
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (feeEl) feeEl.textContent = 'Unable to calculate — retry location';
    updateOrderButton();
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
function formatDeliveryFee(amount) {
  return amount === 0 ? 'Free delivery' : '₹' + amount.toFixed(2);
}
function getHandlingFee(subtotal) {
  if (subtotal <= 200) return 5;
  if (subtotal <= 500) return 7;
  if (subtotal <= 1000) return 8;
  return 10;
}
const BISLERI_20L_NAME = 'Bisleri 20L Can';
const BISLERI_CONTAINER_DEPOSIT = 150;
const CHECKOUT_JAR_CHOICE_KEY = 'neerbeku_checkout_jar_choice';
let bisleriReturnChoice = null;
let checkoutAddressConfirmed = false;
function getBisleriReturnState() {
  const canQty = Number(cart?.[BISLERI_20L_NAME]?.qty || 0);
  if (bisleriReturnChoice?.cartQty !== canQty) bisleriReturnChoice = null;
  return {
    canQty,
    returnedContainers: bisleriReturnChoice?.count ?? 0,
    hasAnswer: canQty === 0 || bisleriReturnChoice !== null
  };
}
function setBisleriReturnCount(value) {
  const { canQty } = getBisleriReturnState();
  const count = Number(value);
  bisleriReturnChoice = value !== "" && Number.isInteger(count) && count >= 0 && count <= canQty
    ? { cartQty: canQty, count }
    : null;
  renderCart(false);
  document.getElementById("bisleri-return-choice")?.focus();
}
function calculateOrderTotals(items, distanceKm = cachedRoadDistanceKm) {
  const productSubtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const bisleriQty = items.find(item => item.name === BISLERI_20L_NAME)?.qty || 0;
  const returnState = getBisleriReturnState();
  const returnedContainers = bisleriQty ? Math.min(bisleriQty, returnState.returnedContainers) : 0;
  const containerDeposit = bisleriQty * BISLERI_CONTAINER_DEPOSIT;
  const returnCredit = returnedContainers * BISLERI_CONTAINER_DEPOSIT;
  const subtotal = productSubtotal + containerDeposit - returnCredit;
  const handlingFee = items.length ? getHandlingFee(productSubtotal) : 0;
  const deliveryFee = items.length && distanceKm != null ? getDeliveryFee(distanceKm, productSubtotal) : 0;
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
      document.getElementById('modalPrice').innerHTML = `₹${price} <span style="font-size:.75rem;color:var(--text-muted);font-weight:600;">/ unit</span><small style="display:block;color:#087eaf;font-weight:700;margin-top:6px;">Buy 5+ of this product and save ₹${getBulkDiscount(name)} per unit</small>`;
      document.getElementById('modalImg').src = img;
      setProductQuantity(document.getElementById('modalQtyVal'), document.getElementById('modalAddToCartBtn'), Number(card.querySelector('.card-qty-value').textContent));

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
      if (!document.body) return;
      document.querySelectorAll('.quantity-limit-notice').forEach(node => node.remove());

      const notice = document.createElement('div');
      notice.className = 'quantity-limit-notice';
      notice.setAttribute('role', 'dialog');
      notice.setAttribute('aria-live', 'polite');
      Object.assign(notice.style, {
        position: 'fixed', zIndex: '10000', left: '50%', bottom: '24px',
        transform: 'translateX(-50%)', width: 'min( calc(100vw - 32px), 360px )',
        boxSizing: 'border-box', padding: '18px', borderRadius: '14px',
        background: '#ffffff', border: '1px solid #dbe7e3',
        color: '#173b32', fontSize: '14px', lineHeight: '1.45',
        boxShadow: '0 10px 32px rgba(0,0,0,.20)', textAlign: 'left'
      });

      const title = document.createElement('div');
      title.textContent = 'Need a bulk order?';
      Object.assign(title.style, { fontSize: '16px', fontWeight: '800', marginBottom: '6px' });

      const message = document.createElement('p');
      message.textContent = `Online orders are limited to ${MAX_PRODUCT_QUANTITY} units per product. For larger quantities, get in touch with us and we’ll help arrange your order.`;
      Object.assign(message.style, { margin: '0 0 14px', color: '#52645e' });

      const actions = document.createElement('div');
      Object.assign(actions.style, { display: 'flex', alignItems: 'center', gap: '10px' });

      const contact = document.createElement('a');
      contact.href = 'https://wa.me/916364636093?text=' + encodeURIComponent('Hi NEERBEKU, I would like to place a bulk water order. Please confirm availability.');
      contact.target = '_blank';
      contact.rel = 'noopener noreferrer';
      contact.textContent = 'Contact us on WhatsApp';
      Object.assign(contact.style, {
        display: 'inline-block', padding: '10px 13px', borderRadius: '8px',
        background: '#167a52', color: '#ffffff', fontWeight: '800',
        textDecoration: 'none', fontSize: '13px'
      });

      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Close';
      Object.assign(close.style, {
        border: '0', background: 'transparent', color: '#52645e',
        padding: '8px', fontWeight: '700', cursor: 'pointer'
      });
      close.addEventListener('click', () => notice.remove());

      actions.append(contact, close);
      notice.append(title, message, actions);
      document.body.appendChild(notice);
    }

    function setProductQuantity(valueEl, addButton, quantity) {
      const changed = Number(valueEl.textContent) !== quantity;
      valueEl.textContent = quantity;
      if (quantity === 0) addButton.setAttribute('aria-disabled', 'true');
      else addButton.removeAttribute('aria-disabled');
      const card = addButton.closest('.water-card');
      if (card) {
        if (changed) addButton.classList.remove('is-added');
        updateCardAddLabel(card);
      }
    }

    function changeModalQty(change) {
      const qtyEl = document.getElementById('modalQtyVal');
      const current = Number(qtyEl.textContent);
      if (change > 0 && current >= MAX_PRODUCT_QUANTITY) {
        showQuantityLimitNotice(qtyEl.closest('.card-qty-controls') || qtyEl);
        return;
      }
      const updated = Math.max(0, current + change);
      setProductQuantity(qtyEl, document.getElementById('modalAddToCartBtn'), updated);

      if (activeModalCardRef) {
        setProductQuantity(activeModalCardRef.querySelector('.card-qty-value'), activeModalCardRef.querySelector('.add-cart-btn'), updated);
      }
    }

    function addModalItemToCart() {
      if (activeModalCardRef) {
        const addBtn = activeModalCardRef.querySelector('.add-cart-btn');
        if (addBtn.getAttribute('aria-disabled') === 'true') return;
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
               alt="NeerBeku banner ${index + 1}"
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
        const productTitle = carousel.closest('.water-card')?.querySelector('.water-title')?.textContent.trim() || 'Packaged drinking water';
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
                 alt="${escapeHtml(productTitle)} product photo ${index + 1}"
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
          let startTouch = null;
          let swipeTime = -Infinity;
          carousel.addEventListener('touchstart', event => {
            startTouch = event.touches.length === 1 && !event.target.closest('button') ? event.touches[0] : null;
            stopProductAutoPlay(carousel);
          }, { passive: true });
          carousel.addEventListener('touchend', event => {
            const touch = event.changedTouches[0];
            if (startTouch && touch && startTouch.identifier === touch.identifier) {
              const dx = touch.clientX - startTouch.clientX;
              const dy = touch.clientY - startTouch.clientY;
              if (Math.abs(dx) >= 30 && Math.abs(dx) > Math.abs(dy) * 1.3) {
                const { index } = getCarouselData(carousel);
                renderCarousel(carousel, index + (dx < 0 ? 1 : -1));
                swipeTime = performance.now();
              }
            }
            startTouch = null;
            startProductAutoPlay(carousel);
          }, { passive: true });
          carousel.addEventListener('touchcancel', () => {
            startTouch = null;
            startProductAutoPlay(carousel);
          }, { passive: true });
          carousel.addEventListener('click', event => {
            if (performance.now() - swipeTime < 400 && !event.target.closest('button')) {
              event.stopPropagation();
            }
          }, true);
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

    async function loadCustomStorefrontProducts() {
      const grid = document.querySelector('.water-grid');
      if (!grid) return;
      try {
        const response = await fetch('/api/products', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Could not load additional products');
        const data = await response.json();
        for (const product of (Array.isArray(data.products) ? data.products : [])) {
          if (!product?.id || !product.name || Object.hasOwn(catalog, product.name)) continue;
          const item = {
            id: product.id, name: product.name, brand: product.brand || 'NEERBEKU • WATER',
            description: product.description || '', category: product.category || 'water',
            unitLabel: product.unitLabel || '/ unit', price: Number(product.price) || 0,
            mrp: Number(product.mrp) || 0, caseQty: product.caseQty || null,
            image: product.image
          };
          catalog[product.name] = item;
          const card = document.createElement('div');
          card.className = 'water-card';
          card.dataset.category = item.category;
          card.dataset.name = item.name;
          card.dataset.price = String(item.price);
          card.dataset.mrp = String(item.mrp);
          if (item.caseQty) card.dataset.caseQty = String(item.caseQty);
          const imageUrl = item.image || '';
          const title = item.caseQty ? item.name + ' (' + item.caseQty + ' pcs)' : item.name;
          card.innerHTML = `
            <div class="product-clickable-area" onclick="openProductModal(this)">
              <div class="product-image-carousel" data-images='${escapeHtml(JSON.stringify(imageUrl ? [imageUrl] : []))}'>
                <div class="product-image-track"></div>
                <button type="button" class="product-carousel-arrow prev is-hidden" aria-label="Previous image" onclick="event.stopPropagation(); changeProductImage(this, -1)">‹</button>
                <button type="button" class="product-carousel-arrow next is-hidden" aria-label="Next image" onclick="event.stopPropagation(); changeProductImage(this, 1)">›</button>
                <div class="product-carousel-dots"></div><div class="product-image-count"></div>
              </div>
              <span class="badge-type">${escapeHtml(item.brand)}</span>
              <div class="water-title">${escapeHtml(title)}</div>
              <div class="water-desc">${escapeHtml(item.description)}</div>
            </div>
            <div class="water-price-block">
              <div class="water-price-top"><span class="water-mrp">₹${item.mrp.toFixed(2)}</span><span class="water-savings" ${item.mrp > item.price ? '' : 'hidden'}>Save ₹${Math.max(0,item.mrp-item.price).toFixed(2)}</span></div>
              <div class="water-price">₹${item.price.toFixed(2)} <span style="font-size:.75rem;color:var(--text-muted);font-weight:600;">${escapeHtml(item.unitLabel)}</span></div>
              ${item.caseQty ? '<span class="water-case-meta">' + item.caseQty + ' pcs · ₹' + (item.price/item.caseQty).toFixed(2) + ' each</span>' : ''}
            </div>
            <div class="card-bottom">
              <button type="button" class="card-qty-btn" aria-label="Decrease quantity" onclick="changeCardQty(this, -1)">−</button>
              <button type="button" class="add-cart-btn" onclick="addToCart(this)"><span class="card-add-label">Add</span><span class="card-qty-value" aria-live="polite">1</span></button>
              <button type="button" class="card-qty-btn" aria-label="Increase quantity" onclick="changeCardQty(this, 1)">+</button>
            </div>`;
          grid.appendChild(card);
        }
      } catch (error) {
        console.error('Could not load custom products:', error);
      }
    }
    let orderSubmitting = false;
    let lastOrderAttempt = null;
    let priceRefreshInProgress = false;
    async function refreshLivePrices() {
      if (priceRefreshInProgress || orderSubmitting) return;
      priceRefreshInProgress = true;
      try {
        const response = await fetch('/api/prices', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.prices || orderSubmitting) return;
        let pricesChanged = false;
        for (const [name, value] of Object.entries(data.prices)) {
          if (!Object.hasOwn(catalog, name) || !Number.isFinite(Number(value.sellingPrice)) || !Number.isFinite(Number(value.mrp))) continue;
          if (catalog[name].price !== Number(value.sellingPrice) || catalog[name].mrp !== Number(value.mrp)) pricesChanged = true;
          catalog[name].price = Number(value.sellingPrice);
          catalog[name].mrp = Number(value.mrp);
        }
        if (!pricesChanged) return;
        document.querySelectorAll('.water-card').forEach(card => {
          const item = catalog[card.dataset.name];
          if (!item) return;
          card.dataset.price = String(item.price);
          card.dataset.mrp = String(item.mrp);
          const block = card.querySelector('.water-price-block') || card;
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
          if (caseMeta && item.caseQty) caseMeta.textContent = item.caseQty + ' pcs · ₹' + (item.price / item.caseQty).toFixed(2) + ' each';
        });
        cart = normalizeCart(cart);
        renderCart(false);
      } catch (error) {
        console.warn('Live product prices could not be refreshed:', error);
      } finally {
        priceRefreshInProgress = false;
      }
    }

    const BULK_DISCOUNT_PRODUCTS = new Set([
      'Bisleri 20L Can', 'Bisleri 5L Bottle',
      'Bisleri 1L Case', 'Bisleri 2L Case', 'Bisleri 500ml Case',
      'Bailey 10L Can', 'Bailey 5L Can', 'Bailey 1L Case', 'Bailey 2L Case',
      'Kinley 1L Case', 'Kinley 2L Case'
    ]);
    const BULK_DISCOUNT_MIN_QTY = 5;
    const BULK_DISCOUNT_PER_UNIT = 5;
    const BULK_DISCOUNT_BY_PRODUCT = {
      'Bisleri 5L Bottle': 3,
      'Bailey 5L Can': 3
    };
    function getBulkDiscount(name) {
      return BULK_DISCOUNT_BY_PRODUCT[name] ?? BULK_DISCOUNT_PER_UNIT;
    }
    function getCartUnitPrice(name, quantity) {
      const basePrice = Number(catalog[name]?.price || 0);
      return BULK_DISCOUNT_PRODUCTS.has(name) && quantity >= BULK_DISCOUNT_MIN_QTY ? Math.max(0, basePrice - getBulkDiscount(name)) : basePrice;
    }
    function updateBulkPriceNotes() {
      document.querySelectorAll('.water-card').forEach(card => {
        if (!BULK_DISCOUNT_PRODUCTS.has(card.dataset.name)) return;
        if (card.querySelector('.bulk-price-note')) return;
        const note = document.createElement('small');
        note.className = 'bulk-price-note';
        note.textContent = 'Buy 5+ of this product and save ₹' + getBulkDiscount(card.dataset.name) + ' per unit';
        card.querySelector('.water-price-block')?.appendChild(note);
      });
    }
    updateBulkPriceNotes();
    function normalizeCart(value) {
      const clean = {};
      if (!value || typeof value !== 'object') return clean;
      for (const [name, item] of Object.entries(value)) {
        if (!Object.hasOwn(catalog, name) || !item) continue;
        const qty = Number(item.qty);
        if (!Number.isInteger(qty) || qty < 1) continue;
        const safeQty = Math.min(MAX_PRODUCT_QUANTITY, qty);
        clean[name] = { ...catalog[name], price: getCartUnitPrice(name, safeQty), qty: safeQty };
      }
      return clean;
    }
    function readCart() {
      try { return normalizeCart(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '{}')); }
      catch { return {}; }
    }
    let cart = readCart();
    const isDeliveryCheckout = document.body.classList.contains('delivery-checkout-page');
    if (isDeliveryCheckout) {
      try {
        const choice = JSON.parse(sessionStorage.getItem(CHECKOUT_JAR_CHOICE_KEY));
        if (Number.isInteger(choice?.count) && Number.isInteger(choice.cartQty) &&
            choice.count >= 0 && choice.count <= choice.cartQty) bisleriReturnChoice = choice;
      } catch {}
      if (!Object.keys(cart).length || !getBisleriReturnState().hasAnswer) {
        window.location.replace('cart.html#selected-items');
      }
    }

    document.getElementById('continue-to-checkout')?.addEventListener('click', () => {
      if (!Object.keys(cart).length) return;
      if (!getBisleriReturnState().hasAnswer) {
        document.getElementById('bisleri-return-choice')?.reportValidity();
        return;
      }
      try {
        sessionStorage.setItem(CHECKOUT_JAR_CHOICE_KEY, JSON.stringify(bisleriReturnChoice));
      } catch {
        const message = document.getElementById('cart-feedback');
        if (message) message.textContent = 'Please enable site storage to continue to checkout.';
        return;
      }
      window.location.href = 'checkout.html';
    });
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
      if (qty > MAX_PRODUCT_QUANTITY) {
        showQuantityLimitNotice(button || document.querySelector('[data-product="' + CSS.escape(name) + '"]'));
        return;
      }
      cart[name].qty = qty;
      cart[name].price = getCartUnitPrice(name, qty);
      renderCart();
    }

    function changeCardQty(button, change) {
      const controls = button.closest('.card-bottom');
      const valueEl = controls.querySelector('.card-qty-value');
      const current = Number(valueEl.textContent);
      if (change > 0 && current >= MAX_PRODUCT_QUANTITY) {
        showQuantityLimitNotice(button);
        return;
      }
      setProductQuantity(valueEl, controls.querySelector('.add-cart-btn'), Math.max(0, current + change));
    }

    function addToCart(button) {
      if (button.getAttribute('aria-disabled') === 'true') return;
      const card = button.closest('.water-card');
      const name = card.dataset.name;
      if (!stockReady || liveStock[name] !== true) {
        alert('This product is currently unavailable.');
        return;
      }
      const price = parseFloat(card.dataset.price);
      const qty = Number(card.querySelector('.card-qty-value').textContent);
      if (qty === 0) return;

      markCartChangedForNotice();

      const existingQty = cart[name]?.qty || 0;
      if (existingQty + qty > MAX_PRODUCT_QUANTITY) {
        showQuantityLimitNotice(button);
        return;
      }
      if (cart[name]) {
        cart[name].qty = existingQty + qty;
        cart[name].price = getCartUnitPrice(name, cart[name].qty);
      } else {
        cart[name] = { ...catalog[name], price: getCartUnitPrice(name, qty), qty };
      }

      button.classList.add('is-added');
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
      if (deliveryEl && cachedRoadDistanceKm !== null) deliveryEl.textContent = cachedRoadDistanceKm > MAX_DELIVERY_RADIUS_KM ? 'Outside 5.5 km service area' : formatDeliveryFee(totals.deliveryFee);
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
          '<section class="checkout-exchange-card' + (jarState.hasAnswer ? '' : ' needs-review') + '">' +
            '<div class="checkout-exchange-title">20L jar return</div>' +
            '<label for="bisleri-return-choice">How many empty Bisleri 20L jars will you return?</label>' +
            '<select id="bisleri-return-choice" data-bisleri-return-choice required>' +
              '<option value=""' + (jarState.hasAnswer ? '' : ' selected') + '>Choose how many</option>' +
              '<option value="0"' + (jarState.hasAnswer && jarState.returnedContainers === 0 ? ' selected' : '') + '>None</option>' +
              jarOptions +
            '</select>' +
            '<small>&#8377;150 refundable deposit per jar without an accepted empty return.</small>' +
          '</section>'
        ) : '';
        if (!items.length) {
          list.innerHTML = '<div class="cart-empty"><h3>Your cart is empty</h3><p>Add some water or accessories to get started.</p><a href="index.html" class="view-cart-button">Browse products →</a></div>';
        } else {
          list.innerHTML = items.map(item => {
            const regularPrice = Number(catalog[item.name]?.price ?? item.price);
            const hasBulkDeal = BULK_DISCOUNT_PRODUCTS.has(item.name);
            const bulkUnlocked = hasBulkDeal && item.qty >= BULK_DISCOUNT_MIN_QTY;
            const bulkDiscount = hasBulkDeal ? getBulkDiscount(item.name) : 0;
            const bulkPrice = hasBulkDeal ? Math.max(0, regularPrice - bulkDiscount) : regularPrice;
            const bulkMessage = bulkUnlocked
              ? '<div class="cart-bulk-deal cart-bulk-unlocked"><strong>✓ Bulk price unlocked</strong><span><s>' + money(regularPrice) + '</s> <b>' + money(item.price) + ' each</b> · You save ' + money(bulkDiscount) + ' per unit</span></div>'
              : hasBulkDeal
                ? '<div class="cart-bulk-deal cart-bulk-progress"><strong>Buy ' + BULK_DISCOUNT_MIN_QTY + '+ and save ₹' + bulkDiscount + ' per unit</strong><span>Add ' + (BULK_DISCOUNT_MIN_QTY - item.qty) + ' more to unlock <b>' + money(bulkPrice) + ' each</b></span></div>'
                : '';
            return '<article class="checkout-item">' +
              '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '">' +
              '<div class="checkout-item-info"><h3>' + escapeHtml(item.name) + '</h3><p>' + (bulkUnlocked ? '<s style="color:#8797a8;margin-right:6px;">' + money(regularPrice) + '</s><strong style="color:#087eaf;">' + money(item.price) + ' each</strong>' : money(item.price) + ' each') + '</p>' +
                bulkMessage +
                '<strong class="checkout-line-total">' + money(item.price * item.qty) + '</strong>' +
                '<div class="checkout-item-actions"><div class="checkout-qty"><button type="button" data-cart-action="minus" data-product="' + escapeHtml(item.name) + '" aria-label="Decrease ' + escapeHtml(item.name) + ' quantity">−</button><span>' + item.qty + '</span><button type="button" data-cart-action="plus" data-product="' + escapeHtml(item.name) + '" aria-label="Increase ' + escapeHtml(item.name) + ' quantity">+</button></div>' +
                '<button type="button" class="checkout-remove" data-cart-action="remove" data-product="' + escapeHtml(item.name) + '">Remove</button></div>' +
              '</div>' +
            '</article>' + (item.name === BISLERI_20L_NAME ? jarExchange : '');
          }).join('');
        }
      }
      const basketSummary = document.getElementById('basket-summary');
      if (basketSummary) basketSummary.hidden = !items.length;
      updateOrderButton();
      document.querySelectorAll('.water-card').forEach(card => {
        card.classList.toggle('in-cart', !!cart[card.dataset.name]);
        updateCardAddLabel(card);
      });
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
        setBisleriReturnCount(event.target.value);
      }
    });
    window.addEventListener('storage', event => {
      if (event.key === CART_STORAGE_KEY && !orderSubmitting) { cart = readCart(); renderCart(false); }
    });
    window.addEventListener('pageshow', event => {
      if (event.persisted && !isDeliveryCheckout) bisleriReturnChoice = null;
      if (!orderSubmitting) { cart = readCart(); renderCart(false); }
    });

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
        if (savedOrder && savedUser && document.querySelector('#reorder-banner:not([hidden])')) {
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
          window.location.href = 'cart.html#selected-items';
        }
      } catch (e) {
        console.error('Quick reorder failed:', e);
      }
    }

    if (document.getElementById('heroCarousel')) initHeroCarousel();
    refreshLivePrices();
    setInterval(() => { if (!document.hidden) refreshLivePrices(); }, 10000);
    window.addEventListener('focus', refreshLivePrices);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshLivePrices();
    });

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
      document.getElementById('confirm-delivery-fee').textContent = formatDeliveryFee(breakdown.deliveryFee);
      document.getElementById('confirm-handling-fee').textContent = '₹' + breakdown.handlingFee.toFixed(2);
      document.getElementById('confirm-additional-charges').textContent = '₹' + additionalCharges.toFixed(2);
      document.getElementById('confirm-total').textContent = order.total;
      document.getElementById('confirm-time').textContent = order.time;
      document.getElementById('confirm-address').textContent = order.address;
      document.getElementById('confirm-contact').textContent = `${order.name}, ${order.phone}`;
    }


    function checkoutBlocker() {
      if (!Object.keys(cart).length) return 'empty';
      if (!getBisleriReturnState().hasAnswer) return 'jars';
      if (!checkoutAddressConfirmed || !getDeliveryCoordinates()) return 'address';
      if (!document.getElementById('preferred-time')?.value) return 'window';
      if (cachedRoadDistanceKm === null) return 'route';
      if (cachedRoadDistanceKm > MAX_DELIVERY_RADIUS_KM || cachedRouteResult?.selectedHub === null) return 'outside';
      if (cachedRouteResult?.selectedHub === 'hub2' && Object.values(cart).some(item => item.name !== BISLERI_20L_NAME)) return 'hub2-products';
      return '';
    }

    function updateOrderButton() {
      const button = document.getElementById('submit-order-btn');
      if (!button) return;
      const blocker = checkoutBlocker();
      button.disabled = orderSubmitting;
      button.toggleAttribute('data-checkout-incomplete', !!blocker);
      button.setAttribute('aria-busy', String(orderSubmitting));
      const feedback = document.getElementById('place-order-feedback');
      if (feedback.dataset.blocker !== blocker) {
        feedback.textContent = '';
        delete feedback.dataset.blocker;
      }
    }

    function guideToCheckoutRequirement() {
      const blocker = checkoutBlocker();
      if (!blocker) return false;
      const feedback = document.getElementById('place-order-feedback');
      feedback.textContent = '';
      feedback.dataset.blocker = blocker;
      if (blocker === 'jars') {
        window.location.href = 'cart.html#selected-items';
      } else if (blocker === 'address') {
        document.getElementById('open-address-sheet').click();
      } else if (blocker === 'window') {
        feedback.textContent = 'Choose a delivery window before placing your order.';
        document.getElementById('change-delivery-window').click();
      } else if (blocker === 'empty') {
        feedback.textContent = 'Add at least one item to your cart.';
      } else if (blocker === 'outside') {
        feedback.textContent = 'This address is outside the 5.5 km delivery radius of both hubs.';
      } else if (blocker === 'hub2-products') {
        feedback.textContent = 'This address is served by the Amrutha hub, which currently delivers Bisleri 20L cans only. Remove other products or choose an address within the main hub area.';
      } else {
        feedback.textContent = 'Delivery distance is unavailable. Please check your address or try again.';
      }
      return true;
    }

    document.getElementById('submit-order-btn')?.addEventListener('click', event => {
      if (guideToCheckoutRequirement()) event.preventDefault();
    });

    const form = document.getElementById('waterForm');
    // Indian mobile numbers: accept digits only and cap both fields at 10 digits.
    ['customer-phone', 'customer-alt-phone'].forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '').slice(0, 10);
        if (input.value !== digits) input.value = digits;
      });
    });
    form?.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (orderSubmitting || guideToCheckoutRequirement()) return;
      orderSubmitting = true;
      const submissionStartedAt = performance.now();
      updateOrderButton();
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

      const savedAccountAddress = window.getSelectedNeerBekuAddress?.();
      if (savedAccountAddress) {
        document.getElementById('customer-address').value = savedAccountAddress.address;
        document.getElementById('delivery-latitude').value = savedAccountAddress.latitude || '';
        document.getElementById('delivery-longitude').value = savedAccountAddress.longitude || '';
        document.getElementById('delivery-address-source').value = 'saved-account';
        // Keep the editable checkout contact fields as entered by the customer.
        // The saved address supplies delivery details, not an enforced phone number.
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
      if (!/^\d{10}$/.test(customerPhone)) {
        alert('Please enter a valid 10-digit mobile number.');
        document.getElementById('customer-phone').focus();
        return;
      }
      if (!customerPhone) {
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
        qty: Object.values(cart).reduce((count, item) => count + item.qty, 0),
        bill: totalBill,
        subtotal: orderTotals.subtotal,
        deliveryFee: orderTotals.deliveryFee,
        handlingFee: orderTotals.handlingFee,
        distanceKm: deliveryDistanceKm,
        selectedHub: cachedRouteResult?.selectedHub || null,
        deliveryWindow: deliveryWindow,
        time: deliveryWindow,
        latitude: latitude,
        longitude: longitude,
        addressSource: addressSource
      };

      const signature = JSON.stringify(payload);
      if (lastOrderAttempt?.signature !== signature) {
        lastOrderAttempt = { signature, orderId: generateMemorableOrderId() };
      }
      const orderRef = lastOrderAttempt.orderId;
      payload.orderId = orderRef;

      try {
        const response = await fetch('/api/orders', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (response.ok && result.success) {
          const remainingPause = 350 - (performance.now() - submissionStartedAt);
          if (remainingPause > 0) await new Promise(resolve => setTimeout(resolve, remainingPause));
          const telegramSent = result.telegramSent === true;
          const confirmationLead = document.querySelector('#thankyou-screen .confirm-lead');
          if (confirmationLead) {
            confirmationLead.textContent = telegramSent
              ? 'Thank you for your order. We have received it and will contact you shortly to confirm delivery.'
              : 'Your order is saved securely. The store notification is delayed; please call us if you need an immediate confirmation.';
          }
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
          lastOrderAttempt = null;
          bisleriReturnChoice = null;
          try { sessionStorage.removeItem(CHECKOUT_JAR_CHOICE_KEY); } catch {}
          cart = {};
          persistCart();
          renderCart(false);
          window.scrollTo(0, 0);
        } else {
          alert(result.error || "We could not save your order. Please try again or call us before placing another order.");
        }
      } catch (error) {
        console.error("Error:", error);
        alert("We could not confirm that your order was saved. Please try again or call us before placing another order.");
      }
      } finally {
        orderSubmitting = false;
        updateOrderButton();
      }
    });

// Shared stock from the existing /api/stock Worker endpoint.
document.querySelectorAll('[data-staging-live-badge]').forEach(badge => {
  badge.hidden = !location.hostname.toLowerCase().startsWith('neerbeku-staging.');
});

let liveStock = {};
let stockReady = false;
let stockRequest = null;

function updateCardAddLabel(card) {
  const product = card.dataset.name;
  const button = card.querySelector('.add-cart-btn');
  const label = button.querySelector('.card-add-label');
  if (!cart[product]) button.classList.remove('is-added');
  const added = button.classList.contains('is-added');
  const quantity = Number(button.querySelector('.card-qty-value').textContent);
  if (added || quantity === 0) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
  if (!stockReady) label.textContent = 'Checking stock…';
  else if (liveStock[product] !== true) label.textContent = 'Out of stock';
  else label.textContent = added ? 'Added' : 'Add';
}

function applyLiveStock() {
  document.querySelectorAll('.water-card').forEach(card => {
    const available = stockReady && liveStock[card.dataset.name] === true;
    const button = card.querySelector('.add-cart-btn');
    button.disabled = !available;
    button.style.opacity = available ? '' : '0.6';
    button.style.cursor = available ? '' : 'not-allowed';
    updateCardAddLabel(card);
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
document.querySelector('.water-grid, .cart-panel, .reference-summary-card')?.before(stockNotice);
loadCustomStorefrontProducts().finally(() => {
  initProductCarousels();
  applyLiveStock();
  refreshLiveStock();
});
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
  const dateInput = document.getElementById('delivery-date');
  if (dateInput) dateInput.min = nextStoreDate(now.date);
}

// Compact selected delivery card with a bottom-sheet picker. The original
// select remains the source of truth for order validation and submission.
function initDeliveryWindowPicker() {
  const select = document.getElementById('preferred-time');
  const dialog = document.getElementById('delivery-window-dialog');
  const optionsContainer = document.getElementById('delivery-window-options');
  const selectedLabel = document.getElementById('delivery-window-selected');
  if (!select || !dialog || !optionsContainer || !selectedLabel) return;

  const dateFields = document.getElementById('scheduled-delivery-fields');
  const dateInput = document.getElementById('delivery-date');
  const timeSelect = document.getElementById('scheduled-slot');
  let activeDay = 'today';

  function summaryText() {
    const option = select.selectedOptions[0];
    if (!option?.value) return 'Choose a delivery window';
    if (option.value.startsWith('ASAP')) return 'ASAP · Within 1–2 hours';
    if (option.value === 'scheduled') {
      const date = dateInput?.value;
      const time = timeSelect?.selectedOptions[0]?.textContent || '';
      if (!date) return 'Choose another date';
      const parsed = new Date(`${date}T12:00:00`);
      const friendlyDate = parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      return `${friendlyDate} · ${time.replace(/\s*·\s*/, ' ')}`;
    }
    const match = option.textContent.match(/^(Today|Tomorrow) - ([^(]+)\s*\(([^)]+)\)/);
    return match ? `${match[1]} · ${match[2].trim()} · ${match[3]}` : option.textContent;
  }

  function renderSummary() {
    selectedLabel.textContent = summaryText();
    selectedLabel.closest(".delivery-window-summary").classList.toggle("needs-window", !select.value);
    document.getElementById("change-delivery-window").textContent = select.value ? "Change" : "Choose";
    renderCart(false);
  }

  function setTab(day) {
    activeDay = day;
    dialog.querySelectorAll('[data-window-day]').forEach(tab => {
      const active = tab.dataset.windowDay === day;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const choosingDate = day === 'date';
    dateFields.hidden = !choosingDate;
    dateInput.disabled = !choosingDate;
    timeSelect.disabled = !choosingDate;
    dateInput.required = choosingDate;
    timeSelect.required = choosingDate;
    optionsContainer.hidden = choosingDate;
    if (!choosingDate) renderOptions();
  }

  function renderOptions() {
    refreshDeliveryChoices();
    optionsContainer.replaceChildren();
    const choices = Array.from(select.options).filter(option => option.value.startsWith("ASAP") || option.dataset.day === activeDay);
    for (const option of choices) {
      const asap = !option.dataset.day;
      const match = option.textContent.match(/^(?:Today|Tomorrow) - ([^(]+)\s*\(([^)]+)\)/);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'delivery-window-option';
      row.setAttribute('role', 'radio');
      row.setAttribute('aria-checked', String(select.value === option.value));
      row.disabled = option.disabled;

      const icon = document.createElement('span');
      icon.className = 'delivery-window-option-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = asap ? '◷' : ({ Morning: '☀', Midday: '☼', Afternoon: '◒', Evening: '☾' }[match?.[1].trim()] || '◷');

      const copy = document.createElement('span');
      copy.className = 'delivery-window-option-copy';
      const title = document.createElement('strong');
      title.textContent = asap ? 'ASAP' : match?.[1].trim() || option.textContent;
      const detail = document.createElement('small');
      detail.textContent = asap ? 'Within 1–2 hours' : match?.[2] || '';
      copy.append(title, detail);

      const mark = document.createElement('span');
      mark.className = 'delivery-window-radio-mark';
      mark.setAttribute('aria-hidden', 'true');
      row.append(icon, copy, mark);
      row.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        renderSummary();
        dialog.close();
      });
      optionsContainer.append(row);
    }
  }

  document.getElementById('change-delivery-window')?.addEventListener('click', () => {
    refreshDeliveryChoices();
    const selectedOption = select.selectedOptions[0];
    setTab(selectedOption?.dataset.day || (select.value === 'scheduled' ? 'date' : 'today'));
    renderSummary();
    dialog.showModal();
  });
  document.getElementById('close-delivery-window')?.addEventListener('click', () => dialog.close());
  dialog.querySelectorAll('[data-window-day]').forEach(tab => {
    tab.addEventListener('click', () => setTab(tab.dataset.windowDay));
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  document.getElementById('apply-custom-delivery-window')?.addEventListener('click', () => {
    if (!dateInput.value || !dateInput.checkValidity() || dateInput.value < dateInput.min) {
      dateInput.reportValidity();
      dateInput.focus();
      return;
    }
    select.value = 'scheduled';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    renderSummary();
    dialog.close();
  });
  select.addEventListener('change', renderSummary);
  renderSummary();
}

function getDeliveryWindow() {
  refreshDeliveryChoices();
  const select = document.getElementById('preferred-time');
  const now = storeDateParts();
  const option = select.selectedOptions[0];
  if (!option?.value) {
    document.getElementById("change-delivery-window")?.click();
    return null;
  }
  if (option.disabled) {
    alert('That delivery window has passed. Please choose another window.');
    document.getElementById("change-delivery-window")?.click();
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
  initDeliveryWindowPicker();
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
  const addAddressButton = document.getElementById('add-saved-address');
  const entryPanel = document.getElementById('delivery-entry-panel');
  const saveRow = document.getElementById('account-save-address-row');
  const saveButton = document.getElementById('save-address-to-account');
  const cancelButton = document.getElementById('cancel-address-entry');
  const addressMessage = document.getElementById('account-address-message');
  const addressSheet = document.getElementById('checkout-address-sheet');
  const addressTrigger = document.getElementById('open-address-sheet');
  const confirmAddressButton = document.getElementById('confirm-checkout-address');
  const addressPreview = document.getElementById('checkout-address-preview');
  const addressError = document.getElementById('checkout-address-error');
  let previousSheetAddress = null;
  const saveMessage = document.getElementById('save-address-message');
  let addresses = [];
  let selectedAddress = null;
  let accountUser = null;
  let editingAddressId = null;

  const field = id => document.getElementById(id);
  const setText = (element, value) => { if (element) element.textContent = value || ''; };
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function updateCheckoutAddress(confirmed) {
    checkoutAddressConfirmed = confirmed && !!getDeliveryCoordinates();
    setText(addressPreview, checkoutAddressConfirmed
      ? savedAddressPreview(selectedAddress || {
          house: field('address-house').value,
          street: field('address-street').value
        })
      : 'Choose a delivery address');
    const coordinates = checkoutAddressConfirmed ? getDeliveryCoordinates() : null;
    window.updateCheckoutPinPreview?.(coordinates, coordinates?.key === cachedRouteKey ? cachedRouteResult : null);
    renderCart(false);
  }

  addressTrigger?.addEventListener('click', () => {
    setText(addressError, '');
    previousSheetAddress = selectedAddress;
    if (!addressSheet.open) addressSheet.showModal();
    addAddressButton.hidden = !accountUser || addresses.length >= 5;
    addressListEl.hidden = addresses.length === 0;
    confirmAddressButton.hidden = !!selectedAddress;
    if (!selectedAddress) window.switchAddressMode?.('manual');
  });
  field('close-address-sheet')?.addEventListener('click', () => addressSheet.close());
  addressSheet?.addEventListener('close', () => {
    if (previousSheetAddress && !checkoutAddressConfirmed) {
      populateCheckoutFields(previousSheetAddress);
      showAccountAddress(previousSheetAddress);
    }
    previousSheetAddress = null;
  });
  addressSheet?.addEventListener('input', event => {
    if (event.target.closest('#delivery-address-fields')) updateCheckoutAddress(false);
  });
  confirmAddressButton?.addEventListener('click', () => {
    for (const id of ['address-house', 'address-street', 'address-area', 'address-city']) {
      const input = field(id);
      if (!input.value.trim()) {
        setText(addressError, 'Complete the address fields before continuing.');
        input.focus();
        return;
      }
    }
    if (!getDeliveryCoordinates()) {
      setText(addressError, 'Choose a location on the map before continuing.');
      return;
    }
    if (window.syncDeliveryAddress) window.syncDeliveryAddress();
    updateCheckoutAddress(true);
    addressSheet.close();
  });
  document.addEventListener('deliverylocationchange', () => {
    if (addressSheet?.open && !selectedAddress) updateCheckoutAddress(false);
  });

  function setEntryVisible(visible) {
    if (!entryPanel) return;
    // Keep contact details editable when a saved delivery address is selected.
    entryPanel.hidden = false;
    field('delivery-address-entry').hidden = !visible;
    confirmAddressButton.hidden = !visible;
    window.setDeliveryLocationEditable?.(visible);
    entryPanel.querySelectorAll('input, select, textarea, button').forEach(control => {
      // Contact details must remain editable even when a saved address is selected.
      // Only lock the address-entry controls until the customer chooses to edit an address.
      if (['customer-name', 'customer-phone', 'customer-alt-phone',
           'delivery-date', 'scheduled-slot'].includes(control.id)) return;
      control.disabled = !visible;
    });
  }

  function savedAddressPreview(address) {
    const firstParts = [address.house, address.street, address.area].filter(Boolean).slice(0, 2);
    return firstParts.length ? firstParts.join(", ") : String(address.address || "").split(",").slice(0, 2).join(", ");
  }

  function showAccountAddress(address) {
    selectedAddress = address || null;
    if (!accountPanel) return;
    accountPanel.hidden = false;
    addressListEl.hidden = !addressSheet.open || addresses.length === 0;
    addAddressButton.hidden = !accountUser || addresses.length >= 5;
    updateCheckoutAddress(!!address);
    if (address) {
      activeAddressEl.innerHTML = `<strong class="saved-address-label">${escape(address.label || 'Delivery address')}</strong><span>${escape(savedAddressPreview(address))}</span>`;
      setEntryVisible(false);
      saveRow.hidden = true;
      setText(addressMessage, '');
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
        <button class="delivery-window-option saved-address-select" type="button" data-use-address="${escape(address.id)}" aria-pressed="${selectedAddress?.id === address.id}">
          <span class="delivery-window-option-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
          <span class="delivery-window-option-copy"><strong>${escape(address.label || 'Delivery address')}</strong><small>${escape(savedAddressPreview(address))}</small></span>
          <span class="delivery-window-radio-mark" aria-hidden="true"></span>
        </button>
        <div class="saved-address-option-actions">
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
      window.switchAddressMode?.('manual');
      field('delivery-address-entry').scrollIntoView({ block: 'start' });
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
          addressSheet.close();
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
    window.clearDeliveryLocation?.();
    document.dispatchEvent(new Event('deliverylocationchange'));
    const savedLabels = addresses.map(item => item.label);
    field('account-address-label').value = ['Home', 'Work', 'Address 3', 'Address 4', 'Address 5'].find(label => !savedLabels.includes(label)) || '';
    window.switchAddressMode?.('manual');
    field('delivery-address-entry').scrollIntoView({ block: 'start' });
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
    if (!label || label.length > 40) {
      setText(saveMessage, 'Give this address a name of up to 40 characters.');
      return;
    }
    if (!name || !/^\d{10}$/.test(phone) || !house || !street || !area || !city || !address || !latitude || !longitude) {
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
      if (addressSheet.open) addressSheet.close();
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
    setText(connectedUser, user.email || "");
    signout.hidden = false;
    setText(accountTitle, 'Your NeerBeku account is connected');
    setText(status, `Signed in as ${user.name}${user.email ? ` (${user.email})` : ''}.`);
    if (user.name && !field('customer-name').value) field('customer-name').value = user.name;
    loadAddresses();
  }

  window.getSelectedNeerBekuAddress = () => selectedAddress;
  addAddressButton.addEventListener('click', openAddressEntry);
  saveButton.addEventListener('click', saveAddress);
  cancelButton.addEventListener('click', () => {
    const preferred = addresses.find(item => item.is_default) || addresses[0] || null;
    if (preferred) { populateCheckoutFields(preferred); showAccountAddress(preferred); }
    if (addressSheet.open) addressSheet.close();
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
    setText(status, '');
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
      const width = Math.max(200, Math.min(280, Math.floor(availableWidth)));
      if (width === renderedWidth) return;
      renderedWidth = width;
      window.google.accounts.id.initialize({ client_id: clientId, callback: window.handleGoogleCredential });
      window.google.accounts.id.renderButton(button, { theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill', width });
    } else if (++attempts < 30) setTimeout(renderButton, 100);
  };
  renderButton();
  window.addEventListener('resize', renderButton);
})();
