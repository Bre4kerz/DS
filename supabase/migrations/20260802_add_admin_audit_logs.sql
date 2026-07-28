/*
  # Administrative audit log

  Records authenticated and system changes to CMDB data. Logs are readable only
  by administrators, cannot be edited from the API, and are retained for 15 days.
  Credential secrets and tokens are never written to this table.
*/

CREATE TABLE IF NOT EXISTS public.cmdb_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  event_type text NOT NULL CHECK (event_type IN ('authentication', 'data_change', 'security')),
  action text NOT NULL,
  entity_type text,
  entity_id text,
  entity_name text,
  summary text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS cmdb_audit_logs_occurred_idx
  ON public.cmdb_audit_logs (occurred_at DESC);

CREATE INDEX IF NOT EXISTS cmdb_audit_logs_actor_idx
  ON public.cmdb_audit_logs (actor_email, occurred_at DESC);

CREATE INDEX IF NOT EXISTS cmdb_audit_logs_entity_idx
  ON public.cmdb_audit_logs (entity_type, entity_id, occurred_at DESC);

ALTER TABLE public.cmdb_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
  ON public.cmdb_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_cmdb_admin());

REVOKE ALL ON public.cmdb_audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cmdb_audit_logs FROM authenticated;
GRANT SELECT ON public.cmdb_audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_cmdb_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_data jsonb;
  current_data jsonb;
  record_data jsonb;
  record_id text;
  record_name text;
  change_action text;
BEGIN
  previous_data := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  current_data := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  record_data := COALESCE(current_data, previous_data);
  record_id := COALESCE(record_data ->> 'id', record_data ->> 'item_id', 'settings');
  record_name := COALESCE(
    record_data ->> 'name',
    record_data ->> 'user_email',
    record_data ->> 'recipient',
    record_id
  );
  change_action := lower(TG_OP);

  INSERT INTO public.cmdb_audit_logs (
    actor_user_id,
    actor_email,
    event_type,
    action,
    entity_type,
    entity_id,
    entity_name,
    summary,
    old_data,
    new_data
  )
  VALUES (
    auth.uid(),
    COALESCE(auth.jwt() ->> 'email', CASE WHEN auth.uid() IS NULL THEN 'system' END),
    CASE
      WHEN TG_TABLE_NAME IN ('cmdb_user_roles', 'cmdb_credential_access_log') THEN 'security'
      ELSE 'data_change'
    END,
    change_action,
    TG_TABLE_NAME,
    record_id,
    record_name,
    initcap(change_action) || ' on ' || TG_TABLE_NAME || ': ' || COALESCE(record_name, record_id),
    previous_data,
    current_data
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.capture_cmdb_audit_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_cmdb_clients ON public.cmdb_clients;
CREATE TRIGGER audit_cmdb_clients
AFTER INSERT OR UPDATE OR DELETE ON public.cmdb_clients
FOR EACH ROW EXECUTE FUNCTION public.capture_cmdb_audit_change();

DROP TRIGGER IF EXISTS audit_cmdb_items ON public.cmdb_items;
CREATE TRIGGER audit_cmdb_items
AFTER INSERT OR UPDATE OR DELETE ON public.cmdb_items
FOR EACH ROW EXECUTE FUNCTION public.capture_cmdb_audit_change();

DROP TRIGGER IF EXISTS audit_cmdb_user_roles ON public.cmdb_user_roles;
CREATE TRIGGER audit_cmdb_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.cmdb_user_roles
FOR EACH ROW EXECUTE FUNCTION public.capture_cmdb_audit_change();

DROP TRIGGER IF EXISTS audit_cmdb_alert_settings ON public.cmdb_alert_settings;
CREATE TRIGGER audit_cmdb_alert_settings
AFTER UPDATE ON public.cmdb_alert_settings
FOR EACH ROW EXECUTE FUNCTION public.capture_cmdb_audit_change();

DROP TRIGGER IF EXISTS audit_cmdb_credential_access ON public.cmdb_credential_access_log;
CREATE TRIGGER audit_cmdb_credential_access
AFTER INSERT ON public.cmdb_credential_access_log
FOR EACH ROW EXECUTE FUNCTION public.capture_cmdb_audit_change();

CREATE OR REPLACE FUNCTION public.log_cmdb_auth_event(
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('login', 'logout', 'inactivity_logout') THEN
    RAISE EXCEPTION 'Unsupported authentication event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cmdb_audit_logs (
    actor_user_id,
    actor_email,
    event_type,
    action,
    entity_type,
    entity_id,
    entity_name,
    summary,
    metadata
  )
  VALUES (
    auth.uid(),
    auth.jwt() ->> 'email',
    'authentication',
    p_action,
    'session',
    auth.uid()::text,
    auth.jwt() ->> 'email',
    CASE p_action
      WHEN 'login' THEN 'User signed in'
      WHEN 'inactivity_logout' THEN 'Session closed due to inactivity'
      ELSE 'User signed out'
    END,
    COALESCE(p_metadata, '{}'::jsonb) - 'access_token' - 'refresh_token' - 'password'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_cmdb_auth_event(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_cmdb_auth_event(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_expired_cmdb_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.cmdb_audit_logs
  WHERE occurred_at < now() - interval '15 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_cmdb_audit_logs() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cmdb-audit-retention-15-days',
  '17 3 * * *',
  $$SELECT public.purge_expired_cmdb_audit_logs();$$
);
