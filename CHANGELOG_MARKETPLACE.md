# Marketplace + multi-connector (safe delta)

## What changed (for GitHub commit)

### Backend (additive)
- `backend/app/connectors/hubspot.py` (new)
- `backend/app/connectors/salesforce.py` (new)
- `backend/app/connectors/zendesk.py` (new)
- `backend/app/connectors/monday.py` (new)
- `backend/app/connectors/zoho.py` (new)
- `backend/app/connectors/dynamics365.py` (new)
- `backend/app/connectors/registry.py` (register all 7)
- `backend/app/routers/connectors.py` (generic sync — Odoo path unchanged in behavior)
- **NOT modified:** `odoo.py` (left as production-proven)

### SQL (run once on Supabase before/after deploy)
- `sql/008_connectors_expand.sql` — expands `connector_type` check

### Frontend
- `frontend/app/(dashboard)/marketplace/page.tsx` (new — professional marketplace UI)
- `frontend/app/(dashboard)/connectors/page.tsx` → redirect to `/marketplace`
- `frontend/components/Sidebar.tsx` — nav label **Marketplace**

## Deploy order (no downtime chaos)
1. Run `sql/008_connectors_expand.sql` in Supabase SQL Editor
2. Push this commit to `main` (CI pulls + rebuilds)
3. Smoke-test: Odoo still connects + Marketplace shows all platforms

## Platforms
Odoo · HubSpot · Salesforce · Zendesk · Monday.com · Zoho CRM · Dynamics 365
