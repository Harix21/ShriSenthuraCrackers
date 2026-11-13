-- Cloudinary product image database migration
-- Run this standalone script in the SQL editor for the Supabase project used by the website.
-- Safe to re-run: the column is only added when it does not already exist.
BEGIN;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS image_public_id TEXT;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.categories;
CREATE POLICY "Authenticated users can manage categories"
    ON public.categories
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read categories" ON public.categories;
CREATE POLICY "Public can read categories"
    ON public.categories
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage products" ON public.products;
CREATE POLICY "Authenticated users can manage products"
    ON public.products
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read active products" ON public.products;
CREATE POLICY "Public can read active products"
    ON public.products
    FOR SELECT
    TO anon
    USING (is_active = TRUE);

DROP POLICY IF EXISTS "Authenticated users can manage customers" ON public.customers;
CREATE POLICY "Authenticated users can manage customers"
    ON public.customers
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

COMMIT;
