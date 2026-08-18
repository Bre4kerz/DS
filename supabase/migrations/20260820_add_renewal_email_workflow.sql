/*
  # Renewal email workflow

  Adds optional escalation recipients and a generic delivery ledger. Event keys
  make daily summaries, stalled-stage alerts and critical escalations idempotent.
*/

ALTER TABLE public.cmdb_alert_settings
  ADD COLUMN IF NOT EXISTS escalation_recipients text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE TABLE IF NOT EXISTS public.cmdb_renewal_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_type text NOT NULL
    CHECK (notification_type IN ('daily_summary', 'stalled_process', 'critical_7_days', 'expired')),
  event_key text NOT NULL,
  item_id uuid REFERENCES public.cmdb_items(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_type, event_key, recipient)
);

CREATE INDEX IF NOT EXISTS cmdb_renewal_notifications_sent_idx
  ON public.cmdb_renewal_notifications (sent_at DESC);

CREATE INDEX IF NOT EXISTS cmdb_renewal_notifications_item_idx
  ON public.cmdb_renewal_notifications (item_id, sent_at DESC)
  WHERE item_id IS NOT NULL;

ALTER TABLE public.cmdb_renewal_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitted users read renewal notification history"
  ON public.cmdb_renewal_notifications;
CREATE POLICY "Permitted users read renewal notification history"
  ON public.cmdb_renewal_notifications FOR SELECT TO authenticated
  USING (public.cmdb_has_permission('alerts.view'));

REVOKE INSERT, UPDATE, DELETE ON public.cmdb_renewal_notifications FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_cmdb_renewal_notification_retry(p_notification_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.cmdb_has_permission('alerts.configure') THEN
    RAISE EXCEPTION 'Alert configuration permission required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.cmdb_renewal_notifications WHERE id = p_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_cmdb_renewal_notification_retry(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_cmdb_renewal_notification_retry(bigint) TO authenticated;
