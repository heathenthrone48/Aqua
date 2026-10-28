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