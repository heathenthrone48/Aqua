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