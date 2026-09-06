from __future__ import annotations
from typing import Any
from urllib.parse import urlparse
import httpx
from app.connectors.base import BaseConnector, ConnectorError

class ZendeskConnector(BaseConnector):
    key = "zendesk"
    name = "Zendesk"

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.base_url = str(config.get("base_url") or "").rstrip("/")
        parsed = urlparse(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ConnectorError("Zendesk base_url required (https://subdomain.zendesk.com)")
        self.api_key = config.get("api_key") or ""
        self.email = config.get("email") or config.get("username") or ""
        if len(self.api_key) < 10: raise ConnectorError("Zendesk API token required")
        if not self.email: raise ConnectorError("Zendesk agent email required (config.email)")
        self.timeout = float(config.get("timeout", 30))

    def _auth(self):
        return (f"{self.email}/token", self.api_key)

    def _get_url(self, url: str, params=None):
        try:
            r = httpx.get(url, auth=self._auth(), params=params, timeout=self.timeout, headers={"User-Agent": "ProcessMine/3.0"})
        except httpx.HTTPError as exc:
            raise ConnectorError(f"Could not reach Zendesk: {exc}") from exc
        if r.status_code >= 400: raise ConnectorError(f"Zendesk HTTP {r.status_code}: {r.text[:400]}")
        return r.json()

    def test_connection(self):
        data = self._get_url(f"{self.base_url}/api/v2/users/me.json")
        u = data.get("user") or {}
        return {"ok": True, "user_id": u.get("id"), "email": u.get("email")}

    def discover(self):
        return {"recommended": [
            {"key": "tickets", "label": "Ticket status lifecycle", "object_type": "tickets",
             "case_field": "id", "activity_field": "status", "timestamp_field": "updated_at", "resource_field": "assignee_id"}
        ]}

    def fetch_events(self, mapping):
        limit = min(int(mapping.get("limit", 5000)), 10000)
        events = []
        next_url = f"{self.base_url}/api/v2/tickets.json"
        params: dict | None = {"per_page": 100, "sort_by": "updated_at", "sort_order": "asc"}
        while next_url and len(events) < limit:
            data = self._get_url(next_url, params)
            params = None
            for t in data.get("tickets") or []:
                case_id, activity, ts = t.get("id"), t.get("status"), t.get("updated_at") or t.get("created_at")
                if not case_id or not activity or not ts: continue
                events.append({"case_id": str(case_id), "activity": str(activity), "timestamp": ts,
                    "resource": str(t["assignee_id"]) if t.get("assignee_id") else None,
                    "amount": None, "source_model": "tickets"})
                if len(events) >= limit: break
            next_url = data.get("next_page")
        return events
