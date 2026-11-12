-- Custom catalogue products and uploaded product images. Existing records are untouched.
CREATE TABLE IF NOT EXISTS custom_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('water','accessories')),
  unit_label TEXT NOT NULL,
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  mrp REAL NOT NULL CHECK (mrp >= 0),
  case_qty INTEGER,
  image_mime TEXT NOT NULL,
  image_data TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),
  created_at INTEGER NOT NULL
);
