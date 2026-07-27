/*
  # Remove anon policies for production security

  Removes all anonymous access policies that were only meant for demo purposes.
  Only authenticated users can now access CMDB data.

  ## Changes
  - DROP all "Anon can..." policies on cmdb_clients
  - DROP all "Anon can..." policies on cmdb_items
*/

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('cmdb_clients', 'cmdb_items')
      AND policyname LIKE 'Anon can%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;
