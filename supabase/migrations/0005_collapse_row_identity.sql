-- Collapse `streaks` and `puzzle_progress` to a SINGLE row identity: the
-- composite primary key id = "<user_id>:<type>" / "<user_id>:<puzzle_id>".
--
-- Both tables previously defined identity twice, incompatibly:
--   * Primary key `id`              (what the client/connector upsert on)
--   * UNIQUE(user_id, type|puzzle_id)
--   * default id = gen_random_uuid()
-- Any row whose id came from the uuid default therefore had a PK the client
-- never writes. The client upserts ON CONFLICT(id); it missed that row, fell
-- through to INSERT, and tripped the UNIQUE constraint (SQLSTATE 23505). The
-- sync connector treats 23xxx as fatal and silently discards the write, so the
-- row never synced.
--
-- The signup trigger below was the source: it inserted three streak rows per
-- user WITHOUT an id, so every streak row got a random uuid -> streaks never
-- recorded for anyone. After this migration the composite PK is the only
-- identity, matching how the client and migrate_anonymous_progress() already
-- address rows.

-- 1. Fix the signup trigger to seed canonical ids (it omitted id before).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_entitlements (user_id)
  values (new.id)
  on conflict do nothing;

  insert into public.streaks (id, user_id, type)
  values
    (new.id || ':daily',   new.id, 'daily'),
    (new.id || ':weekly',  new.id, 'weekly'),
    (new.id || ':monthly', new.id, 'monthly')
  on conflict do nothing;

  return new;
end;
$$;

-- 2. Re-key existing rows to canonical ids. streaks rows all carry a random
--    uuid (count 0, no duplicate pairs); puzzle_progress is already canonical
--    so its UPDATE is a no-op. Target ids are unique per pair, so no collision.
update public.streaks
set id = user_id || ':' || type
where id <> user_id || ':' || type;

update public.puzzle_progress
set id = user_id || ':' || puzzle_id
where id <> user_id || ':' || puzzle_id;

-- 3. Drop the redundant UNIQUE constraints; the composite PK already enforces
--    one row per (user_id, type) / (user_id, puzzle_id).
alter table public.streaks         drop constraint if exists streaks_user_id_type_key;
alter table public.puzzle_progress drop constraint if exists puzzle_progress_user_id_puzzle_id_key;

-- 4. Drop the gen_random_uuid() id defaults. Every writer (client, signup
--    trigger, migrate_anonymous_progress) now supplies the composite id; an
--    insert that forgets it should fail loudly rather than mint a random id
--    that re-creates this bug.
alter table public.streaks         alter column id drop default;
alter table public.puzzle_progress alter column id drop default;
