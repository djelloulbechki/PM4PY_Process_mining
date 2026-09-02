from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from app.connectors.base import BaseConnector, ConnectorError


class OdooConnector(BaseConnector):
    key = "odoo"
    name = "Odoo"

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.base_url = str(config["base_url"]).rstrip("/")
        parsed = urlparse(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ConnectorError("Odoo URL must be a valid http(s) URL.")
        self.database = config.get("database")
        self.api_key = config["api_key"]
        self.timeout = float(config.get("timeout", 30))

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ProcessIntelligence/3.0",
        }
        if self.database:
            headers["X-Odoo-Database"] = self.database
        return headers

    def call(self, model: str, method: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}/json/2/{model}/{method}"
        try:
            response = httpx.post(url, headers=self._headers(), json=payload or {}, timeout=self.timeout)
        except httpx.HTTPError as exc:
            raise ConnectorError(f"Could not reach Odoo: {exc}") from exc
        if response.status_code >= 400:
            detail = response.text[:500]
            raise ConnectorError(f"Odoo API returned HTTP {response.status_code}: {detail}")
        try:
            return response.json()
        except ValueError as exc:
            raise ConnectorError("Odoo returned a non-JSON response.") from exc

    def test_connection(self) -> dict[str, Any]:
        result = self.call("res.users", "context_get")
        return {"ok": True, "user_context": result}

    def discover(self) -> dict[str, Any]:
        # Odoo's dynamic documentation is database-specific. The ORM metadata models
        # are available through JSON-2 and let us build a connector without hardcoding
        # the customer's custom modules.
        models = self.call(
            "ir.model",
            "search_read",
            {"domain": [], "fields": ["model", "name"], "limit": 500, "order": "name"},
        )
        return {
            "models": [
                {"technical_name": row.get("model"), "name": row.get("name")}
                for row in (models or [])
                if row.get("model")
            ],
            "recommended": [
                {"key": "sales", "label": "Sales / Order-to-Cash", "model": "sale.order"},
                {"key": "purchases", "label": "Purchases / Procure-to-Pay", "model": "purchase.order"},
                {"key": "inventory", "label": "Inventory", "model": "stock.picking"},
                {"key": "invoicing", "label": "Invoicing", "model": "account.move"},
                {"key": "manufacturing", "label": "Manufacturing", "model": "mrp.production"},
                {"key": "helpdesk", "label": "Helpdesk", "model": "helpdesk.ticket"},
            ],
        }

    def fetch_events(self, mapping: dict[str, Any]) -> list[dict[str, Any]]:
        model = mapping.get("model")
        case_field = mapping.get("case_field")
        activity_field = mapping.get("activity_field")
        timestamp_field = mapping.get("timestamp_field")
        resource_field = mapping.get("resource_field")
        amount_field = mapping.get("amount_field")
        domain = mapping.get("domain") or []
        limit = min(int(mapping.get("limit", 10000)), 100000)
        if not model or not case_field or not activity_field or not timestamp_field:
            raise ConnectorError("model, case_field, activity_field and timestamp_field are required.")

        fields = list(dict.fromkeys([case_field, activity_field, timestamp_field, resource_field, amount_field]))
        fields = [f for f in fields if f]
        rows = self.call(
            model,
            "search_read",
            {"domain": domain, "fields": fields, "limit": limit, "order": f"{timestamp_field} asc"},
        )
        events: list[dict[str, Any]] = []
        for row in rows or []:
            case = self._scalar(row.get(case_field))
            activity = self._scalar(row.get(activity_field))
            timestamp = row.get(timestamp_field)
            if case in (None, "") or activity in (None, "") or not timestamp:
                continue
            events.append(
                {
                    "case_id": str(case),
                    "activity": str(activity),
                    "timestamp": timestamp,
                    "resource": self._scalar(row.get(resource_field)) if resource_field else None,
                    "amount": self._number(row.get(amount_field)) if amount_field else None,
                    "source_model": model,
                }
            )
        return events

    @staticmethod
    def _scalar(value: Any) -> Any:
        if isinstance(value, (list, tuple)) and len(value) >= 2:
            return value[1]
        return value

    @staticmethod
    def _number(value: Any) -> float | None:
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None
