-- Enterprise Process Intelligence migration.
-- Run after 001_schema.sql, 002_rls_and_functions.sql and 003_bootstrap_policies.sql.

alter table public.analysis_jobs drop constraint if exists analysis_jobs_job_type_check;
alter table public.analysis_jobs add constraint analysis_jobs_job_type_check check (
  job_type in ('process_discovery','performance_analytics','conformance_checking','process_intelligence')
);

create index if not exists idx_jobs_org_project_status
  on public.analysis_jobs(organization_id, project_id, status, created_at desc);

create index if not exists idx_results_org_created
  on public.analysis_results(organization_id, created_at desc);

-- Audit trigger: immutable operational record for critical job state changes.
create or replace function public.audit_analysis_job_update()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (old.status is distinct from new.status) then
    insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
    values (new.organization_id, auth.uid(), 'analysis_job.status_changed', 'analysis_job', new.id,
            jsonb_build_object('from', old.status, 'to', new.status, 'progress', new.progress));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_analysis_job on public.analysis_jobs;
create trigger trg_audit_analysis_job after update on public.analysis_jobs
for each row execute function public.audit_analysis_job_update();

-- Re-create the atomic job function with the new module allowed.
-- Keep the original quota/membership semantics while extending the allow-list.
create or replace function public.create_analysis_job_atomic(
    p_organization_id uuid, p_project_id uuid, p_dataset_id uuid, p_job_type text
) returns table(success boolean, job_id uuid, error_message text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user_id uuid := auth.uid(); v_role text; v_plan_status text;
  v_monthly_limit integer; v_max_rows integer; v_row_count integer;
  v_current_usage integer; v_period_start timestamptz; v_job_id uuid;
begin
  if v_user_id is null then return query select false,null::uuid,'Authentication required.'; return; end if;
  if p_job_type not in ('process_discovery','performance_analytics','conformance_checking','process_intelligence') then
    return query select false,null::uuid,'Unsupported analysis module.'; return;
  end if;
  select role into v_role from public.organization_members where organization_id=p_organization_id and user_id=v_user_id;
  if not found or v_role not in ('owner','admin','analyst') then return query select false,null::uuid,'Insufficient organization role.'; return; end if;
  if not exists(select 1 from public.projects where id=p_project_id and organization_id=p_organization_id) then
    return query select false,null::uuid,'Invalid project.'; return;
  end if;
  select row_count into v_row_count from public.datasets
    where id=p_dataset_id and organization_id=p_organization_id and project_id=p_project_id and status='ready';
  if not found then return query select false,null::uuid,'Invalid or unavailable dataset.'; return; end if;
  select status,monthly_job_limit,max_rows_per_file into v_plan_status,v_monthly_limit,v_max_rows
    from public.subscriptions where organization_id=p_organization_id for update;
  if not found or v_plan_status <> 'active' then return query select false,null::uuid,'Active subscription required.'; return; end if;
  if v_row_count > v_max_rows then return query select false,null::uuid,'Dataset exceeds plan row limit.'; return; end if;
  v_period_start := date_trunc('month',now());
  select count(*)::integer into v_current_usage from public.analysis_jobs
    where organization_id=p_organization_id and created_at>=v_period_start
    and status in ('queued','processing','retrying','completed');
  if v_current_usage >= v_monthly_limit then return query select false,null::uuid,'Monthly job quota reached.'; return; end if;
  insert into public.analysis_jobs(organization_id,project_id,dataset_id,created_by,job_type,status,progress)
  values(p_organization_id,p_project_id,p_dataset_id,v_user_id,p_job_type,'queued',0) returning id into v_job_id;
  return query select true,v_job_id,'OK';
end;
$$;
revoke all on function public.create_analysis_job_atomic(uuid,uuid,uuid,text) from public;
grant execute on function public.create_analysis_job_atomic(uuid,uuid,uuid,text) to authenticated;
