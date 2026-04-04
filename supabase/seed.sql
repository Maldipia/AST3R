-- ============================================================
-- SEED DATA — AST3R Fashion Sample Products
-- Run AFTER schema.sql and rls.sql
-- ============================================================

-- ============================================================
-- SAMPLE PRODUCTS (AST3R Fashion)
-- ============================================================
INSERT INTO products (sku, name, description, price, currency, image_url, category, status)
VALUES
  ('AST-TOP-001',
   'Structured Linen Blazer',
   'Effortlessly elevated, this oversized linen blazer redefines the art of casual sophistication. Crafted from breathable premium linen, it features structured shoulders, a relaxed silhouette, and clean seams that hold their form. Perfect for your Monday meetings or weekend markets.',
   2850.00, 'PHP',
   'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800',
   'Tops', 'active'),

  ('AST-TOP-002',
   'Ribbed Seamless Tank',
   'The foundation of every elevated wardrobe. Our seamless ribbed tank is cut from a four-way stretch fabric blend that moves with you. Available in three neutral tones, it layers beautifully under blazers or stands alone with high-waisted trousers.',
   680.00, 'PHP',
   'https://images.unsplash.com/photo-1554568218-0f1715e72254?w=800',
   'Tops', 'active'),

  ('AST-BTM-001',
   'Wide Leg Crepe Trousers',
   'The statement trouser your wardrobe has been waiting for. Cut from fluid crepe in a wide-leg silhouette, these trousers drape beautifully and feel like wearing air. The elastic waistband ensures all-day comfort without compromising the tailored aesthetic.',
   1980.00, 'PHP',
   'https://images.unsplash.com/photo-1594938298603-c8148c4b984e?w=800',
   'Bottoms', 'active'),

  ('AST-BTM-002',
   'Cargo Utility Skirt',
   'Utility meets luxury in this season''s standout piece. Low-rise, midi-length, with deep side pockets and subtle cargo detailing. Crafted from heavyweight cotton twill that holds its structure while remaining breathable in the Manila heat.',
   1650.00, 'PHP',
   'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=800',
   'Bottoms', 'active'),

  ('AST-DRS-001',
   'Minimal Slip Dress',
   'Whisper-light and effortlessly chic, this bias-cut slip dress is crafted from satin-touch fabric that catches the light beautifully. Adjustable spaghetti straps, a cowl neckline, and an ankle-grazing hem. Wear it day or night — just change your shoes.',
   2200.00, 'PHP',
   'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800',
   'Dresses', 'active'),

  ('AST-ACC-001',
   'Woven Tote Bag',
   'A daily essential elevated to art. Our woven tote is hand-crafted from natural seagrass with leather handle accents. Spacious enough for your laptop and your life, structured enough to hold its shape when set down.',
   1450.00, 'PHP',
   'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800',
   'Accessories', 'active')

ON CONFLICT (sku) DO NOTHING;

-- ============================================================
-- INVENTORY
-- ============================================================
INSERT INTO inventory (sku, quantity)
VALUES
  ('AST-TOP-001', 25),
  ('AST-TOP-002', 50),
  ('AST-BTM-001', 30),
  ('AST-BTM-002', 18),
  ('AST-DRS-001', 12),
  ('AST-ACC-001', 40)
ON CONFLICT DO NOTHING;

-- ============================================================
-- QR LINKS (update domain when deployed)
-- ============================================================
INSERT INTO qr_links (sku, qr_url, scans)
VALUES
  ('AST-TOP-001', 'https://yourdomain.com/p/AST-TOP-001', 0),
  ('AST-TOP-002', 'https://yourdomain.com/p/AST-TOP-002', 0),
  ('AST-BTM-001', 'https://yourdomain.com/p/AST-BTM-001', 0),
  ('AST-BTM-002', 'https://yourdomain.com/p/AST-BTM-002', 0),
  ('AST-DRS-001', 'https://yourdomain.com/p/AST-DRS-001', 0),
  ('AST-ACC-001', 'https://yourdomain.com/p/AST-ACC-001', 0)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SAMPLE ORDER (for testing admin panel)
-- ============================================================
INSERT INTO orders (order_code, customer_name, contact_number, email, address_full, notes, total_amount, status)
VALUES (
  'AST-TESTX001',
  'Pia Reyes',
  '09661234567',
  'test@ast3r.store',
  '123 Tagaytay Road, Tagaytay City, Cavite 4120',
  'Please pack carefully.',
  2850.00,
  'pending'
) ON CONFLICT DO NOTHING;

INSERT INTO order_items (order_id, sku, quantity, price)
SELECT o.id, 'AST-TOP-001', 1, 2850.00
FROM orders o WHERE o.order_code = 'AST-TESTX001'
ON CONFLICT DO NOTHING;

INSERT INTO payments (order_id, payment_method, status)
SELECT o.id, 'GCash', 'pending'
FROM orders o WHERE o.order_code = 'AST-TESTX001'
ON CONFLICT DO NOTHING;

-- ============================================================
-- CREATE ADMIN USER (run AFTER creating user in Supabase Auth)
-- Replace 'YOUR-ADMIN-UUID' with actual UUID from auth.users
-- ============================================================
-- INSERT INTO admin_profiles (id, email, role)
-- VALUES ('YOUR-ADMIN-UUID', 'admin@ast3r.store', 'admin')
-- ON CONFLICT DO NOTHING;
