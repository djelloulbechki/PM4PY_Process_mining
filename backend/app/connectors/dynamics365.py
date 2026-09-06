from __future__ import annotations
from typing import Any
from urllib.parse import urlparse
import httpx
from app.connectors.base import BaseConnector, ConnectorError

class Dynamics365Connector(BaseConnector):
    key = "dynamics365"
    name = "Microsoft Dynamics 365"

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.base_url = str(config.get("base_url") or "").rstrip("/")
        parsed = urlparse(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ConnectorError("Dynamics 365 base_url required (https://org.crm.dynamics.com)")
        self.api_key = config.get("api_key") or ""
        if len(self.api_key) < 10: raise ConnectorError("Dynamics 365 OAuth access token required")
        self.api_version = config.get("api_version") or "v9.2"
        self.timeout = float(config.get("timeout", 30))

    def _headers(self):
        return {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json",
                "OData-MaxVersion": "4.0", "OData-Version": "4.0", "User-Agent": "ProcessMine/3.0"}

    def _get(self, path, params=None):
        try:
            r = httpx.get(f"{self.base_url}/api/data/{self.api_version}{path}", headers=self._headers(), params=params or {}, timeout=self.timeout)
        except httpx.HTTPError as exc:
            raise ConnectorError(f"Could not reach Dynamics 365: {exc}") from exc
        if r.status_code >= 400: raise ConnectorError(f"Dynamics 365 HTTP {r.status_code}: {r.text[:400]}")
        return r.json()

    def test_connection(self):
        data = self._get("/WhoAmI")
        return {"ok": True, "UserId": data.get("UserId"), "OrganizationId": data.get("OrganizationId")}

    def discover(self):
        return {"recommended": [
            {"key": "cases", "label": "Case status lifecycle", "entity": "incidents", "case_field": "incidentid", "activity_field": "statuscode", "timestamp_field": "modifiedon", "resource_field": "_ownerid_value"},
            {"key": "opportunities", "label": "Opportunity pipeline", "entity": "opportunities", "case_field": "opportunityid", "activity_field": "stepname", "timestamp_field": "modifiedon", "amount_field": "estimatedvalue"},
        ]}

    def fetch_events(self, mapping):
        entity = mapping.get("entity") or mapping.get("model") or "incidents"
        case_f = mapping.get("case_field") or "incidentid"
        act_f = mapping.get("activity_field") or "statuscode"
        ts_f = mapping.get("timestamp_field") or "modifiedon"
        res_f = mapping.get("resource_field") or "_ownerid_value"
        amt_f = mapping.get("amount_field")
        limit = min(int(mapping.get("limit", 5000)), 10000)
        fields = list(dict.fromkeys([f for f in [case_f, act_f, ts_f, res_f, amt_f] if f]))
        params = {"$select": ",".join(fields), "$orderby": f"{ts_f} asc", "$top": min(5000, limit)}
        if mapping.get("filter"): params["$filter"] = mapping["filter"]
        data = self._get(f"/{entity}", params)
        events = []
        for row in data.get("value") or []:
            case, activity, ts = row.get(case_f), row.get(act_f), row.get(ts_f)
            if not case or activity is None or not ts: continue
            amount = None
            if amt_f and row.get(amt_f) is not None:
                try: amount = float(row[amt_f])
                except (TypeError, ValueError): pass
            events.append({"case_id": str(case), "activity": str(activity), "timestamp": ts,
                "resource": str(row[res_f]) if row.get(res_f) else None, "amount": amount, "source_model": entity})
            if len(events) >= limit: break
        return events
