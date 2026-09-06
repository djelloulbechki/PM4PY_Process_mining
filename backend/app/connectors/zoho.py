from __future__ import annotations
from typing import Any
import httpx
from app.connectors.base import BaseConnector, ConnectorError

class ZohoConnector(BaseConnector):
    key = "zoho"
    name = "Zoho CRM"

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.api_key = config.get("api_key") or ""
        if len(self.api_key) < 10: raise ConnectorError("Zoho OAuth access token required")
        self.api_domain = str(config.get("api_domain") or "https://www.zohoapis.com").rstrip("/")
        self.module = config.get("module") or "Deals"
        self.timeout = float(config.get("timeout", 30))

    def _headers(self):
        return {"Authorization": f"Zoho-oauthtoken {self.api_key}", "Content-Type": "application/json", "User-Agent": "ProcessMine/3.0"}

    def _get(self, path, params=None):
        try:
            r = httpx.get(f"{self.api_domain}{path}", headers=self._headers(), params=params or {}, timeout=self.timeout)
        except httpx.HTTPError as exc:
            raise ConnectorError(f"Could not reach Zoho: {exc}") from exc
        if r.status_code >= 400: raise ConnectorError(f"Zoho HTTP {r.status_code}: {r.text[:400]}")
        return r.json()

    def test_connection(self):
        data = self._get("/crm/v2/users", {"type": "CurrentUser"})
        users = data.get("users") or []
        u = users[0] if users else {}
        return {"ok": True, "user_id": u.get("id"), "email": u.get("email")}

    def discover(self):
        return {"recommended": [
            {"key": "deals", "label": "Deal stages", "module": "Deals", "case_field": "id", "activity_field": "Stage", "timestamp_field": "Modified_Time", "amount_field": "Amount"},
            {"key": "cases", "label": "Case status", "module": "Cases", "case_field": "id", "activity_field": "Status", "timestamp_field": "Modified_Time"},
        ]}

    def fetch_events(self, mapping):
        module = mapping.get("module") or self.module
        case_f = mapping.get("case_field") or "id"
        act_f = mapping.get("activity_field") or ("Stage" if module == "Deals" else "Status")
        ts_f = mapping.get("timestamp_field") or "Modified_Time"
        res_f = mapping.get("resource_field") or "Owner"
        amt_f = mapping.get("amount_field")
        limit = min(int(mapping.get("limit", 5000)), 10000)
        events, page = [], 1
        while len(events) < limit:
            data = self._get(f"/crm/v2/{module}", {"page": page, "per_page": min(200, limit - len(events)), "sort_by": "Modified_Time", "sort_order": "asc"})
            rows = data.get("data") or []
            if not rows: break
            for row in rows:
                case = row.get(case_f) or row.get("id")
                activity = row.get(act_f)
                if isinstance(activity, dict): activity = activity.get("name") or activity.get("id")
                ts = row.get(ts_f)
                owner = row.get(res_f)
                if isinstance(owner, dict): owner = owner.get("name") or owner.get("id")
                amount = None
                if amt_f and row.get(amt_f) is not None:
                    try: amount = float(row[amt_f])
                    except (TypeError, ValueError): pass
                if not case or not activity or not ts: continue
                events.append({"case_id": str(case), "activity": str(activity), "timestamp": ts,
                    "resource": str(owner) if owner else None, "amount": amount, "source_model": module})
                if len(events) >= limit: break
            if not (data.get("info") or {}).get("more_records"): break
            page += 1
        return events
