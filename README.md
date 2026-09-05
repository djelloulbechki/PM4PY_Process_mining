# ProcessMine SaaS v3

Process Mining + Process Intelligence platform with:

- **Pay-As-You-Go billing** (Stripe one-time passes: Standard / Pro / Scale)
- **Connectors** (Odoo, extensible)
- **Optimization Canvas** (rule-based suggestions → React Flow + n8n export + Agency marketplace)
- Celery workers, Supabase Auth/Storage/RLS

## Stack

| Layer | Tech |
|-------|------|
| API | FastAPI, Celery, Redis, PM4Py |
| DB / Auth / Storage | Supabase (Postgres + RLS) |
| Billing | Stripe Checkout + Webhooks |
| Frontend | Next.js 15, Tailwind, Recharts, React Flow (`@xyflow/react`) |

## Setup

### 1. Supabase SQL (in order)

Run in Supabase SQL Editor:

```
sql/001_schema.sql
sql/002_rls_and_functions.sql
sql/003_bootstrap_policies.sql
sql/004_process_intelligence.sql
sql/005_connectors.sql
sql/006_payg_billing.sql
sql/007_billing_integration.sql
```

Create private Storage buckets: `datasets`, `artifacts`.

### 2. Environment

```bash
cp backend/.env.example .env
```

Fill: Supabase keys, Redis, CONNECTOR_ENCRYPTION_KEY, Stripe keys + Price IDs, FRONTEND_URL, CORS_ORIGINS.

Frontend:

```bash
cp frontend/.env.example frontend/.env.local
```

### 3. Run backend

```bash
docker-compose up --build
```

### 4. Run frontend

```bash
cd frontend && npm install && npm run dev
```

### 5. Stripe webhook (local)

```bash
stripe listen --forward-to localhost:8000/api/v1/billing/webhooks
```

Test card: `4242 4242 4242 4242`.

## Product flow

1. Sign up → org + billing account (0 credits).
2. Buy a pass on `/billing` or `/pricing`.
3. Upload event log → run Process Intelligence (1 credit).
4. Open result → **Optimize** → canvas + n8n export + agency contact.

## Key paths

- Public pricing: `/pricing`
- Billing: `/billing`, `/billing/success`
- Optimize: `/analyses/[jobId]/optimize`
- API docs: `http://localhost:8000/docs`

Optimization is **rule-based only** (no AI). Credits use atomic Postgres RPCs; webhooks are idempotent on `stripe_payment_id`.
