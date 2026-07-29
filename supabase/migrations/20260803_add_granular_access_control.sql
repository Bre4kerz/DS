/*
  # Granular CMDB access control

  Adds a protected superuser role, functional permissions and optional category
  scopes. Existing admins keep their current capabilities by default.
*/

ALTER TABLE public.cmdb_user_roles
  DROP CONSTRAINT IF EXISTS cmdb_user_roles_role_check;

ALTER TABLE public.cmdb_user_roles
  ADD CONSTRAINT cmdb_user_roles_role_check
  CHECK (role IN ('superuser', 'admin', 'viewer'));

DROP TRIGGER IF EXISTS preserve_last_cmdb_admin ON public.cmdb_user_roles;

UPDATE public.cmdb_user_roles
SET role = 'superuser'
WHERE lower(user_email) = 'bhernandez@josys.com.mx';

INSERT INTO public.cmdb_user_roles (user_email, user_id, role)
SELECT lower(users.email), users.id, 'superuser'
FROM auth.users AS users
WHERE lower(users.email) = 'bhernandez@josys.com.mx'
ON CONFLICT (user_email) DO UPDATE
SET user_id = EXCLUDED.user_id, role = 'superuser';

CREATE TABLE IF NOT EXISTS public.cmdb_user_permissions (
  role_id uuid NOT NULL REFERENCES public.cmdb_user_roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL CHECK (permission_key IN (
    'records.view', 'records.create', 'records.edit', 'records.delete',
    'credentials.view', 'credentials.edit', 'history.view',
    'alerts.view', 'alerts.configure', 'quality.view',
    'audit.view', 'roles.manage', 'permissions.manage'
  )),
  allowed boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.cmdb_user_category_access (
  role_id uuid NOT NULL REFERENCES public.cmdb_user_roles(id) ON DELETE CASCADE,
  category text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (role_id, category)
);

ALTER TABLE public.cmdb_user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmdb_user_category_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cmdb_user_permissions, public.cmdb_user_category_access FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.cmdb_user_permissions, public.cmdb_user_category_access
  TO authenticated;

CREATE OR REPLACE FUNCTION public.is_cmdb_superuser()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cmdb_user_roles roles
    WHERE roles.role = 'superuser'
      AND (
        roles.user_id = auth.uid()
        OR (roles.user_id IS NULL AND lower(roles.user_email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.cmdb_has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH active_cmdb_role AS (
    SELECT id, role
    FROM public.cmdb_user_roles
    WHERE user_id = auth.uid()
       OR (user_id IS NULL AND lower(user_email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
    ORDER BY (user_id = auth.uid()) DESC
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT true FROM active_cmdb_role WHERE role = 'superuser'),
    (SELECT permissions.allowed
       FROM active_cmdb_role
       JOIN public.cmdb_user_permissions permissions ON permissions.role_id = active_cmdb_role.id
      WHERE permissions.permission_key = p_permission),
    (SELECT CASE
       WHEN role = 'admin' THEN p_permission <> 'permissions.manage'
       WHEN role = 'viewer' THEN p_permission IN ('records.view', 'history.view', 'alerts.view', 'quality.view')
       ELSE false
     END FROM active_cmdb_role),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.cmdb_can_view_category(p_category text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH active_cmdb_role AS (
    SELECT id, role FROM public.cmdb_user_roles
    WHERE user_id = auth.uid()
       OR (user_id IS NULL AND lower(user_email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
    LIMIT 1
  )
  SELECT public.cmdb_has_permission('records.view') AND (
    EXISTS (SELECT 1 FROM active_cmdb_role WHERE role = 'superuser')
    OR NOT EXISTS (
      SELECT 1 FROM public.cmdb_user_category_access category_scope
      JOIN active_cmdb_role ON active_cmdb_role.id = category_scope.role_id
    )
    OR EXISTS (
      SELECT 1 FROM public.cmdb_user_category_access category_scope
      JOIN active_cmdb_role ON active_cmdb_role.id = category_scope.role_id
      WHERE category_scope.category = p_category AND category_scope.can_view
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.cmdb_can_edit_category(p_category text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH active_cmdb_role AS (
    SELECT id, role FROM public.cmdb_user_roles
    WHERE user_id = auth.uid()
       OR (user_id IS NULL AND lower(user_email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
    LIMIT 1
  )
  SELECT public.cmdb_has_permission('records.edit') AND (
    EXISTS (SELECT 1 FROM active_cmdb_role WHERE role = 'superuser')
    OR NOT EXISTS (
      SELECT 1 FROM public.cmdb_user_category_access category_scope
      JOIN active_cmdb_role ON active_cmdb_role.id = category_scope.role_id
    )
    OR EXISTS (
      SELECT 1 FROM public.cmdb_user_category_access category_scope
      JOIN active_cmdb_role ON active_cmdb_role.id = category_scope.role_id
      WHERE category_scope.category = p_category AND category_scope.can_edit
    )
  );
$$;

REVOKE ALL ON FUNCTION public.is_cmdb_superuser() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cmdb_has_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cmdb_can_view_category(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cmdb_can_edit_category(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cmdb_superuser() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cmdb_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cmdb_can_view_category(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cmdb_can_edit_category(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_cmdb_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cmdb_user_roles roles
    WHERE roles.role IN ('superuser', 'admin')
      AND (
        roles.user_id = auth.uid()
        OR (roles.user_id IS NULL AND lower(roles.user_email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
      )
  );
$$;

DROP POLICY IF EXISTS "Users can read their role and admins can read all roles" ON public.cmdb_user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.cmdb_user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.cmdb_user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.cmdb_user_roles;

CREATE POLICY "Users read own role or manage access"
  ON public.cmdb_user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(user_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    OR public.cmdb_has_permission('permissions.manage')
    OR public.cmdb_has_permission('roles.manage')
  );

CREATE POLICY "Role managers insert non-superusers"
  ON public.cmdb_user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_cmdb_superuser()
    OR (public.cmdb_has_permission('roles.manage') AND role <> 'superuser')
  );

CREATE POLICY "Role managers update non-superusers"
  ON public.cmdb_user_roles FOR UPDATE TO authenticated
  USING (
    public.is_cmdb_superuser()
    OR (public.cmdb_has_permission('roles.manage') AND role <> 'superuser')
  )
  WITH CHECK (
    public.is_cmdb_superuser()
    OR (public.cmdb_has_permission('roles.manage') AND role <> 'superuser')
  );

CREATE POLICY "Role managers delete non-superusers"
  ON public.cmdb_user_roles FOR DELETE TO authenticated
  USING (
    public.is_cmdb_superuser()
    OR (public.cmdb_has_permission('roles.manage') AND role <> 'superuser')
  );

-- Permission tables: users read their own access; permission managers read and
-- change non-superuser access. Only a superuser may affect another superuser.
CREATE POLICY "Read own permissions or manage access"
  ON public.cmdb_user_permissions FOR SELECT TO authenticated
  USING (
    public.cmdb_has_permission('permissions.manage')
    OR role_id IN (SELECT id FROM public.cmdb_user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Permission managers insert permissions"
  ON public.cmdb_user_permissions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_cmdb_superuser()
    OR (
      public.cmdb_has_permission('permissions.manage')
      AND role_id IN (SELECT id FROM public.cmdb_user_roles WHERE role <> 'superuser')
    )
  );

CREATE POLICY "Permission managers update permissions"
  ON public.cmdb_user_permissions FOR UPDATE TO authenticated
  USING (
    public.is_cmdb_superuser()
    OR (
      public.cmdb_has_permission('permissions.manage')
      AND role_id IN (SELECT id FROM public.cmdb_user_roles WHERE role <> 'superuser')
    )
  )
  WITH CHECK (
    public.is_cmdb_superuser()
    OR role_id IN (SELECT id FROM public.cmdb_user_roles WHERE role <> 'superuser')
  );

CREATE POLICY "Permission managers delete permissions"
  ON public.cmdb_user_permissions FOR DELETE TO authenticated
  USING (
    public.is_cmdb_superuser()
    OR (
      public.cmdb_has_permission('permissions.manage')
      AND role_id IN (SELECT id FROM public.cmdb_user_roles WHERE role <> 'superuser')
    )
  );

CREATE POLICY "Read own categories or manage access"
  ON public.cmdb_user_category_access FOR SELECT TO authenticated
  USING (
    public.cmdb_has_permission('permissions.manage')
    OR role_id IN (SELECT id FROM public.cmdb_user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Permission managers insert categories"
  ON public.cmdb_user_category_access FOR INSERT TO authenticated
  WITH CHECK (
    public.is_cmdb_superuser()
    OR (
      public.cmdb_has_permission('permissions.manage')
      AND role_id IN (SELECT id FROM public.cmdb_user_roles WHERE role <> 'superuser')
    )
  );

CREATE POLICY "Permission managers update categories"
  ON public.cmdb_user_category_access FOR UPDATE TO authenticated
  USING (
    public.is_cmdb_superuser()
    OR (
      public.cmdb_has_permission('permissions.manage')
      AND role_id IN (SELECT id FROM public.cmdb_user_roles WHERE role <> 'superuser')
    )
  )
  WITH CHECK (
    public.is_cmdb_superuser()
    OR role_id IN (SELECT id FROM public.cmdb_user_roles WHERE role <> 'superuser')
  );

CREATE POLICY "Permission managers delete categories"
  ON public.cmdb_user_category_access FOR DELETE TO authenticated
  USING (
    public.is_cmdb_superuser()
    OR (
      public.cmdb_has_permission('permissions.manage')
      AND role_id IN (SELECT id FROM public.cmdb_user_roles WHERE role <> 'superuser')
    )
  );

-- Replace data policies with permission-aware policies.
DROP POLICY IF EXISTS "Authenticated users can read clients" ON public.cmdb_clients;
DROP POLICY IF EXISTS "Admins can insert clients" ON public.cmdb_clients;
DROP POLICY IF EXISTS "Admins can update clients" ON public.cmdb_clients;
DROP POLICY IF EXISTS "Admins can delete clients" ON public.cmdb_clients;
CREATE POLICY "Permitted users read clients" ON public.cmdb_clients FOR SELECT TO authenticated
  USING (public.cmdb_has_permission('records.view'));
CREATE POLICY "Permitted users insert clients" ON public.cmdb_clients FOR INSERT TO authenticated
  WITH CHECK (public.cmdb_has_permission('records.create'));
CREATE POLICY "Permitted users update clients" ON public.cmdb_clients FOR UPDATE TO authenticated
  USING (public.cmdb_has_permission('records.edit')) WITH CHECK (public.cmdb_has_permission('records.edit'));
CREATE POLICY "Permitted users delete clients" ON public.cmdb_clients FOR DELETE TO authenticated
  USING (public.cmdb_has_permission('records.delete'));

DROP POLICY IF EXISTS "Authenticated users can read items" ON public.cmdb_items;
DROP POLICY IF EXISTS "Admins can insert items" ON public.cmdb_items;
DROP POLICY IF EXISTS "Admins can update items" ON public.cmdb_items;
DROP POLICY IF EXISTS "Admins can delete items" ON public.cmdb_items;
CREATE POLICY "Permitted users read items" ON public.cmdb_items FOR SELECT TO authenticated
  USING (public.cmdb_can_view_category(category));
CREATE POLICY "Permitted users insert items" ON public.cmdb_items FOR INSERT TO authenticated
  WITH CHECK (public.cmdb_has_permission('records.create') AND public.cmdb_can_edit_category(category));
CREATE POLICY "Permitted users update items" ON public.cmdb_items FOR UPDATE TO authenticated
  USING (public.cmdb_can_edit_category(category)) WITH CHECK (public.cmdb_can_edit_category(category));
CREATE POLICY "Permitted users delete items" ON public.cmdb_items FOR DELETE TO authenticated
  USING (public.cmdb_has_permission('records.delete') AND public.cmdb_can_edit_category(category));

DROP POLICY IF EXISTS "Authenticated users can read item history" ON public.cmdb_item_history;
DROP POLICY IF EXISTS "Admins can insert item history" ON public.cmdb_item_history;
DROP POLICY IF EXISTS "Admins can delete item history" ON public.cmdb_item_history;
CREATE POLICY "Permitted users read item history" ON public.cmdb_item_history FOR SELECT TO authenticated
  USING (public.cmdb_has_permission('history.view'));
CREATE POLICY "Permitted users insert item history" ON public.cmdb_item_history FOR INSERT TO authenticated
  WITH CHECK (public.cmdb_has_permission('records.edit'));

DROP POLICY IF EXISTS "Admins can read alert settings" ON public.cmdb_alert_settings;
DROP POLICY IF EXISTS "Admins can update alert settings" ON public.cmdb_alert_settings;
CREATE POLICY "Permitted users read alert settings" ON public.cmdb_alert_settings FOR SELECT TO authenticated
  USING (public.cmdb_has_permission('alerts.configure'));
CREATE POLICY "Permitted users update alert settings" ON public.cmdb_alert_settings FOR UPDATE TO authenticated
  USING (public.cmdb_has_permission('alerts.configure'))
  WITH CHECK (public.cmdb_has_permission('alerts.configure'));

DROP POLICY IF EXISTS "Admins can read notification history" ON public.cmdb_expiration_notifications;
CREATE POLICY "Permitted users read notification history" ON public.cmdb_expiration_notifications FOR SELECT TO authenticated
  USING (public.cmdb_has_permission('alerts.view'));

DROP POLICY IF EXISTS "Authenticated users can read quality issues" ON public.cmdb_data_quality_issues;
DROP POLICY IF EXISTS "Admins can update quality issues" ON public.cmdb_data_quality_issues;
CREATE POLICY "Permitted users read quality issues" ON public.cmdb_data_quality_issues FOR SELECT TO authenticated
  USING (public.cmdb_has_permission('quality.view'));
CREATE POLICY "Permitted users update quality issues" ON public.cmdb_data_quality_issues FOR UPDATE TO authenticated
  USING (public.cmdb_has_permission('quality.view'))
  WITH CHECK (public.cmdb_has_permission('quality.view'));

DROP POLICY IF EXISTS "Admins can read audit logs" ON public.cmdb_audit_logs;
CREATE POLICY "Permitted users read audit logs" ON public.cmdb_audit_logs FOR SELECT TO authenticated
  USING (public.cmdb_has_permission('audit.view'));

DROP TRIGGER IF EXISTS audit_cmdb_user_permissions ON public.cmdb_user_permissions;
CREATE TRIGGER audit_cmdb_user_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.cmdb_user_permissions
FOR EACH ROW EXECUTE FUNCTION public.capture_cmdb_audit_change();

DROP TRIGGER IF EXISTS audit_cmdb_user_category_access ON public.cmdb_user_category_access;
CREATE TRIGGER audit_cmdb_user_category_access
AFTER INSERT OR UPDATE OR DELETE ON public.cmdb_user_category_access
FOR EACH ROW EXECUTE FUNCTION public.capture_cmdb_audit_change();

DO $$
DECLARE
  function_definition text;
BEGIN
  function_definition := pg_get_functiondef(
    'public.reveal_cmdb_credentials(uuid)'::regprocedure
  );
  function_definition := replace(
    function_definition,
    'IF NOT public.is_cmdb_admin() THEN',
    'IF NOT public.cmdb_has_permission(''credentials.view'') THEN'
  );
  EXECUTE function_definition;

  function_definition := pg_get_functiondef(
    'public.save_cmdb_credentials(uuid,text,text,text,text,text)'::regprocedure
  );
  function_definition := replace(
    function_definition,
    'IF NOT public.is_cmdb_admin() THEN',
    'IF NOT public.cmdb_has_permission(''credentials.edit'') THEN'
  );
  EXECUTE function_definition;
END;
$$;

CREATE OR REPLACE FUNCTION public.reveal_cmdb_credentials_authorized(p_item_id uuid)
RETURNS TABLE (
  username text,
  password text,
  alternative_username text,
  alternative_password text,
  notes text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.cmdb_has_permission('credentials.view') THEN
    RAISE EXCEPTION 'Credential access is not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.reveal_cmdb_credentials(p_item_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_cmdb_credentials_authorized(
  p_item_id uuid,
  p_username text,
  p_password text,
  p_alternative_username text,
  p_alternative_password text,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.cmdb_has_permission('credentials.edit') THEN
    RAISE EXCEPTION 'Credential editing is not permitted' USING ERRCODE = '42501';
  END IF;
  PERFORM public.save_cmdb_credentials(
    p_item_id, p_username, p_password, p_alternative_username,
    p_alternative_password, p_notes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reveal_cmdb_credentials(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_cmdb_credentials(uuid, text, text, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.reveal_cmdb_credentials_authorized(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_cmdb_credentials_authorized(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_cmdb_credentials_authorized(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_cmdb_credentials_authorized(uuid, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.preserve_last_cmdb_admin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'superuser'
    AND (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.role <> 'superuser'))
    AND (SELECT count(*) FROM public.cmdb_user_roles WHERE role = 'superuser') <= 1
  THEN
    RAISE EXCEPTION 'At least one CMDB superuser is required' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER preserve_last_cmdb_admin
BEFORE UPDATE OF role OR DELETE ON public.cmdb_user_roles
FOR EACH ROW EXECUTE FUNCTION public.preserve_last_cmdb_admin();

REVOKE ALL ON FUNCTION public.preserve_last_cmdb_admin() FROM PUBLIC, anon, authenticated;
