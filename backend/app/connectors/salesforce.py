from __future__ import annotations
from typing import Any
from urllib.parse import urlparse
import httpx
from app.connectors.base import BaseConnector, ConnectorError

class SalesforceConnector(BaseConnector):
    key = "salesforce"
    name = "Salesforce"

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.instance_url = str(config.get("instance_url") or config.get("base_url") or "").rstrip("/")
        parsed = urlparse(self.instance_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ConnectorError("Salesforce instance_url required (https://xxx.my.salesforce.com)")
        self.api_key = config.get("api_key") or ""
        if len(self.api_key) < 10: raise ConnectorError("Salesforce access token required")
        self.api_version = config.get("api_version") or "v59.0"
        self.timeout = float(config.get("timeout", 30))

    def _headers(self):
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "User-Agent": "ProcessMine/3.0"}

    def _get(self, path: str, params=None):
        try:
            r = httpx.get(f"{self.instance_url}{path}", headers=self._headers(), params=params or {}, timeout=self.timeout)
        except httpx.HTTPError as exc:
            raise ConnectorError(f"Could not reach Salesforce: {exc}") from exc
        if r.status_code >= 400: raise ConnectorError(f"Salesforce HTTP {r.status_code}: {r.text[:400]}")
        return r.json()

    def test_connection(self):
        data = self._get(f"/services/data/{self.api_version}/sobjects")
        return {"ok": True, "sobject_count": len(data.get("sobjects") or [])}

    def discover(self):
        return {"recommended": [
            {"key": "cases", "label": "Case lifecycle", "sobject": "Case", "case_field": "Id", "activity_field": "Status", "timestamp_field": "LastModifiedDate", "resource_field": "OwnerId"},
            {"key": "opportunities", "label": "Opportunity pipeline", "sobject": "Opportunity", "case_field": "Id", "activity_field": "StageName", "timestamp_field": "LastModifiedDate", "amount_field": "Amount"},
        ]}

    def fetch_events(self, mapping):
        sobject = mapping.get("sobject") or mapping.get("model") or "Case"
        case_f = mapping.get("case_field") or "Id"
        act_f = mapping.get("activity_field") or "Status"
        ts_f = mapping.get("timestamp_field") or "LastModifiedDate"
        res_f = mapping.get("resource_field") or "OwnerId"
        amt_f = mapping.get("amount_field")
        limit = min(int(mapping.get("limit", 5000)), 10000)
        fields = list(dict.fromkeys([f for f in [case_f, act_f, ts_f, res_f, amt_f] if f]))
        soql = f"SELECT {', '.join(fields)} FROM {sobject} ORDER BY {ts_f} ASC LIMIT {limit}"
        data = self._get(f"/services/data/{self.api_version}/query", {"q": soql})
        events = []
        for row in data.get("records") or []:
            case, activity, ts = row.get(case_f), row.get(act_f), row.get(ts_f)
            if not case or not activity or not ts: continue
            amount = None
            if amt_f and row.get(amt_f) is not None:
                try: amount = float(row[amt_f])
                except (TypeError, ValueError): pass
            events.append({"case_id": str(case), "activity": str(activity), "timestamp": ts,
                "resource": str(row[res_f]) if row.get(res_f) else None, "amount": amount, "source_model": sobject})
        return events
