/*
  # Add license vendor and branch

  Stores supplier/vendor and organizational branch information for license
  records. Empty values keep existing records backward compatible.
*/

ALTER TABLE public.cmdb_items
  ADD COLUMN IF NOT EXISTS vendor text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT '';
