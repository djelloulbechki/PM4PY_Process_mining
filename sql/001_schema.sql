create extension if not exists pgcrypto;

create table if not exists organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now()
);

create table if not exists organization_members (
    organization_id uuid not null references organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'analyst', 'viewer')),
    created_at timestamptz not null default now(),
    primary key (organization_id, user_id)
);

create table if not exists subscriptions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null unique references organizations(id) on delete cascade,
    plan_code text not null default 'free',
    status text not null default 'active',
    monthly_job_limit integer not null default 10 check (monthly_job_limit >= 0),
    max_rows_per_file integer not null default 100000 check (max_rows_per_file > 0),
    current_period_start timestamptz not null default date_trunc('month', now()),
    current_period_end timestamptz,
    stripe_customer_id text,
    stripe_subscription_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists projects (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now()
);

create table if not exists datasets (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    project_id uuid not null references projects(id) on delete cascade,
    name text not null,
    storage_path text not null,
    row_count integer not null default 0 check (row_count >= 0),
    file_size_bytes bigint,
    status text not null default 'ready'
        check (status in ('uploading', 'validating', 'ready', 'failed', 'deleted')),
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now()
);

create table if not exists analysis_jobs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    project_id uuid not null references projects(id) on delete cascade,
    dataset_id uuid not null references datasets(id) on delete restrict,
    created_by uuid not null references auth.users(id),
    job_type text not null
        check (job_type in (
            'process_discovery',
            'performance_analytics',
            'conformance_checking'
        )),
    status text not null default 'queued'
        check (status in (
            'queued',
            'processing',
            'retrying',
            'completed',
            'failed',
            'cancelled'
        )),
    progress integer not null default 0 check (progress between 0 and 100),
    retry_count integer not null default 0 check (retry_count >= 0),
    error_code text,
    error_message text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists analysis_results (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null unique references analysis_jobs(id) on delete cascade,
    organization_id uuid not null references organizations(id) on delete cascade,
    metrics_summary jsonb not null default '{}'::jsonb,
    artifact_storage_path text not null,
    created_at timestamptz not null default now()
);

create table if not exists usage_records (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id),
    job_id uuid not null unique references analysis_jobs(id) on delete cascade,
    rows_processed bigint not null default 0,
    execution_time_seconds numeric(12,3) not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists audit_logs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references organizations(id) on delete cascade,
    user_id uuid references auth.users(id),
    action text not null,
    entity_type text,
    entity_id uuid,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_org_members_user
    on organization_members(user_id);

create index if not exists idx_projects_org
    on projects(organization_id);

create index if not exists idx_datasets_org_project
    on datasets(organization_id, project_id);

create index if not exists idx_jobs_org_created
    on analysis_jobs(organization_id, created_at);

create index if not exists idx_jobs_status
    on analysis_jobs(status);

create index if not exists idx_usage_org_created
    on usage_records(organization_id, created_at);
