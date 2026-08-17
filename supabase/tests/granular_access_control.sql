-- Run in a disposable Supabase project after applying all migrations.
-- These assertions validate the schema-level invariants without changing users.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cmdb_user_roles_role_check'
      AND pg_get_constraintdef(oid) LIKE '%superuser%'
  ) THEN
    RAISE EXCEPTION 'superuser role constraint is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'cmdb_has_permission'
  ) THEN
    RAISE EXCEPTION 'cmdb_has_permission function is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'cmdb_get_my_access'
  ) THEN
    RAISE EXCEPTION 'cmdb_get_my_access function is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'preserve_last_cmdb_admin'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'last superuser protection trigger is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cmdb_user_roles
    WHERE lower(user_email) = 'bhernandez@josys.com.mx'
      AND role = 'superuser'
  ) THEN
    RAISE EXCEPTION 'initial superuser assignment is missing';
  END IF;
END;
$$;
