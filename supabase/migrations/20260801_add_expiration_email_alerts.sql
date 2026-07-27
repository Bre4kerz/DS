/*
  # Expiration email alerts and data-quality registry

  Configuration is admin-only. Authenticated users may read data-quality issues;
  only admins may resolve them manually. The scheduled Edge Function uses the
  service role and records deliveries and automatic resolutions.
*/

CREATE TABLE IF NOT EXISTS public.cmdb_alert_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  thresholds integer[] NOT NULL DEFAULT ARRAY[90, 60, 30, 15, 7, 1, 0],
  recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  from_email text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.cmdb_alert_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cmdb_expiration_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.cmdb_items(id) ON DELETE CASCADE,
  expiration_date date NOT NULL,
  threshold_days integer NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, expiration_date, threshold_days, recipient)
);

CREATE INDEX IF NOT EXISTS cmdb_expiration_notifications_sent_idx
  ON public.cmdb_expiration_notifications (sent_at DESC);

CREATE TABLE IF NOT EXISTS public.cmdb_data_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.cmdb_items(id) ON DELETE CASCADE,
  issue_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'error', 'warning')),
  field_name text,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text
);

CREATE UNIQUE INDEX IF NOT EXISTS cmdb_unique_open_quality_issue
  ON public.cmdb_data_quality_issues (item_id, issue_code)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS cmdb_quality_issues_status_idx
  ON public.cmdb_data_quality_issues (resolved_at, severity, last_detected_at DESC);

ALTER TABLE public.cmdb_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmdb_expiration_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmdb_data_quality_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read alert settings"
  ON public.cmdb_alert_settings FOR SELECT TO authenticated
  USING (public.is_cmdb_admin());

CREATE POLICY "Admins can update alert settings"
  ON public.cmdb_alert_settings FOR UPDATE TO authenticated
  USING (public.is_cmdb_admin())
  WITH CHECK (public.is_cmdb_admin());

CREATE POLICY "Admins can read notification history"
  ON public.cmdb_expiration_notifications FOR SELECT TO authenticated
  USING (public.is_cmdb_admin());

CREATE POLICY "Authenticated users can read quality issues"
  ON public.cmdb_data_quality_issues FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can update quality issues"
  ON public.cmdb_data_quality_issues FOR UPDATE TO authenticated
  USING (public.is_cmdb_admin())
  WITH CHECK (public.is_cmdb_admin());

REVOKE INSERT, DELETE ON public.cmdb_alert_settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cmdb_expiration_notifications FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.cmdb_data_quality_issues FROM anon, authenticated;
