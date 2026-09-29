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
      const updated = Math.max(1, current + change);
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

    let cart = {};

    function changeCardQty(button, change) {
      const controls = button.closest('.card-qty-controls');
      const valueEl = controls.querySelector('.card-qty-value');
      const current = parseInt(valueEl.textContent, 10) || 1;
      valueEl.textContent = Math.max(1, current + change);
    }

    function addToCart(button) {
      const card = button.closest('.water-card');
      const name = card.dataset.name;
      const price = parseFloat(card.dataset.price);
      const qty = parseInt(card.querySelector('.card-qty-value').textContent, 10) || 1;

      if (cart[name]) {
        cart[name].qty += qty;
      } else {
        cart[name] = { name, price, qty };
      }

      button.classList.add('added');
      button.innerText = '✓ ADDED TO CART';
      card.classList.add('in-cart');

      setTimeout(() => {
        button.classList.remove('added');
        button.innerText = 'ADD TO CART';
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

    function renderCart() {
      const items = Object.values(cart);
      const cartItemsEl = document.getElementById('cart-items');
      const cartCountEl = document.getElementById('cart-count');
      const cartTotalEl = document.getElementById('cart-total');
      const totalDisplayEl = document.getElementById('total-display');
      const totalInputEl = document.getElementById('input-total-bill');
      const cartItemsInputEl = document.getElementById('cart-items-input');

      if (!items.length) {
        cartItemsEl.innerHTML = '<div class="cart-empty">Your cart is empty. Select items and quantities above to build your order.</div>';
        cartCountEl.textContent = '0';
        cartTotalEl.textContent = '₹0.00';
        totalDisplayEl.textContent = '₹0.00';
        totalInputEl.value = '₹0.00';
        cartItemsInputEl.value = '';
        return;
      }

      let total = 0;
      let count = 0;

      cartItemsEl.innerHTML = items.map(item => {
        const lineTotal = item.price * item.qty;
        total += lineTotal;
        count += item.qty;

        return `
          <div class="cart-item">
            <div>
              <div class="cart-item-name">${escapeHtml(item.name)}</div>
              <div class="cart-item-meta">${item.qty} × ₹${item.price.toFixed(2)}</div>
            </div>
            <div class="cart-item-total">₹${lineTotal.toFixed(2)}</div>
            <button type="button" class="remove-cart-btn" onclick="removeFromCart(${JSON.stringify(item.name)})">Remove</button>
          </div>
        `;
      }).join('');

      cartCountEl.textContent = count;
      cartTotalEl.textContent = '₹' + total.toFixed(2);
      totalDisplayEl.textContent = '₹' + total.toFixed(2);
      totalInputEl.value = '₹' + total.toFixed(2);
      cartItemsInputEl.value = items
        .map(item => `${item.name} x ${item.qty} (₹${(item.price * item.qty).toFixed(2)})`)
        .join(' | ');
    }

    function loadSavedCustomerData() {
      try {
        const savedUser = localStorage.getItem(STORAGE_KEY_USER);
        if (savedUser) {
          const user = JSON.parse(savedUser);
          if (user.name) document.getElementById('customer-name').value = user.name;
          if (user.phone) document.getElementById('customer-phone').value = user.phone;
          if (user.address) document.getElementById('customer-address').value = user.address;
          if (user.notes) document.getElementById('landmark-notes').value = user.notes;
        }

        const savedOrder = localStorage.getItem(STORAGE_KEY_LAST_ORDER);
        if (savedOrder && savedUser) {
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

    function executeQuickReorder() {
      try {
        const savedOrder = localStorage.getItem(STORAGE_KEY_LAST_ORDER);
        if (!savedOrder) return;
        
        const lastOrder = JSON.parse(savedOrder);
        if (lastOrder.cart) {
          cart = JSON.parse(JSON.stringify(lastOrder.cart));
          
          document.querySelectorAll('.water-card').forEach(card => {
            const name = card.dataset.name;
            if (cart[name]) {
              card.classList.add('in-cart');
            } else {
              card.classList.remove('in-cart');
            }
          });

          renderCart();
          document.getElementById('submit-order-btn').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (e) {
        console.error('Quick reorder failed:', e);
      }
    }

    initHeroCarousel();
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
    if (window.ResizeObserver) {
      new ResizeObserver(syncMobileImageSquares).observe(document.querySelector('.water-grid'));
    }

    loadSavedCustomerData();

    function escapeHtml(value) {
      return value.replace(/[&<>"']/g, char => ({
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

    const form = document.getElementById('waterForm');
    form.addEventListener('submit', async function(e) {
      e.preventDefault();

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
      const customerAddress = document.getElementById('customer-address').value;
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
        time: document.getElementById('preferred-time').value
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
          document.getElementById('order-screen').classList.add('hidden');
          document.getElementById('thankyou-screen').classList.remove('hidden');
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
    });
