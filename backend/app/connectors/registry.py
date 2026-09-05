from app.connectors.base import BaseConnector
from app.connectors.odoo import OdooConnector

CONNECTORS: dict[str, type[BaseConnector]] = {"odoo": OdooConnector}


def get_connector(key: str, config: dict) -> BaseConnector:
    cls = CONNECTORS.get(key)
    if not cls:
        raise ValueError(f"Unsupported connector: {key}")
    return cls(config)
