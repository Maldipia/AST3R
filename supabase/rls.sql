-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- Run AFTER schema.sql
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: is_admin() function
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PRODUCTS — public read, admin write
-- ============================================================
DROP POLICY IF EXISTS "products_public_read"  ON products;
DROP POLICY IF EXISTS "products_admin_all"    ON products;

CREATE POLICY "products_public_read" ON products
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

CREATE POLICY "products_admin_all" ON products
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- INVENTORY — public read, admin write
-- ============================================================
DROP POLICY IF EXISTS "inventory_public_read" ON inventory;
DROP POLICY IF EXISTS "inventory_admin_all"   ON inventory;

CREATE POLICY "inventory_public_read" ON inventory
  FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY "inventory_admin_all" ON inventory
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- ORDERS — anyone can insert, admin can read/update all
-- ============================================================
DROP POLICY IF EXISTS "orders_public_insert"     ON orders;
DROP POLICY IF EXISTS "orders_admin_all"         ON orders;

CREATE POLICY "orders_public_insert" ON orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (TRUE);

CREATE POLICY "orders_admin_all" ON orders
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- ORDER ITEMS — anyone can insert
-- ============================================================
DROP POLICY IF EXISTS "order_items_public_insert" ON order_items;
DROP POLICY IF EXISTS "order_items_admin_all"     ON order_items;

CREATE POLICY "order_items_public_insert" ON order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (TRUE);

CREATE POLICY "order_items_admin_all" ON order_items
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- PAYMENTS — anyone can insert, admin can manage
-- ============================================================
DROP POLICY IF EXISTS "payments_public_insert" ON payments;
DROP POLICY IF EXISTS "payments_admin_all"     ON payments;

CREATE POLICY "payments_public_insert" ON payments
  FOR INSERT TO anon, authenticated
  WITH CHECK (TRUE);

CREATE POLICY "payments_admin_all" ON payments
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- QR LINKS — public read
-- ============================================================
DROP POLICY IF EXISTS "qr_public_read" ON qr_links;
DROP POLICY IF EXISTS "qr_admin_all"   ON qr_links;

CREATE POLICY "qr_public_read" ON qr_links
  FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY "qr_admin_all" ON qr_links
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- ADMIN PROFILES — admin only
-- ============================================================
DROP POLICY IF EXISTS "admin_profiles_self" ON admin_profiles;

CREATE POLICY "admin_profiles_self" ON admin_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- ============================================================
-- STORAGE BUCKET: payment-proofs
-- Run in Supabase → Storage → Create bucket "payment-proofs" (public: false)
-- Then run these policies:
-- ============================================================

-- NOTE: Create bucket manually in Supabase dashboard named "payment-proofs"
-- Then run:

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "payment_proofs_upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'payment-proofs');

CREATE POLICY "payment_proofs_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND is_admin());

-- ============================================================
-- STORAGE BUCKET: product-images
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY "product_images_admin_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND is_admin());
