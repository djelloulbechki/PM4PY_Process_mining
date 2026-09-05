-- Allow authenticated users to create organizations (bootstrap).
drop policy if exists "org_insert" on organizations;
create policy "org_insert"
on organizations for insert
to authenticated
with check (true);

-- Allow the creator to add themselves as owner (and later admins manage members).
drop policy if exists "members_insert_self" on organization_members;
create policy "members_insert_self"
on organization_members for insert
to authenticated
with check (user_id = auth.uid());

-- Subscriptions: allow insert for org members during bootstrap.
drop policy if exists "subscription_insert" on subscriptions;
create policy "subscription_insert"
on subscriptions for insert
to authenticated
with check (
  organization_id in (select public.get_user_org_ids())
  or public.has_org_role(organization_id, array['owner','admin'])
);

-- Soften: during first signup the membership row is inserted in the same
-- transaction sequence from the client; if RLS blocks, use a SECURITY DEFINER
-- bootstrap function instead (recommended for production).

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

  insert into public.subscriptions (
    organization_id, plan_code, status, monthly_job_limit, max_rows_per_file
  ) values (
    v_org_id, 'free', 'active', 10, 100000
  );

  insert into public.projects (organization_id, name)
  values (v_org_id, 'Default Project');

  return v_org_id;
end;
$$;

revoke all on function public.bootstrap_organization(text) from public;
grant execute on function public.bootstrap_organization(text) to authenticated;
