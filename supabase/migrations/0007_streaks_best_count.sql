-- Track an all-time best (longest) streak per type alongside the active run.
-- The client previously stored only current_count, so there's no history to
-- backfill from beyond the current run — seed best_count from current_count.

alter table public.streaks
  add column if not exists best_count integer not null default 0;

-- Seed existing rows: the best we can prove is at least the current run.
update public.streaks
  set best_count = greatest(best_count, current_count);
