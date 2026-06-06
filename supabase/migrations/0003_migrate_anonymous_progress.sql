-- Merges an anonymous user's progress into a named account, then deletes the
-- anon user. Called only by the migrate-anon-account edge function via the
-- service role. The composite id is recomputed to p_named_id || ':' || key so a
-- later client write to a migrated puzzle does not insert a duplicate row.

create or replace function public.migrate_anonymous_progress(p_anon_id uuid, p_named_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_anon_id = p_named_id then
    return;
  end if;
  if not exists (select 1 from auth.users where id = p_anon_id and is_anonymous = true) then
    raise exception 'source % is not an anonymous user', p_anon_id;
  end if;

  insert into public.puzzle_progress
    (id, user_id, puzzle_id, cells, auto_marks, time_ms, completed, completed_at, updated_at)
  select p_named_id || ':' || puzzle_id, p_named_id, puzzle_id,
         cells, auto_marks, time_ms, completed, completed_at, updated_at
  from public.puzzle_progress
  where user_id = p_anon_id
  on conflict (id) do update set
    completed = greatest(public.puzzle_progress.completed, excluded.completed),
    cells = case
      when excluded.completed = 1 and public.puzzle_progress.completed = 0 then excluded.cells
      when excluded.completed = 1 and public.puzzle_progress.completed = 1
           and excluded.time_ms < public.puzzle_progress.time_ms then excluded.cells
      else public.puzzle_progress.cells end,
    auto_marks = case
      when excluded.completed = 1 and public.puzzle_progress.completed = 0 then excluded.auto_marks
      when excluded.completed = 1 and public.puzzle_progress.completed = 1
           and excluded.time_ms < public.puzzle_progress.time_ms then excluded.auto_marks
      else public.puzzle_progress.auto_marks end,
    time_ms = case
      when public.puzzle_progress.completed = 1 and excluded.completed = 1
           then least(public.puzzle_progress.time_ms, excluded.time_ms)
      when excluded.completed = 1 and public.puzzle_progress.completed = 0 then excluded.time_ms
      else public.puzzle_progress.time_ms end,
    completed_at = case
      when public.puzzle_progress.completed_at is null then excluded.completed_at
      when excluded.completed_at is null then public.puzzle_progress.completed_at
      else least(public.puzzle_progress.completed_at, excluded.completed_at) end,
    updated_at = greatest(public.puzzle_progress.updated_at, excluded.updated_at);

  insert into public.streaks
    (id, user_id, type, current_count, last_completed_key, updated_at)
  select p_named_id || ':' || type, p_named_id, type,
         current_count, last_completed_key, updated_at
  from public.streaks
  where user_id = p_anon_id
  on conflict (id) do update set
    current_count = greatest(public.streaks.current_count, excluded.current_count),
    last_completed_key = greatest(public.streaks.last_completed_key, excluded.last_completed_key),
    updated_at = greatest(public.streaks.updated_at, excluded.updated_at);

  delete from public.puzzle_progress where user_id = p_anon_id;
  delete from public.streaks where user_id = p_anon_id;
  delete from auth.users where id = p_anon_id and is_anonymous = true;
end;
$$;

revoke execute on function public.migrate_anonymous_progress(uuid, uuid) from public, authenticated, anon;
grant execute on function public.migrate_anonymous_progress(uuid, uuid) to service_role;
