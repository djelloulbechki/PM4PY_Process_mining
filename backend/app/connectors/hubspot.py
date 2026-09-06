from __future__ import annotations
from typing import Any
import httpx
from app.connectors.base import BaseConnector, ConnectorError

class HubSpotConnector(BaseConnector):
    key = "hubspot"
    name = "HubSpot"

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.api_key = config.get("api_key") or ""
        if len(self.api_key) < 10:
            raise ConnectorError("HubSpot private app access token is required.")
        self.timeout = float(config.get("timeout", 30))

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "User-Agent": "ProcessMine/3.0"}

    def _get(self, path: str, params: dict | None = None) -> Any:
        try:
            r = httpx.get(f"https://api.hubapi.com{path}", headers=self._headers(), params=params or {}, timeout=self.timeout)
        except httpx.HTTPError as exc:
            raise ConnectorError(f"Could not reach HubSpot: {exc}") from exc
        if r.status_code >= 400:
            raise ConnectorError(f"HubSpot HTTP {r.status_code}: {r.text[:400]}")
        return r.json()

    def test_connection(self) -> dict[str, Any]:
        data = self._get("/crm/v3/objects/contacts", {"limit": 1})
        return {"ok": True, "total": data.get("total")}

    def discover(self) -> dict[str, Any]:
        return {
            "recommended": [
                {"key": "tickets", "label": "Ticket lifecycle", "object_type": "tickets", "case_field": "id", "activity_field": "hs_pipeline_stage", "timestamp_field": "hs_lastmodifieddate"},
                {"key": "deals", "label": "Deal pipeline", "object_type": "deals", "case_field": "id", "activity_field": "dealstage", "timestamp_field": "hs_lastmodifieddate", "amount_field": "amount"},
            ],
            "mapping_hints": {"object_type": "tickets | deals"},
        }

    def fetch_events(self, mapping: dict[str, Any]) -> list[dict[str, Any]]:
        object_type = mapping.get("object_type") or "tickets"
        if object_type not in ("tickets", "deals"):
            raise ConnectorError("object_type must be tickets or deals")
        props = {
            "tickets": "hs_pipeline_stage,hs_lastmodifieddate,createdate,hubspot_owner_id",
            "deals": "dealstage,amount,hs_lastmodifieddate,createdate,hubspot_owner_id,closedate",
        }[object_type]
        limit = min(int(mapping.get("limit", 5000)), 10000)
        events, after, fetched = [], None, 0
        while fetched < limit:
            params: dict[str, Any] = {"limit": min(100, limit - fetched), "properties": props}
            if after: params["after"] = after
            data = self._get(f"/crm/v3/objects/{object_type}", params)
            rows = data.get("results") or []
            if not rows: break
            for row in rows:
                p = row.get("properties") or {}
                case_id = row.get("id")
                if object_type == "tickets":
                    activity, ts = p.get("hs_pipeline_stage") or "unknown", p.get("hs_lastmodifieddate") or p.get("createdate")
                    amount = None
                else:
                    activity, ts = p.get("dealstage") or "unknown", p.get("hs_lastmodifieddate") or p.get("createdate")
                    try: amount = float(p["amount"]) if p.get("amount") not in (None, "") else None
                    except (TypeError, ValueError): amount = None
                if not case_id or not ts: continue
                events.append({"case_id": str(case_id), "activity": str(activity), "timestamp": ts,
                    "resource": str(p["hubspot_owner_id"]) if p.get("hubspot_owner_id") else None,
                    "amount": amount, "source_model": object_type})
                fetched += 1
                if fetched >= limit: break
            after = (data.get("paging") or {}).get("next", {}).get("after")
            if not after: break
        return events
