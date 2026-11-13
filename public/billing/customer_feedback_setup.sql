-- Customer feedback table for website and storefront submissions
create table if not exists public.customer_feedback (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null,
    rating integer not null check (rating between 1 and 5),
    feedback text not null,
    source text not null default 'website' check (source in ('website', 'storefront', 'manual')),
    created_at timestamptz not null default now()
);

create index if not exists customer_feedback_created_at_idx
    on public.customer_feedback (created_at desc);

alter table public.customer_feedback enable row level security;

drop policy if exists "Public can submit feedback" on public.customer_feedback;
create policy "Public can submit feedback"
on public.customer_feedback for insert to anon, authenticated
with check (true);

drop policy if exists "Authenticated users can read feedback" on public.customer_feedback;
create policy "Authenticated users can read feedback"
on public.customer_feedback for select to authenticated
using (true);

-- optional: allow admin users to view feedback from the billing dashboard
grant insert on public.customer_feedback to anon, authenticated;
grant select on public.customer_feedback to authenticated;
