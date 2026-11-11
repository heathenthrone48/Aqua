CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL REFERENCES auth_users(google_sub) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Delivery address',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  house TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL DEFAULT '',
  landmark TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user
  ON customer_addresses(google_sub, is_default, updated_at);
