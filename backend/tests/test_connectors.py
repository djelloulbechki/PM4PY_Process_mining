from app.connectors.odoo import OdooConnector


def test_odoo_headers_and_scalar():
    c = OdooConnector({"base_url": "https://example.com", "api_key": "x" * 20, "database": "db"})
    assert c._headers()["Authorization"].startswith("bearer ")
    assert c._headers()["X-Odoo-Database"] == "db"
    assert c._scalar([7, "Sales User"]) == "Sales User"
