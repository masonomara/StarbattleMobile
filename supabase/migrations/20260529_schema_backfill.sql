-- Schema backfill for version control.
-- These tables were created via the Supabase Dashboard and are NOT in any prior migration.
-- DO NOT run this on the live database — the tables already exist.
-- USE: reference, local dev from scratch, disaster recovery.
--
-- Column types inferred from the PowerSync client schema (AppSchema.ts) and the
-- confirmed constraint query (2026-05-29). Adjust if the live DB differs.

-- ─────────────────────────────────────────────────────────────────────────────
-- puzzle_progress
-- ─────────────────────────────────────────────────────────────────────────────
-- PK:     id TEXT  (PowerSync composite: userId:puzzleId)
-- UNIQUE: (user_id, puzzle_id)
-- FK:     user_id → auth.users(id) ON DELETE CASCADE
create table if not exists public.puzzle_progress (
  id           text        primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  puzzle_id    text        not null,
  cells        text,
  auto_marks   text,
  time_ms      integer,
  completed    boolean     not null default false,
  completed_at text,
  updated_at   text,
  unique (user_id, puzzle_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- streaks
-- ─────────────────────────────────────────────────────────────────────────────
-- PK:     id TEXT  (PowerSync composite: userId:type)
-- UNIQUE: (user_id, type)
-- FK:     user_id → auth.users(id) ON DELETE CASCADE
create table if not exists public.streaks (
  id                  text  primary key,
  user_id             uuid  not null references auth.users(id) on delete cascade,
  type                text  not null,
  current_count       integer,
  last_completed_key  text,
  updated_at          text,
  unique (user_id, type)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- user_entitlements
-- ─────────────────────────────────────────────────────────────────────────────
-- PK:  user_id UUID  (confirmed: PK is user_id, NOT a separate id column)
-- FK:  user_id → auth.users(id) ON DELETE CASCADE
-- Written exclusively by the server-side Adapty webhook; clients only read it.
create table if not exists public.user_entitlements (
  user_id               uuid  primary key references auth.users(id) on delete cascade,
  is_premium            integer not null default 0,
  premium_purchased_at  text,
  owned_pack_ids        text    not null default '[]',
  updated_at            text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- streak_archive
-- ─────────────────────────────────────────────────────────────────────────────
-- PK:     id TEXT
-- UNIQUE: (type, date_key)
-- Global — no user_id, no FK to auth.users. Read-only from the client.
create table if not exists public.streak_archive (
  id         text primary key,
  type       text not null,
  date_key   text not null,
  puzzle_id  text,
  unique (type, date_key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- delete_anonymous_user  (backfill — was deployed manually, not via migrations)
-- ─────────────────────────────────────────────────────────────────────────────
-- Used historically to clean up the orphaned anonymous auth.users row after a
-- named-account sign-in. Superseded by migrate_anonymous_progress (see next
-- migration), which deletes the anon user as its final step. Kept here so the
-- function is version-controlled and re-deployable.
create or replace function public.delete_anonymous_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = target_id and is_anonymous = true;
end;
$$;

revoke execute on function public.delete_anonymous_user(uuid) from public, anon;
grant  execute on function public.delete_anonymous_user(uuid) to authenticated;
