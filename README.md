# NEER BEKUUU site

Keep these files together in the repository root. Put the existing product and banner images in `images/` with the exact filenames referenced by `index.html` in each `data-images` list. No images were included in the supplied files.

- `index.html`: storefront markup and product data (names, prices, image paths).
- `styles.css`: storefront styles, including mobile layout.
- `app.js`: storefront behavior (carousels, cart, modal, checkout).
- `admin.html`, `admin.css`, `admin.js`: admin markup, styling, and behavior.
- `wrangler.jsonc`: existing Cloudflare static-assets configuration.

Deploy all files together. The existing checkout submits to the separate `water-order-sms` Worker URL defined in `app.js`. The admin page uses browser-local storage for stock and order logs, as in the supplied code. The footer link does not secure the admin page; the admin password is in `admin.js`.

To preview locally, run a static server from this directory (for example, `python3 -m http.server 8000`) and open `http://localhost:8000/`.
