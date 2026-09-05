-- Enable RLS.
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table subscriptions enable row level security;
alter table projects enable row level security;
alter table datasets enable row level security;
alter table analysis_jobs enable row level security;
alter table analysis_results enable row level security;
alter table usage_records enable row level security;
alter table audit_logs enable row level security;

-- Membership helper.
create or replace function public.get_user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
    select organization_id
    from public.organization_members
    where user_id = auth.uid();
$$;

revoke all on function public.get_user_org_ids() from public;
grant execute on function public.get_user_org_ids() to authenticated;

-- Helper for role checks. SECURITY DEFINER avoids recursive RLS evaluation.
create or replace function public.has_org_role(
    p_organization_id uuid,
    p_roles text[]
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.organization_members
        where organization_id = p_organization_id
          and user_id = auth.uid()
          and role = any(p_roles)
    );
$$;

revoke all on function public.has_org_role(uuid, text[]) from public;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;

-- Organizations.
drop policy if exists "org_select" on organizations;
create policy "org_select"
on organizations for select
to authenticated
using (id in (select public.get_user_org_ids()));

-- Members.
drop policy if exists "members_select" on organization_members;
create policy "members_select"
on organization_members for select
to authenticated
using (organization_id in (select public.get_user_org_ids()));

drop policy if exists "members_admin_all" on organization_members;
create policy "members_admin_all"
on organization_members for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']))
with check (public.has_org_role(organization_id, array['owner','admin']));

-- Subscriptions.
drop policy if exists "subscription_select" on subscriptions;
create policy "subscription_select"
on subscriptions for select
to authenticated
using (organization_id in (select public.get_user_org_ids()));

-- Projects.
drop policy if exists "project_select" on projects;
create policy "project_select"
on projects for select
to authenticated
using (organization_id in (select public.get_user_org_ids()));

drop policy if exists "project_write" on projects;
create policy "project_write"
on projects for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin','analyst']))
with check (public.has_org_role(organization_id, array['owner','admin','analyst']));

-- Datasets.
drop policy if exists "dataset_select" on datasets;
create policy "dataset_select"
on datasets for select
to authenticated
using (organization_id in (select public.get_user_org_ids()));

drop policy if exists "dataset_write" on datasets;
create policy "dataset_write"
on datasets for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin','analyst']))
with check (public.has_org_role(organization_id, array['owner','admin','analyst']));

-- Jobs.
drop policy if exists "job_select" on analysis_jobs;
create policy "job_select"
on analysis_jobs for select
to authenticated
using (organization_id in (select public.get_user_org_ids()));

drop policy if exists "job_insert" on analysis_jobs;
create policy "job_insert"
on analysis_jobs for insert
to authenticated
with check (
    organization_id in (select public.get_user_org_ids())
    and created_by = auth.uid()
);

-- Cancellation/update limited to organization members.
drop policy if exists "job_update" on analysis_jobs;
create policy "job_update"
on analysis_jobs for update
to authenticated
using (organization_id in (select public.get_user_org_ids()))
with check (organization_id in (select public.get_user_org_ids()));

-- Results.
drop policy if exists "result_select" on analysis_results;
create policy "result_select"
on analysis_results for select
to authenticated
using (organization_id in (select public.get_user_org_ids()));

-- Usage.
drop policy if exists "usage_select" on usage_records;
create policy "usage_select"
on usage_records for select
to authenticated
using (organization_id in (select public.get_user_org_ids()));

-- Audit logs.
drop policy if exists "audit_select" on audit_logs;
create policy "audit_select"
on audit_logs for select
to authenticated
using (organization_id in (select public.get_user_org_ids()));

-- Private Storage policies.
-- Create buckets in Supabase Dashboard or via storage SQL/API:
-- datasets (private)
-- artifacts (private)

-- The critical function:
-- membership + project/dataset/org integrity + subscription + quota + job creation
-- are performed in ONE database transaction under a row lock.
create or replace function public.create_analysis_job_atomic(
    p_organization_id uuid,
    p_project_id uuid,
    p_dataset_id uuid,
    p_job_type text
)
returns table (
    success boolean,
    job_id uuid,
    error_message text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid;
    v_role text;
    v_plan_status text;
    v_monthly_limit integer;
    v_max_rows integer;
    v_row_count integer;
    v_current_usage integer;
    v_period_start timestamptz;
    v_job_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        return query select false, null::uuid, 'Authentication required.';
        return;
    end if;

    if p_job_type not in (
        'process_discovery',
        'performance_analytics',
        'conformance_checking'
    ) then
        return query select false, null::uuid, 'Unsupported analysis module.';
        return;
    end if;

    -- 1. Verify current user is a member of the requested organization.
    select role
    into v_role
    from public.organization_members
    where organization_id = p_organization_id
      and user_id = v_user_id;

    if not found then
        return query select false, null::uuid, 'Organization access denied.';
        return;
    end if;

    -- 2. Verify project belongs to organization.
    if not exists (
        select 1
        from public.projects
        where id = p_project_id
          and organization_id = p_organization_id
    ) then
        return query select false, null::uuid, 'Invalid project.';
        return;
    end if;

    -- 3. Verify dataset belongs to BOTH organization and project.
    select row_count
    into v_row_count
    from public.datasets
    where id = p_dataset_id
      and organization_id = p_organization_id
      and project_id = p_project_id
      and status = 'ready';

    if not found then
        return query select false, null::uuid, 'Invalid or unavailable dataset.';
        return;
    end if;

    -- 4. Lock subscription row. This serializes quota reservation.
    select status, monthly_job_limit, max_rows_per_file
    into v_plan_status, v_monthly_limit, v_max_rows
    from public.subscriptions
    where organization_id = p_organization_id
    for update;

    if not found or v_plan_status <> 'active' then
        return query select false, null::uuid, 'Active subscription required.';
        return;
    end if;

    if v_row_count > v_max_rows then
        return query select false, null::uuid, 'Dataset exceeds plan row limit.';
        return;
    end if;

    -- 5. Calendar-month usage. If billing periods later become non-calendar,
    -- replace this with current_period_start from subscriptions.
    v_period_start := date_trunc('month', now());

    select count(*)::integer
    into v_current_usage
    from public.analysis_jobs
    where organization_id = p_organization_id
      and created_at >= v_period_start
      and status in ('queued', 'processing', 'retrying', 'completed');

    if v_current_usage >= v_monthly_limit then
        return query select false, null::uuid, 'Monthly job quota reached.';
        return;
    end if;

    -- 6. Atomic job creation in the same transaction as the quota check.
    insert into public.analysis_jobs (
        organization_id,
        project_id,
        dataset_id,
        created_by,
        job_type,
        status,
        progress
    )
    values (
        p_organization_id,
        p_project_id,
        p_dataset_id,
        v_user_id,
        p_job_type,
        'queued',
        0
    )
    returning id into v_job_id;

    return query select true, v_job_id, 'OK';
end;
$$;

revoke all on function public.create_analysis_job_atomic(uuid, uuid, uuid, text)
from public;

grant execute on function public.create_analysis_job_atomic(uuid, uuid, uuid, text)
to authenticated;

-- NOTE:
-- The API calls this RPC using the user's bearer token, so auth.uid()
-- is the authenticated Supabase user, not a client-supplied user_id.
