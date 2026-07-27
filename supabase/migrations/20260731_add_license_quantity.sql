/*
  # Add license quantity

  Tracks the number of seats, subscriptions, devices, or units represented by
  a license record.
*/

ALTER TABLE public.cmdb_items
  ADD COLUMN IF NOT EXISTS qty integer NOT NULL DEFAULT 1;

ALTER TABLE public.cmdb_items
  DROP CONSTRAINT IF EXISTS cmdb_items_qty_nonnegative;

ALTER TABLE public.cmdb_items
  ADD CONSTRAINT cmdb_items_qty_nonnegative CHECK (qty >= 0);
