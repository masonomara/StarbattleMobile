-- 20260527_packs_storage_rls_hints.sql
CREATE OR REPLACE FUNCTION public.user_can_access_pack(storage_object_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    base_name text;
    pack_id   text;
    pack_free boolean;
  BEGIN
    base_name := regexp_replace(storage_object_name, '-hints\.json$', '.json');

    IF base_name IN ('daily.json', 'weekly.json', 'monthly.json') THEN
      RETURN true;
    END IF;

    SELECT id, is_free INTO pack_id, pack_free
    FROM public.packs
    WHERE storage_path = base_name OR id || '.json' = base_name
    LIMIT 1;

    IF NOT FOUND THEN RETURN false; END IF;
    IF pack_free THEN RETURN true; END IF;

    RETURN EXISTS (
      SELECT 1 FROM public.user_entitlements
      WHERE user_id = auth.uid()
        AND (is_premium = true OR owned_pack_ids @> ARRAY[pack_id])
    );
  END;
$function$;
