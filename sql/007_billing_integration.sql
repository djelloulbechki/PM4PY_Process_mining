-- Full Billing Integration Migration
-- Converts all functions from subscriptions → billing_accounts
-- Run after 006_payg_billing.sql

-- 1. Update bootstrap_organization to use billing_accounts
DROP FUNCTION IF EXISTS create_analysis_job_atomic(uuid, uuid, uuid, text);
create or replace function public.bootstrap_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.organizations (name)
  values (coalesce(nullif(trim(p_name), ''), 'My Organization'))
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  -- Create billing account (Pay-As-You-Go: 0 credits, user must purchase)
  insert into public.billing_accounts (
    organization_id,
    credits_balance,
    credits_purchased
  ) values (
    v_org_id,
    0,
    0
  );

  insert into public.projects (organization_id, name)
  values (v_org_id, 'Default Project');

  return v_org_id;
end;
$$;

revoke all on function public.bootstrap_organization(text) from public;
grant execute on function public.bootstrap_organization(text) to authenticated;

-- 2. Update create_analysis_job_atomic to use credits instead of monthly quota
create or replace function public.create_analysis_job_atomic(
  p_organization_id uuid,
  p_project_id uuid,
  p_dataset_id uuid,
  p_job_type text
)
returns table(success boolean, job_id uuid, error_message text, payment_type text, tier_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_row_count integer;
  v_file_size bigint;
  v_credits_balance integer;
  v_payment_type text;
  v_tier_name text;
  v_max_rows integer;
  v_max_file_size bigint;
  v_job_id uuid;
begin
  if v_user_id is null then
    return query select false, null::uuid, 'Authentication required.', null::text, null::text;
    return;
  end if;

  if p_job_type not in (
    'process_discovery',
    'performance_analytics',
    'conformance_checking',
    'process_intelligence'
  ) then
    return query select false, null::uuid, 'Unsupported analysis module.', null::text, null::text;
    return;
  end if;

  -- Verify membership
  select role into v_role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = v_user_id;

  if not found or v_role not in ('owner', 'admin', 'analyst') then
    return query select false, null::uuid, 'Insufficient organization role.', null::text, null::text;
    return;
  end if;

  -- Verify project
  if not exists(
    select 1 from public.projects
    where id = p_project_id
      and organization_id = p_organization_id
  ) then
    return query select false, null::uuid, 'Invalid project.', null::text, null::text;
    return;
  end if;

  -- Verify dataset and get file size
  select row_count, coalesce(file_size_bytes, 0)
  into v_row_count, v_file_size
  from public.datasets
  where id = p_dataset_id
    and organization_id = p_organization_id
    and project_id = p_project_id
    and status = 'ready';

  if not found then
    return query select false, null::uuid, 'Invalid or unavailable dataset.', null::text, null::text;
    return;
  end if;

  -- Lock billing account row (FOR UPDATE prevents race conditions)
  select credits_balance
  into v_credits_balance
  from public.billing_accounts
  where organization_id = p_organization_id
  for update;

  if not found then
    return query select false, null::uuid, 'Billing account not found. Please contact support.', null::text, null::text;
    return;
  end if;

  -- Check credits
  if v_credits_balance < 1 then
    return query select false, null::uuid, 'Insufficient credits. Please purchase a pass to continue.', null::text, null::text;
    return;
  end if;

  -- Determine tier based on dataset size
  if v_row_count <= 50000 and v_file_size <= 15728640 then
    v_payment_type := 'standard';
    v_tier_name := 'Standard Pass';
    v_max_rows := 50000;
    v_max_file_size := 15728640;
  elsif v_row_count <= 150000 and v_file_size <= 41943040 then
    v_payment_type := 'pro';
    v_tier_name := 'Pro Pass';
    v_max_rows := 150000;
    v_max_file_size := 41943040;
  elsif v_row_count <= 600000 and v_file_size <= 125829120 then
    v_payment_type := 'scale';
    v_tier_name := 'Scale Pass';
    v_max_rows := 600000;
    v_max_file_size := 125829120;
  else
    return query select false, null::uuid,
      'Dataset exceeds maximum supported size (600,000 rows / 120 MB).', null::text, null::text;
    return;
  end if;

  -- Deduct credit atomically
  update public.billing_accounts
  set
    credits_balance = credits_balance - 1,
    updated_at = now()
  where organization_id = p_organization_id;

  -- Create job
  insert into public.analysis_jobs(
    organization_id,
    project_id,
    dataset_id,
    created_by,
    job_type,
    status,
    progress,
    payment_type,
    tier_name
  )
  values(
    p_organization_id,
    p_project_id,
    p_dataset_id,
    v_user_id,
    p_job_type,
    'queued',
    0,
    v_payment_type,
    v_tier_name
  )
  returning id into v_job_id;

  -- Record credit transaction
  insert into public.credit_transactions(
    organization_id,
    user_id,
    transaction_type,
    credits_amount,
    balance_after,
    job_id,
    tier_name,
    metadata
  ) values (
    p_organization_id,
    v_user_id,
    'usage',
    -1,
    v_credits_balance - 1,
    v_job_id,
    v_tier_name,
    jsonb_build_object('file_size_bytes', v_file_size, 'row_count', v_row_count)
  );

  return query select true, v_job_id, 'OK', v_payment_type, v_tier_name;
end;
$$;

revoke all on function public.create_analysis_job_atomic(uuid, uuid, uuid, text) from public;
grant execute on function public.create_analysis_job_atomic(uuid, uuid, uuid, text) to authenticated;

-- 3. Atomic credit deduction (used when starting a job)
create or replace function public.deduct_credit_atomic(
  p_organization_id uuid,
  p_user_id uuid,
  p_job_id uuid,
  p_payment_type text,
  p_tier_name text,
  p_file_size_bytes bigint,
  p_row_count integer
)
returns table(success boolean, error_message text, new_balance integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_balance integer;
begin
  update public.billing_accounts
  set
    credits_balance = credits_balance - 1,
    updated_at = now()
  where organization_id = p_organization_id
    and credits_balance >= 1
  returning credits_balance into v_new_balance;

  if not found then
    return query select false, 'Insufficient credits'::text, 0::integer;
    return;
  end if;

  insert into public.credit_transactions(
    organization_id, user_id, transaction_type, credits_amount, balance_after,
    job_id, tier_name, metadata
  ) values (
    p_organization_id, p_user_id, 'usage', -1, v_new_balance,
    p_job_id, p_tier_name,
    jsonb_build_object('payment_type', p_payment_type, 'file_size_bytes', p_file_size_bytes, 'row_count', p_row_count)
  );

  return query select true, 'OK'::text, v_new_balance;
end;
$$;

revoke all on function public.deduct_credit_atomic(uuid, uuid, uuid, text, text, bigint, integer) from public;
grant execute on function public.deduct_credit_atomic(uuid, uuid, uuid, text, text, bigint, integer) to authenticated;

-- 4. Atomic credit refund (used when job fails permanently)
create or replace function public.refund_credit_atomic(
  p_organization_id uuid,
  p_user_id uuid,
  p_job_id uuid
)
returns table(success boolean, error_message text, new_balance integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_balance integer;
begin
  -- Idempotency check: already refunded?
  if exists(
    select 1 from public.credit_transactions
    where job_id = p_job_id
      and transaction_type = 'refund'
  ) then
    select credits_balance into v_new_balance
    from public.billing_accounts
    where organization_id = p_organization_id;
    return query select true, 'Already refunded'::text, v_new_balance;
    return;
  end if;

  update public.billing_accounts
  set
    credits_balance = credits_balance + 1,
    updated_at = now()
  where organization_id = p_organization_id
  returning credits_balance into v_new_balance;

  if not found then
    return query select false, 'Billing account not found'::text, 0::integer;
    return;
  end if;

  insert into public.credit_transactions(
    organization_id, user_id, transaction_type, credits_amount, balance_after,
    job_id, metadata
  ) values (
    p_organization_id, p_user_id, 'refund', 1, v_new_balance,
    p_job_id, jsonb_build_object('reason', 'job_failed_permanently')
  );

  return query select true, 'OK'::text, v_new_balance;
end;
$$;

revoke all on function public.refund_credit_atomic(uuid, uuid, uuid) from public;
grant execute on function public.refund_credit_atomic(uuid, uuid, uuid) to authenticated;

-- 5. Atomic credit addition (used by webhook after payment)
create or replace function public.add_credits_atomic(
  p_organization_id uuid,
  p_user_id uuid,
  p_credits integer,
  p_stripe_payment_id text,
  p_stripe_price_id text,
  p_tier_name text,
  p_metadata jsonb
)
returns table(success boolean, error_message text, new_balance integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_balance integer;
begin
  -- Idempotency: UNIQUE constraint will reject duplicates
  if exists(
    select 1 from public.credit_transactions
    where stripe_payment_id = p_stripe_payment_id
      and transaction_type = 'purchase'
  ) then
    select credits_balance into v_new_balance
    from public.billing_accounts
    where organization_id = p_organization_id;
    return query select true, 'Already processed'::text, v_new_balance;
    return;
  end if;

  update public.billing_accounts
  set
    credits_balance = credits_balance + p_credits,
    credits_purchased = credits_purchased + p_credits,
    updated_at = now()
  where organization_id = p_organization_id
  returning credits_balance into v_new_balance;

  if not found then
    return query select false, 'Billing account not found'::text, 0::integer;
    return;
  end if;

  insert into public.credit_transactions(
    organization_id, user_id, transaction_type, credits_amount, balance_after,
    stripe_payment_id, stripe_price_id, tier_name, metadata
  ) values (
    p_organization_id, p_user_id, 'purchase', p_credits, v_new_balance,
    p_stripe_payment_id, p_stripe_price_id, p_tier_name, p_metadata
  );

  return query select true, 'OK'::text, v_new_balance;
end;
$$;

revoke all on function public.add_credits_atomic(uuid, uuid, integer, text, text, text, jsonb) from public;
grant execute on function public.add_credits_atomic(uuid, uuid, integer, text, text, text, jsonb) to authenticated;
