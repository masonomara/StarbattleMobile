-- Account self-deletion. The client calls supabase.rpc('delete_user'). Deleting
-- the auth.users row cascades (see 0001_cascades.sql) to puzzle_progress,
-- streaks, and user_entitlements.

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
