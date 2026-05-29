-- Merges anonymous user progress into a named account, then deletes the anon user.
--
-- Called exclusively by the migrate-anon-account Edge Function (service_role).
-- The Edge Function verifies ownership of the anon session before invoking this.
--
-- Conflict strategy: named account wins on all conflicts.
--   ON CONFLICT DO NOTHING (no target) covers BOTH the PK (id) and the extra
--   UNIQUE(user_id, puzzle_id) / UNIQUE(user_id, type) constraints confirmed
--   in the schema query on 2026-05-29.
--
-- Tables touched: puzzle_progress, streaks, auth.users (delete).
-- Tables NOT touched: user_entitlements (owned by Adapty webhook),
--                     streak_archive (global, no user_id).

create or replace function public.migrate_anonymous_progress(
  p_anon_id  uuid,
  p_named_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No-op if somehow the same user (e.g. in-place email sign-up).
  if p_anon_id = p_named_id then
    return;
  end if;

  -- Guard: source must actually be an anonymous user.
  -- The Edge Function already verified this via the anon access token, but
  -- defense-in-depth prevents a service_role caller from accidentally
  -- migrating a named account's data into another named account.
  if not exists (
    select 1 from auth.users
    where id = p_anon_id and is_anonymous = true
  ) then
    raise exception 'migrate_anonymous_progress: source % is not an anonymous user', p_anon_id;
  end if;

  -- ── puzzle_progress ──────────────────────────────────────────────────────
  -- Recompute the composite PK to namedId:puzzleId.
  -- ON CONFLICT DO NOTHING: if the named account already has a row for a
  -- given puzzle_id, keep it (named account wins).
  insert into public.puzzle_progress
    (id, user_id, puzzle_id, cells, auto_marks, time_ms, completed, completed_at, updated_at)
  select
    p_named_id::text || ':' || puzzle_id,
    p_named_id,
    puzzle_id,
    cells,
    auto_marks,
    time_ms,
    completed,
    completed_at,
    updated_at
  from public.puzzle_progress
  where user_id = p_anon_id
  on conflict do nothing;

  -- ── streaks ──────────────────────────────────────────────────────────────
  -- Recompute composite PK to namedId:type.
  -- ON CONFLICT DO NOTHING: if the named account already has a streak row for
  -- a given type (daily/weekly/monthly), keep it (named account wins).
  insert into public.streaks
    (id, user_id, type, current_count, last_completed_key, updated_at)
  select
    p_named_id::text || ':' || type,
    p_named_id,
    type,
    current_count,
    last_completed_key,
    updated_at
  from public.streaks
  where user_id = p_anon_id
  on conflict do nothing;

  -- ── cleanup ──────────────────────────────────────────────────────────────
  -- Remove the anon-keyed source rows explicitly before deleting auth.users.
  -- Belt-and-suspenders: the FK CASCADE would handle this, but explicit
  -- deletes make the intent clear and avoid any deferred-constraint timing.
  delete from public.puzzle_progress where user_id = p_anon_id;
  delete from public.streaks           where user_id = p_anon_id;

  -- Deleting auth.users triggers CASCADE on user_entitlements and anything
  -- else with an ON DELETE CASCADE FK to auth.users.
  delete from auth.users where id = p_anon_id and is_anonymous = true;
end;
$$;

-- Only service_role may call this. The Edge Function runs as service_role.
revoke execute on function public.migrate_anonymous_progress(uuid, uuid) from public, authenticated, anon;
grant  execute on function public.migrate_anonymous_progress(uuid, uuid) to service_role;
