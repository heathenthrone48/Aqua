CREATE TABLE IF NOT EXISTS product_stock (
  product_id TEXT PRIMARY KEY,
  available INTEGER NOT NULL DEFAULT 1
    CHECK (available IN (0, 1))
);