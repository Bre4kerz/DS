/*
  # Add process_updated_at to cmdb_items

  Tracks when the process field was last updated,
  enabling stale-process alerts for Vencido/Próximo items.
*/

ALTER TABLE cmdb_items
  ADD COLUMN IF NOT EXISTS process_updated_at timestamptz DEFAULT NULL;
