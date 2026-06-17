-- Extend account self-deletion to also purge the user's telemetry.
--
-- perf_events (0008) carries anon_user_id but has no FK to auth.users (telemetry
-- is intentionally decoupled from the auth lifecycle), so deleting the auth row
-- does NOT cascade to it. To honour the GDPR right to erasure, delete_user()
-- now removes the caller's perf_events rows explicitly before deleting the auth
-- user. security definer + the where-clause pin to auth.uid() keep this scoped
-- to the caller's own rows.

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.perf_events where anon_user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
