-- Website order request queue for Sri Velavan Crackers.
-- Run this after supabase-setup.sql and billing_setup.sql.

create table if not exists public.website_order_requests (
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

create index if not exists website_order_requests_status_idx
  on public.website_order_requests (status, created_at desc);

alter table public.website_order_requests enable row level security;

grant insert on public.website_order_requests to anon, authenticated;
grant select, update on public.website_order_requests to authenticated;

drop policy if exists "Public can submit website order requests" on public.website_order_requests;
create policy "Public can submit website order requests"
on public.website_order_requests for insert to anon, authenticated
with check (status = 'pending' and payment_method is null and bill_id is null);

drop policy if exists "Authenticated users can read website order requests" on public.website_order_requests;
create policy "Authenticated users can read website order requests"
on public.website_order_requests for select to authenticated using (true);

drop policy if exists "Authenticated users can cancel website order requests" on public.website_order_requests;
create policy "Authenticated users can cancel website order requests"
on public.website_order_requests for update to authenticated
using (status = 'pending')
with check (status = 'cancelled' and payment_method is null and bill_id is null);

create or replace function public.confirm_website_order(
  p_request_id uuid,
  p_payment_method text
)
returns public.bills
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.website_order_requests;
  new_bill public.bills;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Only authenticated admins can confirm website orders';
  end if;

  if p_payment_method not in ('Cash', 'UPI', 'Card') then
    raise exception 'Invalid payment method';
  end if;

  select * into request_row
  from public.website_order_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Website order request is no longer pending';
  end if;

  insert into public.bills (
    bill_no, bill_date, customer_name, customer_phone, customer_address,
    payment_method, subtotal, extra_charges, grand_total, total_items,
    total_quantity, items, notes, created_by
  ) values (
    request_row.request_no, request_row.created_at, request_row.customer_name,
    request_row.customer_phone,
    request_row.customer_address || ', ' || request_row.customer_district || ', ' || request_row.customer_state,
    p_payment_method, request_row.subtotal, request_row.delivery_fee,
    request_row.total, request_row.total_items, request_row.total_quantity,
    request_row.items, 'Website order request ' || request_row.request_no, auth.uid()
  ) returning * into new_bill;

  update public.website_order_requests
  set status = 'confirmed', payment_method = p_payment_method,
      bill_id = new_bill.id, confirmed_at = now(), confirmed_by = auth.uid()
  where id = p_request_id;

  return new_bill;
end;
$$;

grant execute on function public.confirm_website_order(uuid, text) to authenticated;