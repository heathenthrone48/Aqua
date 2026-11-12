const MAINTENANCE_HTML = "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>NeerBeku — Opening Soon</title><style>\n*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:24px;background:#edf7fc;color:#12364d;font-family:Arial,sans-serif}main{max-width:560px;width:100%;text-align:center;background:#fff;padding:56px 28px;border-radius:24px;box-shadow:0 16px 60px #12364d12}.brand{font-size:30px;font-weight:800;color:#087eaf;margin:0 0 40px}.tag{font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#087eaf}h1{font-size:clamp(30px,7vw,44px);margin:16px 0 24px;line-height:1.1}p{font-size:17px;line-height:1.7;color:#506b7b;margin:12px 0}.thanks{font-size:14px;margin-top:32px}\n</style></head><body><main><div class=\"brand\">NeerBeku</div><div class=\"tag\">Opening soon</div><h1>We’re getting ready<br>to begin deliveries.</h1><p>We’re temporarily not accepting orders.</p><p>Please check back later for updates.</p><p class=\"thanks\">Thank you for your patience.</p></main></body></html>";

const PRODUCT_IDS = new Set([
  "Bisleri 20L Can",
  "Bisleri 10L Can",
  "Bisleri 5L Bottle",
  "Bisleri 2L Bottle",
  "Bisleri 1L Bottle",
  "Bailley 10L Can",
  "Bailley 5L Can",
  "Bailley 2L Bottle",
  "Bailley 1L Bottle",
  "Kinley 2L Bottle",
  "Kinley 1L Bottle",
  "Manual Water Dispenser Hand Pump",
  "Automatic Electric Water Dispenser Pump"
]);

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (env.MAINTENANCE_MODE === "true") {
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
          const { results } = await env.DB.prepare(`SELECT id, label, name, phone, address, landmark,
            latitude, longitude, is_default FROM customer_addresses
            WHERE google_sub = ? ORDER BY is_default DESC, updated_at DESC`).bind(user.google_sub).all();
          return json({ addresses: results.map(row => ({
            id: row.id, label: row.label, name: row.name, phone: row.phone,
            address: row.address, landmark: row.landmark || "",
            latitude: row.latitude, longitude: row.longitude,
            is_default: row.is_default === 1
          })) });
        }

        if (request.method === "POST") {
          let data;
          try { data = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
          const label = String(data.label || "Delivery address").trim().slice(0, 40);
          const name = String(data.name || "").trim();
          const phone = String(data.phone || "").trim();
          const address = String(data.address || "").trim();
          const landmark = String(data.landmark || "").trim().slice(0, 250);
          const latitude = data.latitude == null || data.latitude === "" ? null : Number(data.latitude);
          const longitude = data.longitude == null || data.longitude === "" ? null : Number(data.longitude);
          if (!name || name.length > 100 || !/^[+0-9().\-\s]{6,32}$/.test(phone) ||
              !address || address.length > 500 ||
              (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
              (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
            return json({ error: "Enter a valid name, mobile number, and delivery address" }, 400);
          }
          const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM customer_addresses WHERE google_sub = ?")
            .bind(user.google_sub).first();
          if (count.count >= 10) return json({ error: "You can save up to 10 delivery addresses" }, 400);

          const id = crypto.randomUUID();
          const now = Math.floor(Date.now() / 1000);
          await env.DB.batch([
            env.DB.prepare("UPDATE customer_addresses SET is_default = 0 WHERE google_sub = ?").bind(user.google_sub),
            env.DB.prepare(`INSERT INTO customer_addresses
              (id, google_sub, label, name, phone, address, landmark, latitude, longitude, is_default, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
              .bind(id, user.google_sub, label || "Delivery address", name, phone, address, landmark, latitude, longitude, now, now)
          ]);
          const refreshed = await env.DB.prepare(`SELECT id, label, name, phone, address, landmark,
            latitude, longitude, is_default FROM customer_addresses
            WHERE google_sub = ? ORDER BY is_default DESC, updated_at DESC`).bind(user.google_sub).all();
          return json({ success: true, id, addresses: refreshed.results.map(row => ({
            id: row.id, label: row.label, name: row.name, phone: row.phone,
            address: row.address, landmark: row.landmark || "",
            latitude: row.latitude, longitude: row.longitude,
            is_default: row.is_default === 1
          })) });
        }

        if (request.method === "PUT") {
          let data;
          try { data = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
          const id = String(data.id || "");
          const owned = await env.DB.prepare("SELECT id FROM customer_addresses WHERE id = ? AND google_sub = ?")
            .bind(id, user.google_sub).first();
          if (!owned) return json({ error: "Saved address not found" }, 404);
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
          const refreshed = await env.DB.prepare(`SELECT id, label, name, phone, address, landmark,
            latitude, longitude, is_default FROM customer_addresses
            WHERE google_sub = ? ORDER BY is_default DESC, updated_at DESC`).bind(user.google_sub).all();
          return json({ success: true, addresses: refreshed.results.map(row => ({
            id: row.id, label: row.label, name: row.name, phone: row.phone,
            address: row.address, landmark: row.landmark || "",
            latitude: row.latitude, longitude: row.longitude,
            is_default: row.is_default === 1
          })) });
        }
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        const token = readSessionToken(request);
        if (token) await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
        return Response.json({ success: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie("", 0) } });
      }

      if (
        url.pathname === "/api/admin/login" &&
        request.method === "POST"
      ) {
        return await validPassword(request, env)
          ? json({ success: true })
          : json({ error: "Incorrect password" }, 401);
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

        for (const row of results) {
          if (PRODUCT_IDS.has(row.product_id)) {
            stock[row.product_id] = row.available === 1;
          }
        }

        return json({ stock });
      }

      if (
        url.pathname === "/api/stock" &&
        request.method === "PUT"
      ) {
        if (!(await validPassword(request, env))) {
          return json({ error: "Please log in again" }, 401);
        }

        let data;

        try {
          data = await request.json();
        } catch {
          return json({ error: "Invalid request" }, 400);
        }

        if (
          !PRODUCT_IDS.has(data.id) ||
          typeof data.available !== "boolean"
        ) {
          return json({ error: "Invalid product or stock status" }, 400);
        }

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
    } catch {
      return json({ error: "Stock service unavailable" }, 503);
    }
  }
};
