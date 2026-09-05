-- Universal ingestion + Odoo connector layer.
create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  connector_type text not null check (connector_type in ('odoo')),
  status text not null default 'disconnected' check (status in ('connected','disconnected','error')),
  config jsonb not null default '{}'::jsonb,
  credentials_encrypted text,
  last_sync_at timestamptz,
  last_error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_data_sources_org_project on public.data_sources(organization_id, project_id, created_at desc);

alter table public.datasets add column if not exists source_type text not null default 'file';
alter table public.datasets add column if not exists source_id uuid references public.data_sources(id) on delete set null;
alter table public.datasets add column if not exists schema_json jsonb not null default '{}'::jsonb;
alter table public.datasets add column if not exists ingestion_metadata jsonb not null default '{}'::jsonb;

alter table public.analysis_jobs add column if not exists source_type text not null default 'dataset';

-- RLS follows the same organization membership boundary as the existing tables.
alter table public.data_sources enable row level security;
drop policy if exists data_sources_select_member on public.data_sources;
create policy data_sources_select_member on public.data_sources for select using (
  exists(select 1 from public.organization_members m where m.organization_id=data_sources.organization_id and m.user_id=auth.uid())
);
drop policy if exists data_sources_write_analyst on public.data_sources;
create policy data_sources_write_analyst on public.data_sources for all using (
  exists(select 1 from public.organization_members m where m.organization_id=data_sources.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','analyst'))
) with check (
  exists(select 1 from public.organization_members m where m.organization_id=data_sources.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','analyst'))
);

-- Storage paths are intentionally constrained to the organization/project namespace by application code.
