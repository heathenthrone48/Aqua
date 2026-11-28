const MAINTENANCE_HTML = "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>NeerBeku — Opening Soon</title><style>\n*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:24px;background:#edf7fc;color:#12364d;font-family:Arial,sans-serif}main{max-width:560px;width:100%;text-align:center;background:#fff;padding:56px 28px;border-radius:24px;box-shadow:0 16px 60px #12364d12}.brand{font-size:30px;font-weight:800;color:#087eaf;margin:0 0 40px}.tag{font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#087eaf}h1{font-size:clamp(30px,7vw,44px);margin:16px 0 24px;line-height:1.1}p{font-size:17px;line-height:1.7;color:#506b7b;margin:12px 0}.thanks{font-size:14px;margin-top:32px}\n</style></head><body><main><div class=\"brand\">NeerBeku</div><div class=\"tag\">Opening soon</div><h1>We’re getting ready<br>to begin deliveries.</h1><p>We’re temporarily not accepting orders.</p><p>Please check back later for updates.</p><p class=\"thanks\">Thank you for your patience.</p></main></body></html>";

const DEFAULT_PRODUCT_PRICES = {
  "Bisleri 20L Can": { sellingPrice: 100, mrp: 100 },
  "Bisleri 10L Can": { sellingPrice: 125, mrp: 130 },
  "Bisleri 5L Bottle": { sellingPrice: 75, mrp: 80 },
  "Bisleri 2L Case": { sellingPrice: 250, mrp: 270 },
  "Bisleri 1L Case": { sellingPrice: 180, mrp: 240 },
  "Bisleri 500ml Case": { sellingPrice: 200, mrp: 240 },
  "Bailey 10L Can": { sellingPrice: 115, mrp: 120 },
  "Bailey 5L Can": { sellingPrice: 75, mrp: 70 },
  "Bailey 2L Case": { sellingPrice: 240, mrp: 315 },
  "Bailey 1L Case": { sellingPrice: 230, mrp: 230 },
  "Kinley 2L Case": { sellingPrice: 240, mrp: 315 },
  "Kinley 1L Case": { sellingPrice: 230, mrp: 300 },
  "Manual Water Dispenser Hand Pump": { sellingPrice: 150, mrp: 200 },
  "Automatic Electric Water Dispenser Pump": { sellingPrice: 250, mrp: 400 }
};

const PRODUCT_IDS = new Set([
  "Bisleri 20L Can",
  "Bisleri 10L Can",
  "Bisleri 5L Bottle",
  "Bisleri 2L Case",
  "Bisleri 1L Case",
  "Bisleri 500ml Case",
  "Bailey 10L Can",
  "Bailey 5L Can",
  "Bailey 2L Case",
  "Bailey 1L Case",
  "Kinley 2L Case",
  "Kinley 1L Case",
  "Manual Water Dispenser Hand Pump",
  "Automatic Electric Water Dispenser Pump"
]);

const TELEGRAM_ORDER_WORKER_URL = "https://water-order-sms.ashinsobharaj1.workers.dev/";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

async function validPassword(request, env) {
  if (!env.ADMIN_PASSWORD) return false;

  const supplied = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.ADMIN_PASSWORD}`;

  const digest = async value =>
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
      )
    );

  const [a, b] = await Promise.all([
    digest(supplied),
    digest(expected)
  ]);

  return a.reduce((difference, value, index) =>
    difference | (value ^ b[index]), 0) === 0;
}


const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function verifyGoogleCredential(credential, clientId) {
  if (!credential || !clientId) throw new Error("Google sign-in is not configured");
  const parts = credential.split(".");
  if (parts.length !== 3) throw new Error("Invalid Google credential");
  const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid Google token header");
  const jwksResponse = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!jwksResponse.ok) throw new Error("Could not retrieve Google signing keys");
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Unknown Google signing key");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const validSignature = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, base64UrlToBytes(parts[2]), signedData);
  const now = Math.floor(Date.now() / 1000);
  if (!validSignature || !GOOGLE_ISSUERS.has(claims.iss) || claims.aud !== clientId || claims.exp <= now || (claims.nbf && claims.nbf > now) || !claims.sub || claims.email_verified !== true) {
    throw new Error("Google credential could not be verified");
  }
  return { sub: claims.sub, email: claims.email || "", name: claims.name || "Customer" };
}

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `__Host-neerbeku_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function readSessionToken(request) {
  const cookies = request.headers.get("Cookie") || "";
  const pair = cookies.split(";").map(value => value.trim()).find(value => value.startsWith("__Host-neerbeku_session="));
  return pair ? pair.slice("__Host-neerbeku_session=".length) : "";
}

async function getCurrentUser(request, env) {
  const token = readSessionToken(request);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(`SELECT users.google_sub, users.email, users.name FROM auth_sessions
    JOIN auth_users AS users ON users.google_sub = auth_sessions.google_sub
    WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?`).bind(hash, now).first();
  return row || null;
}

function adminGoogleEmails(env) {
  return new Set((env.ADMIN_GOOGLE_EMAILS || "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean));
}

async function hasAdminAccess(request, env) {
  const approved = adminGoogleEmails(env);
  if (env.ADMIN_AUTH_MODE !== "google") return validPassword(request, env);
  const user = await getCurrentUser(request, env);
  const email = user?.email?.toLowerCase();
  return !!(user?.google_sub && email?.endsWith("@gmail.com") && approved.has(email));
}

function normalizeOrder(data) {
  const orderId = String(data.orderId || data.orderID || "").trim();
  const name = String(data.name || "").trim();
  const phone = String(data.phone || "").trim();
  const address = String(data.address || "").trim();
  const deliveryWindow = String(data.deliveryWindow || data.time || "").trim();
  const items = Array.isArray(data.items) ? data.items : [];
  const totalAmount = Number(String(data.bill || "").replace(/[^0-9.-]/g, ""));

  if (!/^[A-Za-z0-9_-]{3,80}$/.test(orderId) || !name || name.length > 120 ||
      !/^[+0-9().\-\s]{6,32}$/.test(phone) || !address || address.length > 600 ||
      !deliveryWindow || deliveryWindow.length > 160 || !items.length || items.length > 50 ||
      !Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 1e7) {
    return null;
  }

  const normalizedItems = [];
  for (const item of items) {
    const productId = String(item?.productId || "").trim();
    const itemName = String(item?.name || "").trim();
    const unitPrice = Number(item?.unitPrice);
    const quantity = Number(item?.quantity);
    const lineTotal = Number(item?.lineTotal);
    if (!productId || productId.length > 120 || !itemName || itemName.length > 120 ||
        !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1e6 ||
        !Number.isInteger(quantity) || quantity < 1 || quantity > 500 ||
        !Number.isFinite(lineTotal) || lineTotal < 0 || lineTotal > 1e7) return null;
    normalizedItems.push({ productId, name: itemName, unitPrice, quantity, lineTotal });
  }

  const optionalNumber = value => value === null || value === undefined || value === "" ? null : Number(value);
  const latitude = optionalNumber(data.latitude);
  const longitude = optionalNumber(data.longitude);
  const distanceKm = optionalNumber(data.distanceKm);
  if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) ||
      (distanceKm !== null && (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 1000))) return null;

  const sourceAddressDetails = data.addressDetails && typeof data.addressDetails === "object" ? data.addressDetails : {};
  const addressDetails = Object.fromEntries(["house", "street", "area", "city", "postcode", "landmark"]
    .map(key => [key, String(sourceAddressDetails[key] || "").trim().slice(0, key === "landmark" ? 250 : 200)]));
  const order = {
    orderId, name, phone,
    alternatePhone: String(data.alternatePhone || "").trim().slice(0, 32),
    address,
    addressDetails,
    notes: String(data.notes || "").slice(0, 2000),
    items: normalizedItems,
    productSubtotal: Number(data.productSubtotal) || 0,
    bisleri20LQuantity: Number(data.bisleri20LQuantity) || 0,
    bisleriContainerDeposit: Number(data.bisleriContainerDeposit) || 0,
    bisleriReturnedContainers: Number(data.bisleriReturnedContainers) || 0,
    bisleriReturnCredit: Number(data.bisleriReturnCredit) || 0,
    cart: String(data.cart || "").slice(0, 4000),
    qty: Number(data.qty) || normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
    bill: String(data.bill || "").slice(0, 40),
    subtotal: Number(data.subtotal) || 0,
    deliveryFee: Number(data.deliveryFee) || 0,
    handlingFee: Number(data.handlingFee) || 0,
    distanceKm,
    selectedHub: String(data.selectedHub || ""),
    deliveryWindow,
    time: deliveryWindow,
    latitude,
    longitude,
    addressSource: String(data.addressSource || "").slice(0, 40),
    paymentMethod: "Cash on delivery"
  };

  if ([order.productSubtotal, order.bisleriContainerDeposit, order.bisleriReturnCredit,
       order.subtotal, order.deliveryFee, order.handlingFee].some(value => !Number.isFinite(value) || value < 0 || value > 1e7)) return null;
  return { order, totalAmount };
}

const MAX_DELIVERY_RADIUS_KM = 5.5;
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

async function deliveryRoute(data, env) {
  if (!env.ORS_API_KEY) return json({ error: "Road distance service is not configured yet." }, 503);
  const latitude = Number(data.latitude), longitude = Number(data.longitude);
  if (data.latitude === undefined || data.latitude === null || data.latitude === "" ||
      data.longitude === undefined || data.longitude === "" ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return json({ error: "Choose a valid GPS or map location." }, 400);
  }

  const hubs = [
    { id: "hub1", name: "Main Hub", latitude: 12.8097082, longitude: 77.6789059, products: "all" },
    { id: "hub2", name: "Amrutha Supermarket Hub", latitude: 12.8151065, longitude: 77.6908506, products: "bisleri20l" }
  ];
  const results = await Promise.all(hubs.map(async hub => {
    try {
      const response = await fetch("https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson", {
        method: "POST",
        headers: { "Authorization": env.ORS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [[hub.longitude, hub.latitude], [longitude, latitude]], instructions: false })
      });
      const data = await response.json();
      const summary = data.features?.[0]?.properties?.summary;
      const geometry = data.features?.[0]?.geometry;
      if (!response.ok || !Number.isFinite(summary?.distance) || summary.distance <= 0 ||
          geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
      return { id: hub.id, name: hub.name, distanceKm: Number((summary.distance / 1000).toFixed(3)),
        distanceMeters: summary.distance, durationSeconds: Number.isFinite(summary.duration) ? summary.duration : null,
        geometry: geometry.coordinates, withinServiceArea: summary.distance <= 5500, products: hub.products };
    } catch { return null; }
  }));
  if (results.some(result => result === null)) {
    return json({ error: "Could not calculate road distance from both delivery hubs. Please try again." }, 502);
  }
  const hub1 = results[0], hub2 = results[1];
  const selected = hub1.withinServiceArea ? hub1 : hub2.withinServiceArea ? hub2 : null;
  return json({ hubs: results, selectedHub: selected?.id || null,
    distanceKm: selected?.distanceKm ?? Math.min(hub1.distanceKm, hub2.distanceKm),
    distanceMeters: selected?.distanceMeters ?? null, durationSeconds: selected?.durationSeconds ?? null,
    geometry: selected?.geometry ?? [], withinServiceArea: !!selected });
}
const BULK_DISCOUNT_PRODUCTS = new Set([
  'Bisleri 20L Can', 'Bisleri 5L Bottle',
  'Bisleri 1L Case', 'Bisleri 2L Case', 'Bisleri 500ml Case',
  'Bailey 10L Can', 'Bailey 5L Can', 'Bailey 1L Case', 'Bailey 2L Case',
  'Kinley 1L Case', 'Kinley 2L Case'
]);
const BULK_DISCOUNT_MIN_QTY = 5;
const BULK_DISCOUNT_PER_UNIT = 5;
async function validateOrderPricing(order, totalAmount, env) {
  const { results: overrides } = await env.DB.prepare("SELECT product_id, selling_price FROM product_prices").all();
  const { results: custom } = await env.DB.prepare("SELECT id, name, selling_price, available FROM custom_products").all();
  const { results: stock } = await env.DB.prepare("SELECT product_id, available FROM product_stock").all();
  const prices = new Map(Object.entries(DEFAULT_PRODUCT_PRICES).map(([id, price]) => [id, price.sellingPrice]));
  const unavailable = new Set(stock.filter(row => row.available !== 1).map(row => row.product_id));
  const customNames = new Map();
  for (const row of overrides) {
    if (prices.has(row.product_id)) prices.set(row.product_id, Number(row.selling_price));
  }
  for (const row of custom) {
    prices.set(row.id, Number(row.selling_price));
    customNames.set(row.id, row.name);
    if (row.available !== 1) unavailable.add(row.id);
  }

  const cents = value => Math.round(value * 100);
  let productCents = 0;
  let bisleriQty = 0;
  for (const item of order.items) {
    const price = prices.get(item.productId);
    if (price === undefined || unavailable.has(item.productId)) {
      return json({ error: "An item in your cart is no longer available. Please update your cart." }, 409);
    }
    const unitPrice = BULK_DISCOUNT_PRODUCTS.has(item.productId) && item.quantity >= BULK_DISCOUNT_MIN_QTY
      ? Math.max(0, price - BULK_DISCOUNT_PER_UNIT)
      : price;
    const lineCents = cents(unitPrice) * item.quantity;
    if (cents(item.unitPrice) !== cents(unitPrice) || cents(item.lineTotal) !== lineCents) {
      return json({ error: "A price has changed. Please review your cart and try again." }, 409);
    }
    item.name = customNames.get(item.productId) ?? item.productId;
    item.unitPrice = unitPrice;
    item.lineTotal = lineCents / 100;
    productCents += lineCents;
    if (item.productId === "Bisleri 20L Can") bisleriQty += item.quantity;
  }
  const returned = order.bisleriReturnedContainers;
  if (!Number.isSafeInteger(returned) || returned < 0 || returned > bisleriQty) {
    return json({ error: "Check the number of empty jars being returned." }, 400);
  }
  const response = await deliveryRoute(order, env);
  if (!response.ok) return response;
  const { distanceKm, withinServiceArea } = await response.json();
  if (!withinServiceArea) return json({ error: "This address is outside the delivery area." }, 422);

  const productSubtotal = productCents / 100;
  const deposit = bisleriQty * 150;
  const credit = returned * 150;
  const subtotal = productSubtotal + deposit - credit;
  const deliveryFee = getDeliveryFee(distanceKm, productSubtotal);
  const handlingFee = getHandlingFee(productSubtotal);
  const total = subtotal + deliveryFee + handlingFee;
  if (cents(totalAmount) !== cents(total)) {
    return json({ error: "The checkout total has changed. Please review your cart and delivery location." }, 409);
  }
  Object.assign(order, {
    productSubtotal, bisleri20LQuantity: bisleriQty, bisleriContainerDeposit: deposit,
    bisleriReturnCredit: credit, subtotal, deliveryFee, handlingFee, distanceKm,
    bill: "?" + total.toFixed(2),
    qty: order.items.reduce((sum, item) => sum + item.quantity, 0),
    cart: order.items.map(item => item.name + " x " + item.quantity + " (?" + item.lineTotal.toFixed(2) + ")").join(" | ")
  });
  return null;
}

async function notifyTelegram(order, siteOrigin, relay) {
  try {
    const response = await relay.fetch(TELEGRAM_ORDER_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": siteOrigin
      },
      body: JSON.stringify(order),
      signal: AbortSignal.timeout(10000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true) {
      console.error("Telegram relay failed", { orderId: order.orderId, status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Telegram relay request failed", { orderId: order.orderId, error: error?.name });
    return false;
  }
}

async function sendSavedOrderNotification(order, origin, env) {
  const telegramSent = await notifyTelegram(order, origin, env.TELEGRAM_ORDERS);
  try {
    await env.DB.prepare("UPDATE orders SET telegram_status = ? WHERE order_id = ?")
      .bind(telegramSent ? "sent" : "failed", order.orderId).run();
  } catch (error) {
    console.error("Could not record Telegram status", { orderId: order.orderId, error: error?.name });
  }
  return telegramSent;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const isDeliveryRouteTest = url.pathname === "/api/delivery/route" && request.method === "POST";

    if (env.MAINTENANCE_MODE === "true" && !isDeliveryRouteTest) {
      const headers = {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex"
      };
      const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
      headers["Content-Type"] = isApi
        ? "application/json; charset=utf-8"
        : "text/html; charset=utf-8";
      const body = isApi
        ? JSON.stringify({ error: "We’re temporarily not accepting orders. Please check back later." })
        : MAINTENANCE_HTML;
      return new Response(request.method === "HEAD" ? null : body, { status: 503, headers });
    }


    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      // Only this website may make browser-based changes.
      if (
        request.method !== "GET" &&
        request.headers.get("Origin") !== url.origin
      ) {
        return json({ error: "Invalid origin" }, 403);
      }

      if (url.pathname === "/api/delivery/route" && request.method === "POST") {
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
        return deliveryRoute(data || {}, env);
      }

      if (url.pathname === "/api/auth/google" && request.method === "POST") {
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
        try {
          const profile = await verifyGoogleCredential(data.credential, env.GOOGLE_CLIENT_ID);
          const now = Math.floor(Date.now() / 1000);
          await env.DB.prepare(`INSERT INTO auth_users (google_sub, email, name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, updated_at = excluded.updated_at`)
            .bind(profile.sub, profile.email, profile.name, now, now).run();
          const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
          const token = [...tokenBytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
          const tokenHash = await sha256Hex(token);
          const expiresAt = now + SESSION_TTL_SECONDS;
          await env.DB.prepare("INSERT INTO auth_sessions (token_hash, google_sub, expires_at, created_at) VALUES (?, ?, ?, ?)")
            .bind(tokenHash, profile.sub, expiresAt, now).run();
          return Response.json({ success: true, user: { email: profile.email, name: profile.name } }, {
            headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(token) }
          });
        } catch (error) {
          return json({ error: error.message === "Google sign-in is not configured" ? error.message : "Google sign-in could not be verified" }, 401);
        }
      }

      if (url.pathname === "/api/auth/session" && request.method === "GET") {
        const user = await getCurrentUser(request, env);
        return user ? json({ signedIn: true, user: { email: user.email, name: user.name } }) : json({ signedIn: false });
      }

      if (url.pathname === "/api/customer/addresses") {
        const user = await getCurrentUser(request, env);
        if (!user) return json({ error: "Sign in to access saved addresses" }, 401);

        if (request.method === "GET") {
          const { results } = await env.DB.prepare(`SELECT id, label, name, phone, address, house, street, area, city, postcode, landmark,
            latitude, longitude, is_default FROM customer_addresses
            WHERE google_sub = ? ORDER BY is_default DESC, updated_at DESC`).bind(user.google_sub).all();
          return json({ addresses: results.map(row => ({
            id: row.id, label: row.label, name: row.name, phone: row.phone,
            address: row.address, house: row.house || "", street: row.street || "",
            area: row.area || "", city: row.city || "", postcode: row.postcode || "",
            landmark: row.landmark || "", latitude: row.latitude, longitude: row.longitude,
            is_default: row.is_default === 1
          })) });
        }

        if (request.method === "POST") {
          let data;
          try { data = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
          const label = String(data.label || "").trim();
          const name = String(data.name || "").trim();
          const phone = String(data.phone || "").trim();
          const address = String(data.address || "").trim();
          const house = String(data.house || "").trim().slice(0, 160);
          const street = String(data.street || "").trim().slice(0, 200);
          const area = String(data.area || "").trim().slice(0, 160);
          const city = String(data.city || "").trim().slice(0, 120);
          const postcode = String(data.postcode || "").trim().slice(0, 20);
          const landmark = String(data.landmark || "").trim().slice(0, 250);
          const latitude = data.latitude == null || data.latitude === "" ? null : Number(data.latitude);
          const longitude = data.longitude == null || data.longitude === "" ? null : Number(data.longitude);
          if (!label || label.length > 40 || !name || name.length > 100 || !/^[+0-9().\-\s]{6,32}$/.test(phone) ||
              !address || address.length > 500 || !house || !street || !area || !city ||
              latitude === null || longitude === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
              !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return json({ error: "Enter an address name (up to 40 characters), complete details and map location" }, 400);
          }
          const existing = await env.DB.prepare("SELECT id FROM customer_addresses WHERE google_sub = ? AND lower(label) = lower(?) LIMIT 1")
            .bind(user.google_sub, label).first();
          if (existing) return json({ error: "An address already uses that name. Choose another name or edit the saved address." }, 409);
          const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM customer_addresses WHERE google_sub = ?")
            .bind(user.google_sub).first();
          if (count.count >= 5) return json({ error: "You can save up to 5 addresses. Edit or delete an existing address to add another." }, 400);
          const id = crypto.randomUUID();
          const now = Math.floor(Date.now() / 1000);
            await env.DB.prepare(`INSERT INTO customer_addresses
              (id, google_sub, label, name, phone, address, house, street, area, city, postcode, landmark, latitude, longitude, is_default, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
              .bind(id, user.google_sub, label, name, phone, address, house, street, area, city, postcode, landmark, latitude, longitude, now, now).run();
          const refreshed = await env.DB.prepare(`SELECT id, label, name, phone, address, house, street, area, city, postcode, landmark, latitude, longitude, is_default
            FROM customer_addresses WHERE google_sub = ? ORDER BY is_default DESC, updated_at DESC`).bind(user.google_sub).all();
          return json({ success: true, id, addresses: refreshed.results.map(row => ({
            id: row.id, label: row.label, name: row.name, phone: row.phone, address: row.address,
            house: row.house || "", street: row.street || "", area: row.area || "", city: row.city || "",
            postcode: row.postcode || "", landmark: row.landmark || "", latitude: row.latitude,
            longitude: row.longitude, is_default: row.is_default === 1
          })) });
        }

        if (request.method === "PUT") {
          let data;
          try { data = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
          const id = String(data.id || "");
          const owned = await env.DB.prepare("SELECT id FROM customer_addresses WHERE id = ? AND google_sub = ?")
            .bind(id, user.google_sub).first();
          if (!owned) return json({ error: "Saved address not found" }, 404);
          if (data.action === "edit") {
            const label = String(data.label || "").trim();
            const name = String(data.name || "").trim();
            const phone = String(data.phone || "").trim();
            const address = String(data.address || "").trim();
            const house = String(data.house || "").trim().slice(0, 160);
            const street = String(data.street || "").trim().slice(0, 200);
            const area = String(data.area || "").trim().slice(0, 160);
            const city = String(data.city || "").trim().slice(0, 120);
            const postcode = String(data.postcode || "").trim().slice(0, 20);
            const landmark = String(data.landmark || "").trim().slice(0, 250);
            const latitude = data.latitude == null || data.latitude === "" ? null : Number(data.latitude);
            const longitude = data.longitude == null || data.longitude === "" ? null : Number(data.longitude);
            if (!label || label.length > 40 || !name || name.length > 100 || !/^[+0-9().\-\s]{6,32}$/.test(phone) ||
                !address || address.length > 500 || !house || !street || !area || !city ||
                latitude === null || longitude === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
                !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
              return json({ error: "Enter an address name (up to 40 characters), complete details and map location" }, 400);
            }
            const duplicate = await env.DB.prepare("SELECT id FROM customer_addresses WHERE google_sub = ? AND lower(label) = lower(?) AND id != ? LIMIT 1")
              .bind(user.google_sub, label, id).first();
            if (duplicate) return json({ error: "You already have an address saved with that label. Edit that one instead." }, 409);
            await env.DB.prepare(`UPDATE customer_addresses SET label = ?, name = ?, phone = ?, address = ?, house = ?, street = ?, area = ?, city = ?, postcode = ?, landmark = ?, latitude = ?, longitude = ?, updated_at = ? WHERE id = ? AND google_sub = ?`)
              .bind(label, name, phone, address, house, street, area, city, postcode, landmark, latitude, longitude, Math.floor(Date.now() / 1000), id, user.google_sub).run();
            return json({ success: true });
          }
          await env.DB.batch([
            env.DB.prepare("UPDATE customer_addresses SET is_default = 0 WHERE google_sub = ?").bind(user.google_sub),
            env.DB.prepare("UPDATE customer_addresses SET is_default = 1, updated_at = ? WHERE id = ? AND google_sub = ?")
              .bind(Math.floor(Date.now() / 1000), id, user.google_sub)
          ]);
          return json({ success: true });
        }

        if (request.method === "DELETE") {
          const id = url.searchParams.get("id") || "";
          await env.DB.prepare("DELETE FROM customer_addresses WHERE id = ? AND google_sub = ?")
            .bind(id, user.google_sub).run();
          let { results } = await env.DB.prepare(`SELECT id FROM customer_addresses
            WHERE google_sub = ? ORDER BY is_default DESC, updated_at DESC`).bind(user.google_sub).all();
          if (results.length && !(await env.DB.prepare("SELECT id FROM customer_addresses WHERE google_sub = ? AND is_default = 1")
              .bind(user.google_sub).first())) {
            await env.DB.prepare("UPDATE customer_addresses SET is_default = 1 WHERE id = ? AND google_sub = ?")
              .bind(results[0].id, user.google_sub).run();
          }
          const refreshed = await env.DB.prepare(`SELECT id, label, name, phone, address, house, street, area, city, postcode, landmark,
            latitude, longitude, is_default FROM customer_addresses
            WHERE google_sub = ? ORDER BY is_default DESC, updated_at DESC`).bind(user.google_sub).all();
          return json({ success: true, addresses: refreshed.results.map(row => ({
            id: row.id, label: row.label, name: row.name, phone: row.phone,
            address: row.address, house: row.house || "", street: row.street || "",
            area: row.area || "", city: row.city || "", postcode: row.postcode || "",
            landmark: row.landmark || "", latitude: row.latitude, longitude: row.longitude,
            is_default: row.is_default === 1
          })) });
        }
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        const token = readSessionToken(request);
        if (token) await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
        return Response.json({ success: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie("", 0) } });
      }

      if (url.pathname === "/api/admin/session" && request.method === "GET") {
        const googleEnabled = env.ADMIN_AUTH_MODE === "google";
        return json({
          googleEnabled,
          clientId: googleEnabled ? env.GOOGLE_CLIENT_ID : undefined,
          signedIn: googleEnabled && await hasAdminAccess(request, env)
        });
      }

      if (
        url.pathname === "/api/admin/login" &&
        request.method === "POST"
      ) {
        return await hasAdminAccess(request, env)
          ? json({ success: true })
          : json({ error: "Incorrect password" }, 401);
      }

      if (url.pathname === "/api/orders" && request.method === "POST") {
        const contentLength = Number(request.headers.get("Content-Length") || 0);
        if (contentLength > 50000) return json({ error: "Order is too large" }, 413);
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid order request" }, 400); }
        if (JSON.stringify(data).length > 50000) return json({ error: "Order is too large" }, 413);
        const validated = normalizeOrder(data);
        if (!validated) return json({ error: "Please check the order details and try again." }, 400);

        const { order, totalAmount } = validated;
        if (!["hub1", "hub2"].includes(order.selectedHub) ||
            (order.selectedHub === "hub2" && order.items.some(item => item.productId !== "Bisleri 20L Can"))) {
          return json({ error: "This delivery hub can fulfil Bisleri 20L cans only. Please update your cart or delivery address." }, 409);
        }
        const existing = await env.DB.prepare("SELECT telegram_status FROM orders WHERE order_id = ?")
          .bind(order.orderId).first();
        if (existing) {
          return json({ success: true, saved: true, duplicate: true, telegramSent: existing.telegram_status === "sent", orderId: order.orderId });
        }
        const pricingError = await validateOrderPricing(order, totalAmount, env);
        if (pricingError) return pricingError;
        const now = Math.floor(Date.now() / 1000);
        const inserted = await env.DB.prepare(`INSERT INTO orders
          (order_id, created_at, customer_name, phone, address, items_json, total_amount, delivery_window, order_json, telegram_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
          ON CONFLICT(order_id) DO NOTHING`)
          .bind(order.orderId, now, order.name, order.phone, order.address,
            JSON.stringify(order.items), Number(order.bill.slice(1)), order.deliveryWindow, JSON.stringify(order)).run();

        if (!inserted.meta?.changes) {
          const existing = await env.DB.prepare("SELECT telegram_status FROM orders WHERE order_id = ?")
            .bind(order.orderId).first();
          if (!existing) return json({ error: "Could not confirm that the order was saved. Please contact the store before retrying." }, 503);
          return json({ success: true, saved: true, duplicate: true, telegramSent: existing.telegram_status === "sent", orderId: order.orderId });
        }

        const telegramSent = await sendSavedOrderNotification(order, url.origin, env);
        return json({ success: true, saved: true, telegramSent, orderId: order.orderId });
      }

      if (url.pathname === "/api/admin/orders/retry-telegram" && request.method === "POST") {
        if (!(await hasAdminAccess(request, env))) return json({ error: "Please log in again" }, 401);
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid retry request" }, 400); }
        const orderId = data?.orderId;
        if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{3,80}$/.test(orderId)) {
          return json({ error: "Enter a valid order reference." }, 400);
        }
        const saved = await env.DB.prepare("SELECT order_json, telegram_status FROM orders WHERE order_id = ?")
          .bind(orderId).first();
        if (!saved) return json({ error: "Order not found." }, 404);
        if (saved.telegram_status !== "failed") return json({ error: "Only failed notifications can be retried." }, 409);
        let order;
        try { order = JSON.parse(saved.order_json); } catch {}
        if (order?.orderId !== orderId) return json({ error: "The saved notification details are unavailable." }, 409);
        const claimed = await env.DB.prepare("UPDATE orders SET telegram_status = 'pending' WHERE order_id = ? AND telegram_status = 'failed'")
          .bind(orderId).run();
        if (!claimed.meta?.changes) return json({ error: "This notification is already being handled." }, 409);
        const telegramSent = await sendSavedOrderNotification(order, url.origin, env);
        return json({ success: true, telegramSent, orderId });
      }

      if (url.pathname === "/api/admin/orders" && request.method === "GET") {
        if (!(await hasAdminAccess(request, env))) return json({ error: "Please log in again" }, 401);
        const query = String(url.searchParams.get("q") || "").trim().slice(0, 120);
        const from = Number(url.searchParams.get("from"));
        const to = Number(url.searchParams.get("to"));
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
        const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
        const clauses = [];
        const values = [];
        if (query) {
          clauses.push("(order_id LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR address LIKE ? OR items_json LIKE ?)");
          const match = `%${query}%`;
          values.push(match, match, match, match, match);
        }
        if (url.searchParams.has("from")) {
          if (!Number.isSafeInteger(from) || from < 0) return json({ error: "Invalid start date" }, 400);
          clauses.push("created_at >= ?");
          values.push(from);
        }
        if (url.searchParams.has("to")) {
          if (!Number.isSafeInteger(to) || to < 0) return json({ error: "Invalid end date" }, 400);
          clauses.push("created_at < ?");
          values.push(to);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM orders ${where}`).bind(...values).first();
        const { results } = await env.DB.prepare(`SELECT order_id, created_at, customer_name, phone, address, items_json,
          total_amount, delivery_window, order_json, telegram_status FROM orders ${where}
          ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset).all();
        return json({
          total: Number(count?.total || 0),
          limit,
          offset,
          orders: results.map(row => {
            let details = {};
            try { details = JSON.parse(row.order_json); } catch {}
            let items = [];
            try { items = JSON.parse(row.items_json); } catch {}
            return {
              orderId: row.order_id,
              createdAt: row.created_at,
              name: row.customer_name,
              phone: row.phone,
              address: row.address,
              items,
              totalAmount: Number(row.total_amount),
              deliveryWindow: row.delivery_window,
              telegramStatus: row.telegram_status,
              details
            };
          })
        });
      }

      if (url.pathname === "/api/catalog" && request.method === "GET") {
        const {results}=await env.DB.prepare("SELECT id,name,brand,description,category,unit_label,selling_price,mrp,case_qty FROM custom_products ORDER BY sort_order,created_at").all();
        return json({products:results.map(r=>({id:r.id,name:r.name,brand:r.brand,description:r.description,category:r.category,unitLabel:r.unit_label,price:Number(r.selling_price),mrp:Number(r.mrp),caseQty:r.case_qty==null?null:Number(r.case_qty)}))});
      }
      if(url.pathname.startsWith("/api/product-image/")&&request.method==="GET"){
        const id=decodeURIComponent(url.pathname.slice("/api/product-image/".length));
        const row=await env.DB.prepare("SELECT image_mime,image_data FROM custom_products WHERE id=?").bind(id).first();
        if(!row)return new Response("Not found",{status:404});
        return new Response(Uint8Array.from(atob(row.image_data),c=>c.charCodeAt(0)),{headers:{"Content-Type":row.image_mime,"Cache-Control":"public,max-age=3600","X-Content-Type-Options":"nosniff"}});
      }
      if(url.pathname==="/api/admin/products"&&request.method==="GET"){
        if(!(await hasAdminAccess(request,env)))return json({error:"Please log in again"},401);
        const {results}=await env.DB.prepare("SELECT id,name,brand,description,category,unit_label,selling_price,mrp,case_qty,available FROM custom_products ORDER BY sort_order,created_at").all();
        return json({products:results.map(r=>({id:r.id,name:r.name,brand:r.brand,description:r.description,category:r.category,unitLabel:r.unit_label,price:Number(r.selling_price),mrp:Number(r.mrp),caseQty:r.case_qty==null?null:Number(r.case_qty),available:r.available===1}))});
      }
      if(url.pathname==="/api/admin/products"&&request.method==="POST"){
        if(!(await hasAdminAccess(request,env)))return json({error:"Please log in again"},401);
        let d;try{d=await request.json();}catch{return json({error:"Invalid request"},400);}
        const name=String(d.name||"").trim(),brand=String(d.brand||"").trim(),description=String(d.description||"").trim(),category=String(d.category||""),unit=String(d.unitLabel||"").trim();
        const price=Number(d.sellingPrice),mrp=Number(d.mrp),caseQty=d.caseQty==null||d.caseQty===""?null:Number(d.caseQty),mime=String(d.imageMime||""),image=String(d.imageData||"");
        if(!name||name.length>100||!brand||brand.length>80||!description||description.length>1000||!["water","accessories"].includes(category)||!unit||unit.length>30||!Number.isFinite(price)||!Number.isFinite(mrp)||price<0||mrp<0||price>1e6||mrp>1e6||(caseQty!==null&&(!Number.isInteger(caseQty)||caseQty<1||caseQty>500))||!["image/png","image/jpeg","image/webp"].includes(mime)||!/^[A-Za-z0-9+/]+={0,2}$/.test(image)||image.length>1400000)return json({error:"Complete all fields and upload a PNG, JPG or WebP image up to 1 MB."},400);
        const id="custom-"+crypto.randomUUID();
        try{await env.DB.prepare("INSERT INTO custom_products(id,name,brand,description,category,unit_label,selling_price,mrp,case_qty,image_mime,image_data,sort_order,available,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,1000,1,?)").bind(id,name,brand,description,category,unit,Math.round(price*100)/100,Math.round(mrp*100)/100,caseQty,mime,image,Math.floor(Date.now()/1000)).run();}
        catch(e){if(String(e).includes("UNIQUE"))return json({error:"A product with this name already exists."},409);throw e;}
        return json({success:true,id});
      }
      if (url.pathname === "/api/prices" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT product_id, selling_price, mrp FROM product_prices"
        ).all();
        const prices = Object.fromEntries(
          Object.entries(DEFAULT_PRODUCT_PRICES).map(([id, value]) => [id, { ...value }])
        );
        for (const row of results) {
          if (PRODUCT_IDS.has(row.product_id)) {
            prices[row.product_id] = {
              sellingPrice: Number(row.selling_price),
              mrp: Number(row.mrp)
            };
          }
        }
        const custom=await env.DB.prepare("SELECT id,selling_price,mrp FROM custom_products").all();
        for(const r of custom.results)prices[r.id]={sellingPrice:Number(r.selling_price),mrp:Number(r.mrp)};
        return json({ prices });
      }

      if (url.pathname === "/api/prices" && request.method === "PUT") {
        if (!(await hasAdminAccess(request, env))) {
          return json({ error: "Please log in again" }, 401);
        }
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
        const id = String(data.id || "");
        const sellingPrice = Number(data.sellingPrice);
        const mrp = Number(data.mrp);
        const custom=await env.DB.prepare("SELECT id FROM custom_products WHERE id=?").bind(id).first();
        if((!PRODUCT_IDS.has(id)&&!custom)||!Number.isFinite(sellingPrice)||!Number.isFinite(mrp)||sellingPrice<0||mrp<0||sellingPrice>1e6||mrp>1e6)return json({error:"Enter a valid product, selling price and MRP"},400);
        if(custom){await env.DB.prepare("UPDATE custom_products SET selling_price=?,mrp=? WHERE id=?").bind(Math.round(sellingPrice*100)/100,Math.round(mrp*100)/100,id).run();return json({success:true});}
        await env.DB.prepare(`
          INSERT INTO product_prices (product_id, selling_price, mrp, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            selling_price = excluded.selling_price,
            mrp = excluded.mrp,
            updated_at = excluded.updated_at
        `).bind(id, Math.round(sellingPrice * 100) / 100, Math.round(mrp * 100) / 100, Math.floor(Date.now() / 1000)).run();
        return json({ success: true });
      }

      if (
        url.pathname === "/api/stock" &&
        request.method === "GET"
      ) {
        const { results } = await env.DB.prepare(
          "SELECT product_id, available FROM product_stock"
        ).all();

        const stock = Object.fromEntries(
          [...PRODUCT_IDS].map(id => [id, true])
        );

        for(const r of results)if(PRODUCT_IDS.has(r.product_id))stock[r.product_id]=r.available===1;
        const custom=await env.DB.prepare("SELECT id,available FROM custom_products").all();
        for(const r of custom.results)stock[r.id]=r.available===1;
        return json({stock});
      }

      if (
        url.pathname === "/api/stock" &&
        request.method === "PUT"
      ) {
        if (!(await hasAdminAccess(request, env))) {
          return json({ error: "Please log in again" }, 401);
        }

        let data;

        try {
          data = await request.json();
        } catch {
          return json({ error: "Invalid request" }, 400);
        }

        const custom=await env.DB.prepare("SELECT id FROM custom_products WHERE id=?").bind(String(data.id||"")).first();
        if((!PRODUCT_IDS.has(data.id)&&!custom)||typeof data.available!=="boolean")return json({error:"Invalid product or stock status"},400);
        if(custom){await env.DB.prepare("UPDATE custom_products SET available=? WHERE id=?").bind(data.available?1:0,data.id).run();return json({success:true});}

        await env.DB.prepare(`
          INSERT INTO product_stock (product_id, available)
          VALUES (?, ?)
          ON CONFLICT(product_id)
          DO UPDATE SET available = excluded.available
        `).bind(
          data.id,
          data.available ? 1 : 0
        ).run();

        return json({ success: true });
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Worker request failed:", error);
      return json({ error: url.pathname === "/api/orders"
        ? "Order could not be saved. Please try again or call the store before placing another order."
        : "Stock service unavailable" }, 503);
    }
  }
};
