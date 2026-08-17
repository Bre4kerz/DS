/*
  # Bulk replace CMDB credentials

  Replaces an exact credential value across one client/category without sending
  stored credentials to the browser. Passwords remain inside Supabase Vault.
*/

CREATE OR REPLACE FUNCTION public.bulk_replace_cmdb_credentials_authorized(
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
SET search_path = public, vault
AS $$
DECLARE
  credential_record record;
  affected_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.cmdb_has_permission('credentials.edit') THEN
    RAISE EXCEPTION 'Credential editing is not permitted' USING ERRCODE = '42501';
  END IF;

  IF NOT public.cmdb_can_edit_category(p_category) THEN
    RAISE EXCEPTION 'Category editing is not permitted' USING ERRCODE = '42501';
  END IF;

  IF p_field NOT IN (
    'username', 'password', 'alternative_username', 'alternative_password'
  ) THEN
    RAISE EXCEPTION 'Unsupported credential field' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_old_value, '') = '' OR COALESCE(p_new_value, '') = '' THEN
    RAISE EXCEPTION 'Old and new values are required' USING ERRCODE = '22023';
  END IF;

  IF p_old_value = p_new_value THEN
    RAISE EXCEPTION 'The new value must be different' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cmdb_clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'CMDB client not found' USING ERRCODE = 'P0002';
  END IF;

  FOR credential_record IN
    SELECT
      credentials.item_id,
      credentials.password_secret_id,
      credentials.alternative_password_secret_id
    FROM public.cmdb_item_credentials AS credentials
    JOIN public.cmdb_items AS items ON items.id = credentials.item_id
    LEFT JOIN vault.decrypted_secrets AS primary_secret
      ON primary_secret.id = credentials.password_secret_id
    LEFT JOIN vault.decrypted_secrets AS alternative_secret
      ON alternative_secret.id = credentials.alternative_password_secret_id
    WHERE items.client_id = p_client_id
      AND items.category = p_category
      AND CASE p_field
        WHEN 'username' THEN credentials.username
        WHEN 'password' THEN COALESCE(primary_secret.decrypted_secret, '')
        WHEN 'alternative_username' THEN credentials.alternative_username
        WHEN 'alternative_password' THEN COALESCE(alternative_secret.decrypted_secret, '')
      END = p_old_value
  LOOP
    affected_count := affected_count + 1;

    IF NOT p_preview THEN
      CASE p_field
        WHEN 'username' THEN
          UPDATE public.cmdb_item_credentials
          SET username = p_new_value
          WHERE item_id = credential_record.item_id;
        WHEN 'password' THEN
          PERFORM vault.update_secret(
            credential_record.password_secret_id,
            p_new_value
          );
        WHEN 'alternative_username' THEN
          UPDATE public.cmdb_item_credentials
          SET alternative_username = p_new_value
          WHERE item_id = credential_record.item_id;
        WHEN 'alternative_password' THEN
          PERFORM vault.update_secret(
            credential_record.alternative_password_secret_id,
            p_new_value
          );
      END CASE;

      UPDATE public.cmdb_item_credentials
      SET updated_at = now(), updated_by = auth.uid()
      WHERE item_id = credential_record.item_id;

      INSERT INTO public.cmdb_credential_access_log (item_id, accessed_by, action)
      VALUES (credential_record.item_id, auth.uid(), 'save');
    END IF;
  END LOOP;

  RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_replace_cmdb_credentials_authorized(
  uuid, text, text, text, text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_replace_cmdb_credentials_authorized(
  uuid, text, text, text, text, boolean
) TO authenticated;
