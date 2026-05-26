-- Patch public.user_can_access_pack to fix two gaps in the existing function:
--
--   1. Streak files (daily.json, weekly.json, monthly.json) have no row in
--      the packs table, so the original function returned false for everyone.
--      They should be readable by any authenticated user.
--
--   2. loadPack() fetches pack content at `${packId}.json`.  storage_path is
--      nullable, so packs without an explicit override were unreachable.
--      Added fallback: `id || '.json' = storage_object_name`.
--
-- The bucket, the RLS policy, and the policy→function wiring already exist
-- and are correct — only the function body changes.
--
-- Apply via: Supabase Dashboard → SQL Editor → New query → paste → Run.

CREATE OR REPLACE FUNCTION public.user_can_access_pack(storage_object_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    pack_id   text;
    pack_free boolean;
  BEGIN
    -- Streak packs are always accessible to any authenticated user
    -- (including anonymous).  They have no row in public.packs.
    IF storage_object_name IN ('daily.json', 'weekly.json', 'monthly.json') THEN
      RETURN true;
    END IF;

    -- Match by explicit storage_path override first; fall back to the default
    -- path that loadPack() constructs: packId || '.json'.
    SELECT id, is_free
    INTO pack_id, pack_free
    FROM public.packs
    WHERE storage_path = storage_object_name
       OR id || '.json'  = storage_object_name
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN false;
    END IF;

    -- Free packs are accessible to any authenticated user.
    IF pack_free THEN
      RETURN true;
    END IF;

    -- Paid packs: premium subscription or individual pack ownership.
    RETURN EXISTS (
      SELECT 1 FROM public.user_entitlements
      WHERE user_id = auth.uid()
        AND (
          is_premium = true
          OR owned_pack_ids @> ARRAY[pack_id]
        )
    );
  END;
$function$;
