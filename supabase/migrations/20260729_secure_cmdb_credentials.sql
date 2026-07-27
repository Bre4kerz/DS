/*
  # Move CMDB passwords to Supabase Vault

  Passwords are encrypted at rest by Vault and are never returned by normal
  cmdb_items queries. Only admins can call the narrowly scoped RPC functions.
  Every reveal is recorded in cmdb_credential_access_log.
*/

CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;

ALTER TABLE public.cmdb_items
  ADD COLUMN IF NOT EXISTS has_credentials boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cmdb_item_credentials (
  item_id uuid PRIMARY KEY REFERENCES public.cmdb_items(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT '',
  password_secret_id uuid,
  alternative_username text NOT NULL DEFAULT '',
  alternative_password_secret_id uuid,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.cmdb_credential_access_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.cmdb_items(id) ON DELETE CASCADE,
  accessed_by uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('reveal', 'save')),
  accessed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cmdb_item_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmdb_credential_access_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cmdb_item_credentials FROM anon, authenticated;
REVOKE ALL ON public.cmdb_credential_access_log FROM anon, authenticated;
REVOKE ALL ON vault.secrets FROM anon, authenticated;
REVOKE ALL ON vault.decrypted_secrets FROM anon, authenticated;

-- Migrate existing plaintext values before removing the old columns.
DO $$
DECLARE
  item_record record;
  primary_secret_id uuid;
  alternative_secret_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cmdb_items'
      AND column_name = 'cred_password'
  ) THEN
    FOR item_record IN
      SELECT
        id,
        COALESCE(cred_user, '') AS username,
        COALESCE(cred_password, '') AS password,
        COALESCE(cred_user_alt, '') AS alternative_username,
        COALESCE(cred_password_alt, '') AS alternative_password,
        COALESCE(cred_notes, '') AS notes
      FROM public.cmdb_items
      WHERE COALESCE(cred_user, '') <> ''
         OR COALESCE(cred_password, '') <> ''
         OR COALESCE(cred_user_alt, '') <> ''
         OR COALESCE(cred_password_alt, '') <> ''
         OR COALESCE(cred_notes, '') <> ''
    LOOP
      primary_secret_id := NULL;
      alternative_secret_id := NULL;

      IF item_record.password <> '' THEN
        primary_secret_id := vault.create_secret(
          item_record.password,
          'cmdb-' || item_record.id || '-primary',
          'CMDB primary password'
        );
      END IF;

      IF item_record.alternative_password <> '' THEN
        alternative_secret_id := vault.create_secret(
          item_record.alternative_password,
          'cmdb-' || item_record.id || '-alternative',
          'CMDB alternative password'
        );
      END IF;

      INSERT INTO public.cmdb_item_credentials (
        item_id,
        username,
        password_secret_id,
        alternative_username,
        alternative_password_secret_id,
        notes
      )
      VALUES (
        item_record.id,
        item_record.username,
        primary_secret_id,
        item_record.alternative_username,
        alternative_secret_id,
        item_record.notes
      )
      ON CONFLICT (item_id) DO NOTHING;
    END LOOP;
  END IF;
END $$;

UPDATE public.cmdb_items AS items
SET has_credentials = EXISTS (
  SELECT 1
  FROM public.cmdb_item_credentials AS credentials
  WHERE credentials.item_id = items.id
);

ALTER TABLE public.cmdb_items
  DROP COLUMN IF EXISTS cred_user,
  DROP COLUMN IF EXISTS cred_password,
  DROP COLUMN IF EXISTS cred_user_alt,
  DROP COLUMN IF EXISTS cred_password_alt,
  DROP COLUMN IF EXISTS cred_notes;

CREATE OR REPLACE FUNCTION public.reveal_cmdb_credentials(p_item_id uuid)
RETURNS TABLE (
  username text,
  password text,
  alternative_username text,
  alternative_password text,
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF NOT public.is_cmdb_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.cmdb_credential_access_log (item_id, accessed_by, action)
  VALUES (p_item_id, auth.uid(), 'reveal');

  RETURN QUERY
  SELECT
    credentials.username,
    COALESCE(primary_secret.decrypted_secret, ''),
    credentials.alternative_username,
    COALESCE(alternative_secret.decrypted_secret, ''),
    credentials.notes
  FROM public.cmdb_item_credentials AS credentials
  LEFT JOIN vault.decrypted_secrets AS primary_secret
    ON primary_secret.id = credentials.password_secret_id
  LEFT JOIN vault.decrypted_secrets AS alternative_secret
    ON alternative_secret.id = credentials.alternative_password_secret_id
  WHERE credentials.item_id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_cmdb_credentials(
  p_item_id uuid,
  p_username text,
  p_password text,
  p_alternative_username text,
  p_alternative_password text,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  existing_credentials public.cmdb_item_credentials%ROWTYPE;
  primary_secret_id uuid;
  alternative_secret_id uuid;
  contains_credentials boolean;
BEGIN
  IF NOT public.is_cmdb_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cmdb_items WHERE id = p_item_id) THEN
    RAISE EXCEPTION 'CMDB item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO existing_credentials
  FROM public.cmdb_item_credentials
  WHERE item_id = p_item_id;

  IF existing_credentials.password_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = existing_credentials.password_secret_id;
  END IF;

  IF existing_credentials.alternative_password_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = existing_credentials.alternative_password_secret_id;
  END IF;

  primary_secret_id := NULL;
  alternative_secret_id := NULL;

  IF COALESCE(p_password, '') <> '' THEN
    primary_secret_id := vault.create_secret(
      p_password,
      'cmdb-' || p_item_id || '-primary',
      'CMDB primary password'
    );
  END IF;

  IF COALESCE(p_alternative_password, '') <> '' THEN
    alternative_secret_id := vault.create_secret(
      p_alternative_password,
      'cmdb-' || p_item_id || '-alternative',
      'CMDB alternative password'
    );
  END IF;

  contains_credentials :=
    COALESCE(p_username, '') <> ''
    OR COALESCE(p_password, '') <> ''
    OR COALESCE(p_alternative_username, '') <> ''
    OR COALESCE(p_alternative_password, '') <> ''
    OR COALESCE(p_notes, '') <> '';

  IF contains_credentials THEN
    INSERT INTO public.cmdb_item_credentials (
      item_id,
      username,
      password_secret_id,
      alternative_username,
      alternative_password_secret_id,
      notes,
      updated_at,
      updated_by
    )
    VALUES (
      p_item_id,
      COALESCE(p_username, ''),
      primary_secret_id,
      COALESCE(p_alternative_username, ''),
      alternative_secret_id,
      COALESCE(p_notes, ''),
      now(),
      auth.uid()
    )
    ON CONFLICT (item_id) DO UPDATE SET
      username = EXCLUDED.username,
      password_secret_id = EXCLUDED.password_secret_id,
      alternative_username = EXCLUDED.alternative_username,
      alternative_password_secret_id = EXCLUDED.alternative_password_secret_id,
      notes = EXCLUDED.notes,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;
  ELSE
    DELETE FROM public.cmdb_item_credentials WHERE item_id = p_item_id;
  END IF;

  UPDATE public.cmdb_items
  SET has_credentials = contains_credentials
  WHERE id = p_item_id;

  INSERT INTO public.cmdb_credential_access_log (item_id, accessed_by, action)
  VALUES (p_item_id, auth.uid(), 'save');
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_cmdb_credentials(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_cmdb_credentials(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_cmdb_credentials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_cmdb_credentials(uuid, text, text, text, text, text) TO authenticated;
