-- Allows an authenticated user to delete their own account.
-- Required by Apple App Store Guideline 5.1.1(v) and GDPR Article 17.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- CASCADE on auth.users propagates to puzzle_progress, streaks,
-- user_entitlements, and streak_archive — confirm your foreign keys
-- are defined with ON DELETE CASCADE before running.

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
