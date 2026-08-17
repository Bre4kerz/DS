/*
  # Optimize CMDB permission loading

  Returns the current role and all effective functional permissions in one RPC.
  PostgreSQL/RLS remains the authorization boundary; this function only avoids
  one browser round trip per permission when building the UI.
*/

CREATE OR REPLACE FUNCTION public.cmdb_get_my_access()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH permission_keys(permission_key, sort_order) AS (
    VALUES
      ('records.view', 1),
      ('records.create', 2),
      ('records.edit', 3),
      ('records.delete', 4),
      ('credentials.view', 5),
      ('credentials.edit', 6),
      ('history.view', 7),
      ('alerts.view', 8),
      ('alerts.configure', 9),
      ('quality.view', 10),
      ('quality.configure', 11),
      ('audit.view', 12),
      ('roles.manage', 13),
      ('permissions.manage', 14),
      ('data.transfer', 15)
  ),
  active_cmdb_role AS (
    SELECT id, role
    FROM public.cmdb_user_roles
    WHERE user_id = auth.uid()
       OR (
         user_id IS NULL
         AND lower(user_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
       )
    ORDER BY (user_id = auth.uid()) DESC
    LIMIT 1
  ),
  effective_permissions AS (
    SELECT keys.permission_key, keys.sort_order
    FROM permission_keys keys
    LEFT JOIN active_cmdb_role active_role ON true
    LEFT JOIN public.cmdb_user_permissions permission_override
      ON permission_override.role_id = active_role.id
     AND permission_override.permission_key = keys.permission_key
    WHERE COALESCE(
      CASE WHEN active_role.role = 'superuser' THEN true END,
      permission_override.allowed,
      CASE
        WHEN active_role.role = 'admin' THEN keys.permission_key <> 'permissions.manage'
        WHEN active_role.role = 'viewer' THEN keys.permission_key IN (
          'records.view', 'history.view', 'alerts.view', 'quality.view'
        )
        ELSE false
      END,
      false
    )
  )
  SELECT jsonb_build_object(
    'role', COALESCE((SELECT role FROM active_cmdb_role), 'viewer'),
    'permissions', COALESCE(
      (
        SELECT jsonb_agg(permission_key ORDER BY sort_order)
        FROM effective_permissions
      ),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.cmdb_get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cmdb_get_my_access() TO authenticated;

