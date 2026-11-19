CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  items_json TEXT NOT NULL,
  total_amount REAL NOT NULL,
  delivery_window TEXT NOT NULL,
  order_json TEXT NOT NULL,
  telegram_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (telegram_status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
