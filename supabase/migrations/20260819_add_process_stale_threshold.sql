/*
  # Track stalled renewal processes

  Each record can define how many days it may remain in the same renewal stage
  before the dashboard marks it as stalled.
*/

ALTER TABLE public.cmdb_items
  ADD COLUMN IF NOT EXISTS process_stale_days integer NOT NULL DEFAULT 5;

ALTER TABLE public.cmdb_items
  DROP CONSTRAINT IF EXISTS cmdb_items_process_stale_days_check;

ALTER TABLE public.cmdb_items
  ADD CONSTRAINT cmdb_items_process_stale_days_check
  CHECK (process_stale_days BETWEEN 1 AND 365);

UPDATE public.cmdb_items
SET process_updated_at = COALESCE(updated_at, now())
WHERE COALESCE(process, '') <> ''
  AND process_updated_at IS NULL;

