from __future__ import annotations
from typing import Any
import httpx
from app.connectors.base import BaseConnector, ConnectorError

class MondayConnector(BaseConnector):
    key = "monday"
    name = "Monday.com"

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.api_key = config.get("api_key") or ""
        if len(self.api_key) < 10: raise ConnectorError("Monday.com API token required")
        self.board_id = config.get("board_id")
        self.timeout = float(config.get("timeout", 30))

    def _gql(self, query: str, variables=None):
        try:
            r = httpx.post("https://api.monday.com/v2", headers={
                "Authorization": self.api_key, "Content-Type": "application/json",
                "User-Agent": "ProcessMine/3.0", "API-Version": "2024-01",
            }, json={"query": query, "variables": variables or {}}, timeout=self.timeout)
        except httpx.HTTPError as exc:
            raise ConnectorError(f"Could not reach Monday.com: {exc}") from exc
        if r.status_code >= 400: raise ConnectorError(f"Monday.com HTTP {r.status_code}: {r.text[:400]}")
        body = r.json()
        if body.get("errors"): raise ConnectorError(f"Monday.com GraphQL error: {body['errors'][0]}")
        return body.get("data") or {}

    def test_connection(self):
        data = self._gql("{ me { id name } }")
        me = data.get("me") or {}
        return {"ok": True, "user_id": me.get("id"), "name": me.get("name")}

    def discover(self):
        data = self._gql("{ boards (limit: 50) { id name } }")
        boards = data.get("boards") or []
        return {
            "boards": [{"id": b.get("id"), "name": b.get("name")} for b in boards],
            "recommended": [{"key": "board_items", "label": "Board item status", "board_id": str(boards[0]["id"]) if boards else ""}],
        }

    def fetch_events(self, mapping):
        board_id = mapping.get("board_id") or self.board_id
        if not board_id: raise ConnectorError("board_id required in mapping or config")
        limit = min(int(mapping.get("limit", 5000)), 10000)
        status_column_id = mapping.get("status_column_id")
        query = """query ($boardIds: [ID!]) { boards (ids: $boardIds) { id items_page (limit: 100) { items { id name updated_at column_values { id text type } } } } }"""
        data = self._gql(query, {"boardIds": [str(board_id)]})
        events = []
        for board in data.get("boards") or []:
            for item in ((board.get("items_page") or {}).get("items")) or []:
                activity, resource = None, None
                for col in item.get("column_values") or []:
                    ctype = (col.get("type") or "").lower()
                    if status_column_id and col.get("id") == status_column_id:
                        activity = col.get("text") or "unknown"
                    elif not status_column_id and ctype in ("status", "color"):
                        activity = col.get("text") or activity
                    if ctype in ("people", "multiple-person"):
                        resource = col.get("text") or resource
                activity = activity or "open"
                case_id, ts = item.get("id"), item.get("updated_at")
                if not case_id or not ts: continue
                events.append({"case_id": str(case_id), "activity": str(activity), "timestamp": ts,
                    "resource": resource, "amount": None, "source_model": f"board_{board_id}"})
                if len(events) >= limit: return events
        return events
