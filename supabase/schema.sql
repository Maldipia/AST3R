-- ============================================================
-- AST3R FASHION — QR Retail System
-- Supabase Schema v1.0
-- Run this in: Supabase → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku         TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  description TEXT,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency    TEXT        DEFAULT 'PHP',
  image_url   TEXT,
  category    TEXT,
  status      TEXT        DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_sku    ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- ============================================================
-- INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku        TEXT        REFERENCES products(sku) ON DELETE CASCADE,
  quantity   INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sku_unique ON inventory(sku);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_code     TEXT        UNIQUE NOT NULL,
  customer_name  TEXT        NOT NULL,
  contact_number TEXT        NOT NULL,
  email          TEXT,
  address_full   TEXT        NOT NULL,
  notes          TEXT,
  total_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  status         TEXT        DEFAULT 'pending'
                             CHECK (status IN ('pending','paid','shipped','cancelled')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_code   ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ============================================================
-- ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID        REFERENCES orders(id) ON DELETE CASCADE,
  sku      TEXT        REFERENCES products(sku),
  quantity INTEGER     NOT NULL DEFAULT 1,
  price    NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID        REFERENCES orders(id) ON DELETE CASCADE,
  payment_method    TEXT        NOT NULL CHECK (payment_method IN ('GCash','bank','COD')),
  payment_proof_url TEXT,
  status            TEXT        DEFAULT 'pending'
                                CHECK (status IN ('pending','verified','rejected')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

-- ============================================================
-- QR LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS qr_links (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku          TEXT        REFERENCES products(sku) ON DELETE CASCADE,
  qr_url       TEXT        NOT NULL,
  scans        INTEGER     DEFAULT 0,
  last_scanned TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_links_sku ON qr_links(sku);

-- ============================================================
-- ADMIN PROFILES (linked to Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_profiles (
  id         UUID  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT  NOT NULL,
  role       TEXT  DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated  ON products;
DROP TRIGGER IF EXISTS trg_inventory_updated ON inventory;

CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_inventory_updated
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ============================================================
-- FUNCTION: generate unique order code
-- ============================================================
CREATE OR REPLACE FUNCTION generate_order_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'AST-';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random()*length(chars)+1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: get product with inventory (single query)
-- ============================================================
CREATE OR REPLACE FUNCTION get_product_with_stock(p_sku TEXT)
RETURNS TABLE(
  id          UUID,
  sku         TEXT,
  name        TEXT,
  description TEXT,
  price       NUMERIC,
  currency    TEXT,
  image_url   TEXT,
  category    TEXT,
  status      TEXT,
  quantity    INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.sku, p.name, p.description,
    p.price, p.currency, p.image_url, p.category, p.status,
    COALESCE(inv.quantity, 0) as quantity
  FROM products p
  LEFT JOIN inventory inv ON p.sku = inv.sku
  WHERE p.sku = p_sku AND p.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: decrement inventory on order
-- ============================================================
CREATE OR REPLACE FUNCTION decrement_inventory(p_sku TEXT, p_qty INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE inventory
  SET quantity = quantity - p_qty
  WHERE sku = p_sku AND quantity >= p_qty;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock for SKU: %', p_sku;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: increment QR scan count
-- ============================================================
CREATE OR REPLACE FUNCTION track_qr_scan(p_sku TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE qr_links
  SET scans = scans + 1, last_scanned = NOW()
  WHERE sku = p_sku;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
