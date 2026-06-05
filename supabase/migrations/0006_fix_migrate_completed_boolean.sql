-- Fix migrate_anonymous_progress: `puzzle_progress.completed` is a boolean, but
-- migration 0003 wrote the conflict-resolution logic as if it were an integer
-- flag (`completed = 1` / `= 0`, `greatest(completed, ...)`). Postgres has no
-- `boolean = integer` operator (SQLSTATE 42883), so the merge aborted and the
-- migrate-anon-account edge function returned 500 for any sign-in whose
-- anonymous progress collided with an existing named-account row.
--
-- Only the puzzle_progress upsert is touched; the streaks block (all integer /
-- text) was already correct.

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
    completed = public.puzzle_progress.completed or excluded.completed,
    cells = case
      when excluded.completed and not public.puzzle_progress.completed then excluded.cells
      when excluded.completed and public.puzzle_progress.completed
           and excluded.time_ms < public.puzzle_progress.time_ms then excluded.cells
      else public.puzzle_progress.cells end,
    auto_marks = case
      when excluded.completed and not public.puzzle_progress.completed then excluded.auto_marks
      when excluded.completed and public.puzzle_progress.completed
           and excluded.time_ms < public.puzzle_progress.time_ms then excluded.auto_marks
      else public.puzzle_progress.auto_marks end,
    time_ms = case
      when public.puzzle_progress.completed and excluded.completed
           then least(public.puzzle_progress.time_ms, excluded.time_ms)
      when excluded.completed and not public.puzzle_progress.completed then excluded.time_ms
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
