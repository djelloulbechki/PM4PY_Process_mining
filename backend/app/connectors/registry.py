from app.connectors.base import BaseConnector
from app.connectors.odoo import OdooConnector
from app.connectors.hubspot import HubSpotConnector
from app.connectors.salesforce import SalesforceConnector
from app.connectors.zendesk import ZendeskConnector
from app.connectors.monday import MondayConnector
from app.connectors.zoho import ZohoConnector
from app.connectors.dynamics365 import Dynamics365Connector

CONNECTORS: dict[str, type[BaseConnector]] = {
    "odoo": OdooConnector,
    "hubspot": HubSpotConnector,
    "salesforce": SalesforceConnector,
    "zendesk": ZendeskConnector,
    "monday": MondayConnector,
    "zoho": ZohoConnector,
    "dynamics365": Dynamics365Connector,
}


def get_connector(key: str, config: dict) -> BaseConnector:
    cls = CONNECTORS.get(key)
    if not cls:
        raise ValueError(f"Unsupported connector: {key}")
    return cls(config)
