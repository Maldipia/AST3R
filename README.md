# AST3R Fashion — QR Retail System
### Complete Setup & Deployment Guide

**Version:** 1.0.0  
**Stack:** Next.js 14 · Supabase · Vercel  
**Brand:** AST3R Fashion — Tagaytay City, Philippines

---

## 🗂️ Project Structure

```
ast3r-qr-system/
├── supabase/
│   ├── schema.sql          ← Run first: tables, functions, triggers
│   ├── rls.sql             ← Run second: Row Level Security
│   └── seed.sql            ← Run third: sample products & data
├── src/
│   ├── app/
│   │   ├── page.tsx                        ← Homepage / storefront
│   │   ├── p/[sku]/page.tsx                ← Product page (QR landing)
│   │   ├── p/[sku]/OrderButton.tsx         ← Client: add to cart
│   │   ├── p/[sku]/QRDownload.tsx          ← Client: QR viewer
│   │   ├── checkout/page.tsx               ← Step 1: customer details
│   │   ├── payment/page.tsx                ← Step 2: payment
│   │   ├── confirmation/[orderCode]/page.tsx ← Step 3: order confirmed
│   │   └── admin/
│   │       ├── page.tsx                    ← Full admin dashboard
│   │       └── login/page.tsx              ← Admin login
│   ├── components/
│   │   └── Header.tsx
│   └── lib/
│       ├── supabase.ts     ← Supabase client + types
│       └── utils.ts        ← Helpers, formatters, constants
├── .env.example
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vercel.json
```

---

## 🚀 PHASE 1 — Supabase Setup

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name: `ast3r-fashion`
3. Database Password: Save this securely
4. Region: `Southeast Asia (Singapore)` — closest to PH

### Step 2: Run SQL Scripts
In Supabase → **SQL Editor** → **New Query**, run these **in order**:

```
1. supabase/schema.sql   ← All tables + functions
2. supabase/rls.sql      ← Security policies + storage buckets
3. supabase/seed.sql     ← Sample products + test order
```

### Step 3: Create Admin User
1. Supabase → **Authentication** → **Users** → **Add User**
2. Email: `admin@ast3r.store`
3. Password: `YourSecurePassword123!`
4. Copy the UUID from the user record

Then run this SQL (replace with real UUID):
```sql
INSERT INTO admin_profiles (id, email, role)
VALUES ('PASTE-UUID-HERE', 'admin@ast3r.store', 'admin');
```

### Step 4: Get API Keys
Supabase → **Project Settings** → **API**:
- `Project URL`           → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public`           → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role secret`   → `SUPABASE_SERVICE_ROLE_KEY`

---

## 🔧 PHASE 2 — Local Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
# Clone / download the project
cd ast3r-qr-system

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your actual values

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_BRAND_NAME=AST3R Fashion
NEXT_PUBLIC_BRAND_EMAIL=inquiry@ast3r.store
NEXT_PUBLIC_BRAND_PHONE=0966 960 6060

NEXT_PUBLIC_GCASH_NUMBER=09XXXXXXXXX
NEXT_PUBLIC_GCASH_NAME=AST3R Fashion
NEXT_PUBLIC_BANK_NAME=BDO
NEXT_PUBLIC_BANK_ACCOUNT_NAME=AST3R Fashion
NEXT_PUBLIC_BANK_ACCOUNT_NUMBER=0000-0000-0000
```

---

## 🌐 PHASE 3 — Vercel Deployment

### Option A: GitHub (Recommended)
```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourname/ast3r-qr
git push -u origin main

# 2. Go to vercel.com → New Project → Import from GitHub
# 3. Add all environment variables
# 4. Deploy
```

### Option B: Vercel CLI
```bash
npm i -g vercel
vercel login
vercel --prod
# Follow prompts, add env vars in dashboard
```

### After Deployment
1. Copy your production URL (e.g., `https://ast3r.vercel.app`)
2. Update `NEXT_PUBLIC_APP_URL` in Vercel dashboard
3. Update `qr_links` table with production URL:
```sql
UPDATE qr_links
SET qr_url = REPLACE(qr_url, 'https://yourdomain.com', 'https://your-real-domain.com');
```

### Custom Domain (ast3r.store)
1. Vercel → Project → Settings → Domains
2. Add `ast3r.store` and `www.ast3r.store`
3. Update DNS in your domain registrar

---

## 🧪 TEST CASES

### Test 1: Product Page via QR
```
URL: http://localhost:3000/p/AST-TOP-001
Expected: Product page loads with image, price ₱2,850, "In Stock"
```

### Test 2: Full Order Flow (GCash)
```
1. Go to /p/AST-TOP-001
2. Click "Order Now"
3. Fill: Name = "Test Customer", Phone = "09123456789"
         Address = "123 Test St, Tagaytay City, Cavite"
4. Click "Proceed to Payment"
5. Select GCash → Upload any screenshot image
6. Click "Submit Payment & Place Order"
7. Should redirect to /confirmation/AST-XXXXXXXX
```

### Test 3: COD Order
```
1. Repeat Test 2 but select COD
2. No proof upload required
3. Should complete successfully
```

### Test 4: Admin Panel
```
URL: http://localhost:3000/admin
Login: admin@ast3r.store / YourSecurePassword123!

Test:
- View orders → find test order
- Verify payment → status changes to "verified"
- Update order status → "shipped"
- Edit product price → save
- Update inventory → save
- Download QR code
```

### Test 5: Out of Stock Validation
```sql
-- Set stock to 0
UPDATE inventory SET quantity = 0 WHERE sku = 'AST-BTM-002';
```
```
Go to /p/AST-BTM-002
Expected: "Out of Stock" button, cannot order
```

### Test 6: Invalid SKU
```
URL: http://localhost:3000/p/FAKE-SKU-999
Expected: 404 page "Product Not Found"
```

---

## 📋 DATABASE TABLES

| Table           | Purpose                        |
|-----------------|-------------------------------|
| `products`      | Product catalog                |
| `inventory`     | Stock per SKU                  |
| `orders`        | Customer orders                |
| `order_items`   | Line items per order           |
| `payments`      | Payment records + proof URLs   |
| `qr_links`      | QR URLs + scan tracking        |
| `admin_profiles`| Admin user access control      |

---

## 🔒 SECURITY MODEL

| Action                  | Who Can Do It         |
|-------------------------|-----------------------|
| View active products    | Anyone (public)       |
| View inventory          | Anyone (public)       |
| Place an order          | Anyone (public)       |
| Upload payment proof    | Anyone (public)       |
| Update order status     | Admin only            |
| Verify payments         | Admin only            |
| Edit products           | Admin only            |
| Update inventory        | Admin only            |
| View payment proofs     | Admin only            |

---

## 🛒 ORDER FLOW

```
QR Code Scan
    ↓
/p/[sku] — Product Page
    ↓ "Order Now"
/checkout — Customer Details Form
    ↓ "Proceed to Payment"
/payment — Method Selection + Proof Upload
    ↓ "Submit Order"
    ├─ Save to Supabase (orders, order_items, payments)
    ├─ Upload proof to Storage
    └─ Decrement inventory
    ↓
/confirmation/[orderCode] — Success Page

Admin:
/admin → Orders tab → Verify payment → Update status
```

---

## 📲 QR CODE MANAGEMENT

Each SKU gets a QR code pointing to:
```
https://yourdomain.com/p/{SKU}
```

**Generate / Download QR:**
- Admin panel → QR Codes tab → Download button
- Or on any product page → "View QR Code"

**For print tags:** Download 600×600px PNG from admin → print on tags

**Scan tracking:** Every page load increments `qr_links.scans`

---

## 🎨 DESIGN SYSTEM

| Token          | Value       | Usage                    |
|----------------|-------------|--------------------------|
| `--black`      | `#0A0A0A`   | Text, buttons            |
| `--white`      | `#FAFAF8`   | Backgrounds              |
| `--cream`      | `#F2F0EC`   | Cards, sections          |
| `--gray`       | `#8A8A8A`   | Secondary text           |
| `--orange`     | `#E8571A`   | Accents, CTAs, borders   |
| `--light`      | `#D4D4CF`   | Borders, dividers        |

**Fonts:**
- Headings: Cormorant Garamond (editorial serif)
- Body: DM Sans (clean, readable)

---

## 🔑 TEST CREDENTIALS

| Role  | Email                | Password              |
|-------|----------------------|-----------------------|
| Admin | admin@ast3r.store    | YourSecurePassword123! |

**Sample SKUs for testing:**
```
AST-TOP-001  — Structured Linen Blazer     ₱2,850
AST-TOP-002  — Ribbed Seamless Tank        ₱680
AST-BTM-001  — Wide Leg Crepe Trousers     ₱1,980
AST-BTM-002  — Cargo Utility Skirt         ₱1,650
AST-DRS-001  — Minimal Slip Dress          ₱2,200
AST-ACC-001  — Woven Tote Bag              ₱1,450
```

**Test QR URLs:**
```
http://localhost:3000/p/AST-TOP-001
http://localhost:3000/p/AST-DRS-001
http://localhost:3000/p/AST-ACC-001
```

---

## 🚨 TROUBLESHOOTING

**"No items in cart" on checkout:**
→ Session expired. Go back to product page and click Order Now again.

**Upload fails:**
→ Check `payment-proofs` bucket exists in Supabase Storage.
→ Verify storage RLS policy allows anon uploads.

**Admin login fails:**
→ Ensure admin_profiles row exists with correct UUID.
→ Run: `SELECT id FROM auth.users WHERE email = 'admin@ast3r.store';`

**Product page 404:**
→ Check product status is 'active' in products table.
→ Check SKU in URL matches exactly (case-sensitive).

**Inventory not decrementing:**
→ Check `decrement_inventory` function exists.
→ Run schema.sql again if missing.

---

## 📦 QUICK DEPLOY CHECKLIST

- [ ] Supabase project created
- [ ] `schema.sql` executed ✓
- [ ] `rls.sql` executed ✓
- [ ] `seed.sql` executed ✓
- [ ] Admin user created in Auth + admin_profiles
- [ ] Storage buckets: `payment-proofs`, `product-images`
- [ ] `.env.local` filled with real values
- [ ] `npm run dev` works locally
- [ ] Full order flow tested locally
- [ ] Deployed to Vercel
- [ ] `NEXT_PUBLIC_APP_URL` updated to production URL
- [ ] `qr_links` updated with production URLs
- [ ] Custom domain configured (optional)
- [ ] QR codes downloaded and printed

---

*AST3R Fashion · inquiry@ast3r.store · 0966 960 6060 · @ast3r.ph*
