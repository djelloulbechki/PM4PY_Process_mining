-- Pay-As-You-Go Billing Migration
-- Run after 005_connectors.sql

-- 1. Create billing_accounts table
create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  credits_balance integer not null default 0 check (credits_balance >= 0),
  credits_purchased integer not null default 0 check (credits_purchased >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_accounts_org
on public.billing_accounts(organization_id);

create index if not exists idx_billing_accounts_stripe
on public.billing_accounts(stripe_customer_id)
where stripe_customer_id is not null;

-- 2. Create credit_transactions table (audit trail)
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  transaction_type text not null check (transaction_type in ('purchase', 'usage', 'refund')),
  credits_amount integer not null,
  balance_after integer not null,
  stripe_payment_id text,
  stripe_price_id text,
  tier_name text,
  job_id uuid references public.analysis_jobs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_transactions_org
on public.credit_transactions(organization_id, created_at desc);

create index if not exists idx_credit_transactions_job
on public.credit_transactions(job_id)
where job_id is not null;

-- 3. Add payment_type and tier to analysis_jobs
alter table public.analysis_jobs
add column if not exists payment_type text
check (payment_type is null or payment_type in ('standard', 'pro', 'scale'));

alter table public.analysis_jobs
add column if not exists tier_name text;

create index if not exists idx_jobs_payment_type
on public.analysis_jobs(payment_type)
where payment_type is not null;

-- 4. Enable RLS
alter table public.billing_accounts enable row level security;
alter table public.credit_transactions enable row level security;

-- 5. RLS policies
drop policy if exists billing_accounts_select_member on public.billing_accounts;
create policy billing_accounts_select_member on public.billing_accounts
for select
to authenticated
using (
  exists(
    select 1 from public.organization_members m
    where m.organization_id = billing_accounts.organization_id
    and m.user_id = auth.uid()
  )
);

drop policy if exists credit_transactions_select_member on public.credit_transactions;
create policy credit_transactions_select_member on public.credit_transactions
for select
to authenticated
using (
  exists(
    select 1 from public.organization_members m
    where m.organization_id = credit_transactions.organization_id
    and m.user_id = auth.uid()
  )
);

-- 6. Unique constraint for webhook idempotency
create unique index if not exists uq_credit_transactions_payment
on public.credit_transactions(stripe_payment_id)
where stripe_payment_id is not null and transaction_type = 'purchase';

-- 7. Function to get billing account info
create or replace function public.get_billing_account_info(p_organization_id uuid)
returns table(
  credits_balance integer,
  credits_purchased integer,
  total_transactions integer
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    ba.credits_balance,
    ba.credits_purchased,
    (select count(*)::integer from public.credit_transactions ct where ct.organization_id = p_organization_id)
  from public.billing_accounts ba
  where ba.organization_id = p_organization_id;
$$;

revoke all on function public.get_billing_account_info(uuid) from public;
grant execute on function public.get_billing_account_info(uuid) to authenticated;
