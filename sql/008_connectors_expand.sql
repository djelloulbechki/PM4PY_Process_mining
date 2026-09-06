-- Expand connector_type for Marketplace platforms.
-- Safe to run on production: drops old check, adds expanded check.
-- Odoo remains fully supported.

alter table public.data_sources
  drop constraint if exists data_sources_connector_type_check;

alter table public.data_sources
  add constraint data_sources_connector_type_check
  check (
    connector_type in (
      'odoo',
      'hubspot',
      'salesforce',
      'zendesk',
      'monday',
      'zoho',
      'dynamics365'
    )
  );
