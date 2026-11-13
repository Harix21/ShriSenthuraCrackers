-- Sri Velavan Crackers POS Billing history
-- Stores one compact row per bill. Items are kept inside JSONB to avoid
-- creating one database row for every line item.

create extension if not exists pgcrypto;

create table if not exists public.bills (
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

create index if not exists bills_bill_date_idx on public.bills (bill_date desc);
create index if not exists bills_payment_method_idx on public.bills (payment_method);
create index if not exists bills_customer_name_idx on public.bills (customer_name);

alter table public.bills add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.bills add column if not exists cost_total numeric(12,2) not null default 0;
alter table public.bills add column if not exists profit_total numeric(12,2) not null default 0;

alter table public.bills enable row level security;

-- API privileges for authenticated admins. RLS still controls row access.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.bills to authenticated;


drop policy if exists "Authenticated users can read bills" on public.bills;
drop policy if exists "Authenticated users can create bills" on public.bills;
drop policy if exists "Authenticated users can update bills" on public.bills;
drop policy if exists "Authenticated users can delete bills" on public.bills;

create policy "Authenticated users can read bills"
on public.bills for select to authenticated using (true);

create policy "Authenticated users can create bills"
on public.bills for insert to authenticated with check (true);

create policy "Authenticated users can update bills"
on public.bills for update to authenticated using (true) with check (true);

create policy "Authenticated users can delete bills"
on public.bills for delete to authenticated using (true);

-- Keep updated_at current without requiring frontend code to manage it.
create or replace function public.set_bills_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bills_set_updated_at on public.bills;
create trigger bills_set_updated_at
before update on public.bills
for each row execute function public.set_bills_updated_at();

-- Helpful verification query (optional):
-- select count(*) as total_bills, coalesce(sum(grand_total),0) as revenue from public.bills;
