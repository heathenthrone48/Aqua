# 💧 NEER BEKUUU

A simple online store for ordering packaged drinking water (cans, bottles and dispensers), with an admin panel to control what's in stock.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Database-D1-F38020?logo=cloudflare&logoColor=white)
![HTML/CSS/JS](https://img.shields.io/badge/Built%20with-HTML%20%7C%20CSS%20%7C%20JS-1572B6)

## What it does

**For customers**
- Browse products with image carousels and prices
- Add to cart and place an order from their phone
- See live availability, so out-of-stock items update within about 10 seconds

**For the owner (admin panel)**
- Log in with a password
- Mark any product In Stock or Out of Stock with one click
- Changes are saved online and show up on every device
- See recent order submissions

## Products

| Brand | Items |
|-------|-------|
| Bisleri | 20L, 10L, 5L, 2L, 1L |
| Bailley | 10L, 5L, 2L, 1L |
| Kinley | 2L, 1L |
| Accessories | Hand pump dispenser, electric water pump |

## What's in the project

| File | What it's for |
|------|---------------|
| `index.html`, `styles.css`, `app.js` | The customer storefront |
| `admin.html`, `admin.css`, `admin.js` | The admin panel |
| `worker.js` | The server side: login, stock API and serving the site |
| `schema.sql` | The database table for stock |
| `wrangler.jsonc` | Cloudflare settings |

## How it fits together

```
Customer / Admin  ->  Cloudflare Worker  ->  D1 database (stock)
                            |
                            +-> serves the website files
```

Checkout orders are sent to a separate Worker (`water-order-sms`) that handles notifications.

## Notes

- The admin order log is stored in the browser, so it only shows orders from that same device.
- The admin password is stored as a Cloudflare secret, not in the code.
