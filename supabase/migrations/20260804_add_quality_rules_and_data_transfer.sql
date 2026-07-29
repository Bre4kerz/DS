/*
  # Quality rules and data-transfer permission

  Extends granular access control with configurable quality checks. Import and
  export are exposed only when data.transfer is granted in the access panel.
*/

BEGIN;

ALTER TABLE public.cmdb_user_permissions
  DROP CONSTRAINT IF EXISTS cmdb_user_permissions_permission_key_check;

ALTER TABLE public.cmdb_user_permissions
  ADD CONSTRAINT cmdb_user_permissions_permission_key_check
  CHECK (permission_key IN (
    'records.view', 'records.create', 'records.edit', 'records.delete',
    'credentials.view', 'credentials.edit', 'history.view',
    'alerts.view', 'alerts.configure', 'quality.view', 'quality.configure',
    'audit.view', 'roles.manage', 'permissions.manage', 'data.transfer'
  ));

CREATE TABLE IF NOT EXISTS public.cmdb_quality_rule_settings (
  issue_code text PRIMARY KEY,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  severity text NOT NULL CHECK (severity IN ('critical', 'error', 'warning')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.cmdb_quality_rule_settings (issue_code, label, severity)
VALUES
  ('MISSING_NAME', 'License name is required', 'critical'),
  ('MISSING_CLIENT', 'Client is required', 'critical'),
  ('MISSING_EXPIRATION_DATE', 'Expiration date is required', 'critical'),
  ('MISSING_TYPE', 'License type is required', 'error'),
  ('MISSING_VENDOR', 'Vendor is required', 'error'),
  ('INVALID_QUANTITY', 'Quantity must be greater than zero', 'error'),
  ('MISSING_BRANCH', 'Branch is missing', 'warning'),
  ('MISSING_SERIAL', 'Serial or license identifier is missing', 'warning'),
  ('MISSING_RENEWAL_PROCESS', 'Expired license has no renewal process', 'warning')
ON CONFLICT (issue_code) DO NOTHING;

ALTER TABLE public.cmdb_quality_rule_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cmdb_quality_rule_settings FROM anon;
GRANT SELECT, UPDATE ON public.cmdb_quality_rule_settings TO authenticated;

DROP POLICY IF EXISTS "Permitted users read quality rules" ON public.cmdb_quality_rule_settings;
DROP POLICY IF EXISTS "Permitted users update quality rules" ON public.cmdb_quality_rule_settings;
CREATE POLICY "Permitted users read quality rules"
  ON public.cmdb_quality_rule_settings FOR SELECT TO authenticated
  USING (public.cmdb_has_permission('quality.view'));

CREATE POLICY "Permitted users update quality rules"
  ON public.cmdb_quality_rule_settings FOR UPDATE TO authenticated
  USING (public.cmdb_has_permission('quality.configure'))
  WITH CHECK (public.cmdb_has_permission('quality.configure'));

DROP TRIGGER IF EXISTS audit_cmdb_quality_rule_settings ON public.cmdb_quality_rule_settings;
CREATE TRIGGER audit_cmdb_quality_rule_settings
AFTER UPDATE ON public.cmdb_quality_rule_settings
FOR EACH ROW EXECUTE FUNCTION public.capture_cmdb_audit_change();

CREATE OR REPLACE FUNCTION public.queue_cmdb_notification_retry(p_notification_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.cmdb_has_permission('alerts.configure') THEN
    RAISE EXCEPTION 'Alert configuration permission required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.cmdb_expiration_notifications WHERE id = p_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_cmdb_notification_retry(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_cmdb_notification_retry(bigint) TO authenticated;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'cmdb_user_roles',
    'cmdb_user_permissions',
    'cmdb_user_category_access'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables publication_tables
      WHERE publication_tables.pubname = 'supabase_realtime'
        AND publication_tables.schemaname = 'public'
        AND publication_tables.tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
