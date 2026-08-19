/*
  # Bulk replace ordinary CMDB item fields

  Replaces exact text values inside one client/category. The function uses a
  strict field allowlist, checks record-edit/category permissions, supports a
  preview mode, and writes one history entry per changed record.
*/

CREATE OR REPLACE FUNCTION public.bulk_replace_cmdb_item_field_authorized(
  p_client_id uuid,
  p_category text,
  p_field text,
  p_old_value text,
  p_new_value text,
  p_preview boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_record record;
  affected_count integer := 0;
  actor_email text := COALESCE(auth.jwt() ->> 'email', 'unknown');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.cmdb_can_edit_category(p_category) THEN
    RAISE EXCEPTION 'Record editing is not permitted for this category' USING ERRCODE = '42501';
  END IF;

  IF p_field NOT IN (
    'item_type', 'domain_version', 'role_use', 'vendor', 'branch',
    'ip', 'serial', 'email', 'process'
  ) THEN
    RAISE EXCEPTION 'Unsupported item field' USING ERRCODE = '22023';
  END IF;

  IF p_old_value IS NULL OR p_new_value IS NULL THEN
    RAISE EXCEPTION 'Current and new values are required' USING ERRCODE = '22023';
  END IF;

  IF p_old_value = p_new_value THEN
    RAISE EXCEPTION 'The new value must be different' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cmdb_clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'CMDB client not found' USING ERRCODE = 'P0002';
  END IF;

  FOR item_record IN EXECUTE format(
    'SELECT id, COALESCE(%I, '''') AS old_value
       FROM public.cmdb_items
      WHERE client_id = $1
        AND category = $2
        AND COALESCE(%I, '''') = $3',
    p_field,
    p_field
  ) USING p_client_id, p_category, p_old_value
  LOOP
    affected_count := affected_count + 1;

    IF NOT p_preview THEN
      IF p_field = 'process' THEN
        UPDATE public.cmdb_items
        SET process = p_new_value, process_updated_at = now(), updated_at = now()
        WHERE id = item_record.id;
      ELSE
        EXECUTE format(
          'UPDATE public.cmdb_items SET %I = $1, updated_at = now() WHERE id = $2',
          p_field
        ) USING p_new_value, item_record.id;
      END IF;

      INSERT INTO public.cmdb_item_history (item_id, user_email, changes)
      VALUES (
        item_record.id,
        actor_email,
        jsonb_build_object(
          p_field,
          jsonb_build_object('from', item_record.old_value, 'to', p_new_value)
        )
      );
    END IF;
  END LOOP;

  RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_replace_cmdb_item_field_authorized(
  uuid, text, text, text, text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_replace_cmdb_item_field_authorized(
  uuid, text, text, text, text, boolean
) TO authenticated;
