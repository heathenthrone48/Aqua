-- Additive migration for centrally managed product prices.
-- Run against the user's neer-beku-staging D1 database before using the Admin price editor.
CREATE TABLE IF NOT EXISTS product_prices (
  product_id TEXT PRIMARY KEY,
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  mrp REAL NOT NULL CHECK (mrp >= 0),
  updated_at INTEGER NOT NULL
);
