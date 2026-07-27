/*
  # Preserve at least one CMDB administrator

  UI safeguards are useful feedback, but this trigger is the authoritative
  protection against deleting or demoting the final admin through any client.
*/

CREATE OR REPLACE FUNCTION public.preserve_last_cmdb_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin'
    AND (
      TG_OP = 'DELETE'
      OR (TG_OP = 'UPDATE' AND NEW.role <> 'admin')
    )
    AND (
      SELECT count(*)
      FROM public.cmdb_user_roles
      WHERE role = 'admin'
    ) <= 1
  THEN
    RAISE EXCEPTION 'At least one CMDB administrator is required'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_last_cmdb_admin
  ON public.cmdb_user_roles;

CREATE TRIGGER preserve_last_cmdb_admin
BEFORE UPDATE OF role OR DELETE
ON public.cmdb_user_roles
FOR EACH ROW
EXECUTE FUNCTION public.preserve_last_cmdb_admin();

REVOKE ALL ON FUNCTION public.preserve_last_cmdb_admin() FROM PUBLIC;
