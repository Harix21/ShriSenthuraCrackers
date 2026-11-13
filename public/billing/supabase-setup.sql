-- Supabase Database Setup for Sri Velavan Crackers
-- Combined setup for storefront catalog, billing, website orders, and feedback.
-- This single script can be run in one go in Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 999 CHECK (display_order > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 999 CHECK (display_order > 0);

UPDATE public.categories
SET display_order = CASE name
    WHEN 'Kids Special' THEN 6
    WHEN 'SPARKLERS' THEN 18
    WHEN 'Flower Pots' THEN 4
    WHEN 'Ground Chakkars' THEN 3
    WHEN 'Multi Shots Sky Out' THEN 12
    WHEN 'Fancy Multicolour Sky Shots' THEN 11
    WHEN 'Amazing Fountains & Novelties(New Arrivals)' THEN 7
    WHEN 'Peacock Novelties' THEN 8
    WHEN 'Single Sound Crackers' THEN 2
    WHEN 'Saravedi Crackers' THEN 10
    WHEN 'Mappillai Vedi' THEN 13
    WHEN 'Electric & Wala Crackers' THEN 14
    WHEN 'Bijili Crackers' THEN 15
    WHEN 'Paper Bomb' THEN 9
    WHEN 'Roll Caps & Ring Caps' THEN 16
    WHEN 'Colour Matches' THEN 17
    WHEN 'Twinkling Star' THEN 5
    WHEN 'Special Gift Box' THEN 19
    WHEN 'Popup/Beedi Vedi' THEN 1
    ELSE 999
END
WHERE display_order = 999;

CREATE INDEX IF NOT EXISTS idx_categories_name ON public.categories(name);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON public.categories(display_order);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.categories;
CREATE POLICY "Authenticated users can manage categories"
ON public.categories
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public can read categories" ON public.categories;
CREATE POLICY "Public can read categories"
ON public.categories
FOR SELECT
USING (true);

-- ============================================================================
-- PRODUCTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    original_price NUMERIC(10, 2) NOT NULL CHECK (original_price > 0),
    cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    selling_price NUMERIC(10, 2) NOT NULL CHECK (selling_price > 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    image_url TEXT NOT NULL,
    image_public_id TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS image_public_id TEXT;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can manage products" ON public.products;
CREATE POLICY "Authenticated users can manage products"
ON public.products
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public can read active products" ON public.products;
CREATE POLICY "Public can read active products"
ON public.products
FOR SELECT
USING (is_active = TRUE);

-- ============================================================================
-- CUSTOMERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can manage customers" ON public.customers;
CREATE POLICY "Authenticated users can manage customers"
ON public.customers FOR ALL
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    1048576,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can read product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;

CREATE POLICY "Public can read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images')
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images');

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
CREATE TRIGGER update_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- BILLS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_no text not null unique,
  bill_date timestamptz not null default now(),
  customer_name text,
  customer_id uuid references public.customers(id) on delete set null,
  customer_phone text,
  customer_address text,
  payment_method text not null default 'Cash',
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  extra_charges numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  cost_total numeric(12,2) not null default 0,
  profit_total numeric(12,2) not null default 0,
  amount_received numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  total_items integer not null default 0,
  total_quantity integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS bills_bill_date_idx ON public.bills (bill_date desc);
CREATE INDEX IF NOT EXISTS bills_payment_method_idx ON public.bills (payment_method);
CREATE INDEX IF NOT EXISTS bills_customer_name_idx ON public.bills (customer_name);

ALTER TABLE public.bills
    ADD COLUMN IF NOT EXISTS customer_id uuid references public.customers(id) on delete set null;

ALTER TABLE public.bills
    ADD COLUMN IF NOT EXISTS cost_total numeric(12,2) not null default 0;

ALTER TABLE public.bills
    ADD COLUMN IF NOT EXISTS profit_total numeric(12,2) not null default 0;

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read bills" ON public.bills;
DROP POLICY IF EXISTS "Authenticated users can create bills" ON public.bills;
DROP POLICY IF EXISTS "Authenticated users can update bills" ON public.bills;
DROP POLICY IF EXISTS "Authenticated users can delete bills" ON public.bills;

CREATE POLICY "Authenticated users can read bills"
ON public.bills FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create bills"
ON public.bills FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update bills"
ON public.bills FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete bills"
ON public.bills FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_bills_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bills_set_updated_at ON public.bills;
CREATE TRIGGER bills_set_updated_at
BEFORE UPDATE ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.set_bills_updated_at();

-- ============================================================================
-- CUSTOMER FEEDBACK
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_feedback (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null,
    rating integer not null check (rating between 1 and 5),
    feedback text not null,
    source text not null default 'website' check (source in ('website', 'storefront', 'manual')),
    created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS customer_feedback_created_at_idx
    ON public.customer_feedback (created_at desc);

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can submit feedback" ON public.customer_feedback;
CREATE POLICY "Public can submit feedback"
ON public.customer_feedback FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read feedback" ON public.customer_feedback;
CREATE POLICY "Authenticated users can read feedback"
ON public.customer_feedback FOR SELECT TO authenticated
USING (true);

GRANT INSERT ON public.customer_feedback TO anon, authenticated;
GRANT SELECT ON public.customer_feedback TO authenticated;

-- ============================================================================
-- WEBSITE ORDER REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.website_order_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  customer_state text not null,
  customer_district text not null,
  subtotal numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  total_items integer not null default 0,
  total_quantity integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  payment_method text,
  bill_id uuid references public.bills(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid
);

CREATE INDEX IF NOT EXISTS website_order_requests_status_idx
  ON public.website_order_requests (status, created_at desc);

ALTER TABLE public.website_order_requests ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.website_order_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON public.website_order_requests TO authenticated;

DROP POLICY IF EXISTS "Public can submit website order requests" ON public.website_order_requests;
CREATE POLICY "Public can submit website order requests"
ON public.website_order_requests FOR INSERT TO anon, authenticated
WITH CHECK (status = 'pending' and payment_method is null and bill_id is null);

DROP POLICY IF EXISTS "Authenticated users can read website order requests" ON public.website_order_requests;
CREATE POLICY "Authenticated users can read website order requests"
ON public.website_order_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can cancel website order requests" ON public.website_order_requests;
CREATE POLICY "Authenticated users can cancel website order requests"
ON public.website_order_requests FOR UPDATE TO authenticated
USING (status = 'pending')
WITH CHECK (status = 'cancelled' and payment_method is null and bill_id is null);

CREATE OR REPLACE FUNCTION public.confirm_website_order(
  p_request_id uuid,
  p_payment_method text
)
RETURNS public.bills
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row public.website_order_requests;
  new_bill public.bills;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Only authenticated admins can confirm website orders';
  END IF;

  IF p_payment_method NOT IN ('Cash', 'UPI', 'Card') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  SELECT * INTO request_row
  FROM public.website_order_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Website order request is no longer pending';
  END IF;

  INSERT INTO public.bills (
    bill_no, bill_date, customer_name, customer_phone, customer_address,
    payment_method, subtotal, extra_charges, grand_total, total_items,
    total_quantity, items, notes, created_by
  ) VALUES (
    request_row.request_no, request_row.created_at, request_row.customer_name,
    request_row.customer_phone,
    request_row.customer_address || ', ' || request_row.customer_district || ', ' || request_row.customer_state,
    p_payment_method, request_row.subtotal, request_row.delivery_fee,
    request_row.total, request_row.total_items, request_row.total_quantity,
    request_row.items, 'Website order request ' || request_row.request_no, auth.uid()
  ) RETURNING * INTO new_bill;

  UPDATE public.website_order_requests
  SET status = 'confirmed', payment_method = p_payment_method,
      bill_id = new_bill.id, confirmed_at = now(), confirmed_by = auth.uid()
  WHERE id = p_request_id;

  RETURN new_bill;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_website_order(uuid, text) TO authenticated;

-- ============================================================================
-- OPTIONAL: VERIFICATION
-- ============================================================================
-- SELECT COUNT(*) AS total_bills, COALESCE(SUM(grand_total), 0) AS revenue FROM public.bills;
--
-- Current Supabase Storage usage for product images (bytes and object count):
-- SELECT COUNT(*) AS object_count,
--        COALESCE(SUM(NULLIF(metadata->>'size', '')::bigint), 0) AS bytes_used
-- FROM storage.objects
-- WHERE bucket_id = 'product-images';
--
-- Approximate public table/index storage by table:
-- SELECT relname AS table_name,
--        pg_size_pretty(pg_total_relation_size(relid)) AS total_size
-- FROM pg_catalog.pg_statio_user_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(relid) DESC;
--
-- The bucket limit above caps each new upload at 1 MiB; it does not impose a
-- total bucket quota or alter existing objects. Existing bill/order history is
-- retained; archive/delete policies require an explicit retention decision.
