# Process Intelligence SaaS — Production Core v2

A multi-tenant process-mining / process-intelligence SaaS foundation built around FastAPI, Celery, Redis, Supabase/Postgres and Next.js.

## What changed in v2

The original engine was extended with an **Executive Process Intelligence** module. It converts an event log into explainable business signals instead of stopping at a DFG:

- process health diagnostic score
- median and P95 cycle time
- transition bottlenecks and waiting time
- repeated-activity / rework detection
- deterministic process variants
- optional SLA compliance
- optional case-value exposure
- optional resource distribution
- ranked improvement opportunities
- versioned result artifacts
- audit trail for analysis-job state changes
- atomic membership + dataset integrity + quota + job creation

## Architecture

```text
Next.js
  │ JWT
  ▼
FastAPI ──────── Supabase Auth/Postgres/RLS
  │                       │
  │ enqueue               │ private metadata
  ▼                       ▼
Redis ─────────────── Celery Worker
                           │
                           ├─ download private dataset
                           ├─ validate/normalize event log
                           ├─ PM4Py discovery/conformance
                           ├─ process intelligence
                           └─ private JSON artifact
```

## Database

Run SQL migrations in this order:

1. `sql/001_schema.sql`
2. `sql/002_rls_and_functions.sql`
3. `sql/003_bootstrap_policies.sql`
4. `sql/004_process_intelligence.sql`

Create private Supabase Storage buckets named `datasets` and `artifacts`. Do not make either bucket public.

## Local run

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Worker:

```bash
celery -A app.celery_app.celery_app worker --loglevel=INFO --concurrency=2
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment

Copy `.env.example` to `.env` for the backend and `frontend/.env.example` to `frontend/.env.local`. Never commit service-role keys.

## Event-log contract

Minimum columns:

- case ID — one identifier per process instance
- activity — event/activity name
- timestamp — parseable event timestamp

Optional columns for Process Intelligence:

- amount/value — numeric case value
- resource — employee/user/team/resource identifier
- SLA target — configured in hours

The UI exposes these mappings when `Executive Process Intelligence` is selected.

## Production notes

This repository is a serious production **core**, not a claim that a small codebase can instantly equal Celonis at enterprise scale. Before selling to large enterprises, add connector infrastructure (SAP/Oracle/Dynamics/etc.), SSO/SAML + SCIM, stronger tenant administration, observability/metrics, retention controls, object-store multipart uploads, analytical storage for very large logs, automated backups, and a formal security/compliance program.

The v2 business layer intentionally avoids inventing savings figures. Financial values shown by the engine are **exposure derived from the selected case-value field**, not guaranteed ROI.

## Data ingestion architecture

ProcessMine uses a canonical event-log layer. Files (CSV/XLSX) and connectors such as Odoo are normalized into `case_id`, `activity`, `timestamp`, `resource`, and `amount` before process mining. This keeps the mining engine independent of the source system.

### Odoo connector

Odoo 19+ uses the External JSON-2 API. The connector tests the API key, discovers models, maps a selected model into the canonical event schema, and stores the result as a dataset. Odoo credentials are encrypted with `CONNECTOR_ENCRYPTION_KEY` and are never returned to the frontend.

Run `sql/005_connectors.sql` after the existing migrations. Generate a Fernet key and set `CONNECTOR_ENCRYPTION_KEY` in the backend environment.
