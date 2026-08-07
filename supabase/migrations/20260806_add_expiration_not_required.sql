ALTER TABLE public.cmdb_items
  ADD COLUMN IF NOT EXISTS expiration_not_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cmdb_items.expiration_not_required IS
  'True when the service intentionally has no expiration date.';

UPDATE public.cmdb_items
SET expiration_date = NULL,
    status = 'Not required'
WHERE expiration_not_required = true;

