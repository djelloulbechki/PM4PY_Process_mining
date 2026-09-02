# Frontend Contract for Lovable

Base URL:

`https://api.example.com`

## Auth

Send:

`Authorization: Bearer <supabase-access-token>`

## Preview

POST `/api/v1/datasets/preview`

multipart:
- `file`

Response:
```json
{
  "filename": "orders.csv",
  "columns": ["case_id", "activity", "timestamp"],
  "preview": [
    {"case_id": "1", "activity": "Order", "timestamp": "2026-01-01T10:00:00Z"}
  ]
}
```

## Create analysis

POST `/api/v1/analyses`

```json
{
  "organization_id": "...",
  "project_id": "...",
  "dataset_id": "...",
  "analysis_module": "process_discovery",
  "case_column": "case_id",
  "activity_column": "activity",
  "timestamp_column": "timestamp"
}
```

Response:
```json
{
  "job_id": "...",
  "status": "queued"
}
```

## Poll job

GET `/api/v1/analyses/{job_id}`

Possible states:
- queued
- processing
- retrying
- completed
- failed
- cancelled

## Cancel

POST `/api/v1/analyses/{job_id}/cancel`

Cancellation is cooperative: it is guaranteed between processing stages, not necessarily inside a CPU-bound PM4Py call.

## Result

After `completed`, query the corresponding `analysis_results` record through Supabase RLS, then obtain a short-lived signed URL for the private artifact through a future result-download endpoint.
