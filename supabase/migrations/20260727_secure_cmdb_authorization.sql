/*
  # Enforce CMDB authorization in PostgreSQL

  The UI may hide editing controls, but PostgreSQL/RLS is the security boundary.
  Authenticated viewers can read CMDB data. Only users registered as admins can
  create, update, or delete it.

  Existing role records are preserved. Users without a role are viewers.
*/

CREATE TABLE IF NOT EXISTS public.cmdb_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- UUID is the durable identity. user_email remains temporarily for compatibility
-- with the current role-management UI and existing installations.
ALTER TABLE public.cmdb_user_roles
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.cmdb_user_roles AS roles
SET user_id = users.id
FROM auth.users AS users
WHERE roles.user_id IS NULL
  AND lower(roles.user_email) = lower(users.email);

CREATE UNIQUE INDEX IF NOT EXISTS cmdb_user_roles_user_email_key
  ON public.cmdb_user_roles (user_email);

CREATE UNIQUE INDEX IF NOT EXISTS cmdb_user_roles_user_id_key
  ON public.cmdb_user_roles (user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cmdb_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.cmdb_items(id) ON DELETE CASCADE,
  user_email text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now(),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS cmdb_item_history_item_changed_idx
  ON public.cmdb_item_history (item_id, changed_at DESC);

ALTER TABLE public.cmdb_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmdb_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmdb_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmdb_item_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_cmdb_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cmdb_user_roles AS roles
    WHERE roles.role = 'admin'
      AND (
        roles.user_id = auth.uid()
        OR (
          roles.user_id IS NULL
          AND lower(roles.user_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_cmdb_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_cmdb_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_cmdb_admin() TO authenticated;

-- Remove every previous policy on these tables so a permissive legacy policy
-- cannot silently override the new authorization model.
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'cmdb_clients',
        'cmdb_items',
        'cmdb_user_roles',
        'cmdb_item_history'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can read clients"
  ON public.cmdb_clients
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert clients"
  ON public.cmdb_clients
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_cmdb_admin());

CREATE POLICY "Admins can update clients"
  ON public.cmdb_clients
  FOR UPDATE
  TO authenticated
  USING (public.is_cmdb_admin())
  WITH CHECK (public.is_cmdb_admin());

CREATE POLICY "Admins can delete clients"
  ON public.cmdb_clients
  FOR DELETE
  TO authenticated
  USING (public.is_cmdb_admin());

CREATE POLICY "Authenticated users can read items"
  ON public.cmdb_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert items"
  ON public.cmdb_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_cmdb_admin());

CREATE POLICY "Admins can update items"
  ON public.cmdb_items
  FOR UPDATE
  TO authenticated
  USING (public.is_cmdb_admin())
  WITH CHECK (public.is_cmdb_admin());

CREATE POLICY "Admins can delete items"
  ON public.cmdb_items
  FOR DELETE
  TO authenticated
  USING (public.is_cmdb_admin());

CREATE POLICY "Users can read their role and admins can read all roles"
  ON public.cmdb_user_roles
  FOR SELECT
  TO authenticated
  USING (
    public.is_cmdb_admin()
    OR user_id = auth.uid()
    OR (
      user_id IS NULL
      AND lower(user_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );

CREATE POLICY "Admins can insert roles"
  ON public.cmdb_user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_cmdb_admin());

CREATE POLICY "Admins can update roles"
  ON public.cmdb_user_roles
  FOR UPDATE
  TO authenticated
  USING (public.is_cmdb_admin())
  WITH CHECK (public.is_cmdb_admin());

CREATE POLICY "Admins can delete roles"
  ON public.cmdb_user_roles
  FOR DELETE
  TO authenticated
  USING (public.is_cmdb_admin());

CREATE POLICY "Authenticated users can read item history"
  ON public.cmdb_item_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert item history"
  ON public.cmdb_item_history
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_cmdb_admin());

CREATE POLICY "Admins can delete item history"
  ON public.cmdb_item_history
  FOR DELETE
  TO authenticated
  USING (public.is_cmdb_admin());
