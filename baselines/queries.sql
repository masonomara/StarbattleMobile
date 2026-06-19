-- Star Battle — field baseline queries
-- Source: public.perf_events (telemetry sink; RELEASE builds only — see src/shared/lib/telemetry.ts)
-- Run:    supabase db query --linked < baselines/queries.sql
--   or:   paste a block into the Supabase SQL editor.
-- Each block = one scorecard section (see BASELINE.md §3). Re-run per cycle; compare to the prior dated scorecard.
-- Window: last 28 days unless noted. Columns: id, ts, anon_user_id, session_id, app_version, platform, event, duration_ms, value, meta(jsonb).
--
-- The §B/§C funnel events (paywall_shown, purchase_*, streak_*, pack_complete) were
-- instrumented 2026-06-18. They populate once a RELEASE build carrying them is in the field.

-- ───────────────────────────────────────────────────────────────────────────
-- §0  Sanity: is there any field data at all, and from which versions?
-- ───────────────────────────────────────────────────────────────────────────
select app_version, platform, count(*) events,
       count(distinct session_id) sessions,
       count(distinct anon_user_id) users,
       min(ts) first_seen, max(ts) last_seen
from perf_events
where ts > now() - interval '28 days'
group by app_version, platform
order by last_seen desc;

-- ───────────────────────────────────────────────────────────────────────────
-- §A  FIELD PERF — latency percentiles by event & platform  (BASELINE.md §A)
-- ───────────────────────────────────────────────────────────────────────────
select event, platform, count(*) n,
       round(percentile_cont(0.50) within group (order by duration_ms)) p50,
       round(percentile_cont(0.75) within group (order by duration_ms)) p75,
       round(percentile_cont(0.95) within group (order by duration_ms)) p95
from perf_events
where ts > now() - interval '28 days'
  and event in ('app_start','puzzle_open','hint_load')
  and duration_ms is not null
group by event, platform
order by event, platform;

-- §A.0  app_start is now anchored at bootsplash-hidden (navigation.tsx). Split by
-- the first route so a slow Tutorial-path install is distinguishable from Home.
select meta->>'route' route, platform, count(*) n,
       round(percentile_cont(0.75) within group (order by duration_ms)) p75
from perf_events
where event = 'app_start' and ts > now() - interval '28 days'
group by 1,2 order by 1,2;

-- §A.1  hint_load split by source (disk should dominate & be fast offline)
select meta->>'source' source, platform, count(*) n,
       round(percentile_cont(0.75) within group (order by duration_ms)) p75_ms,
       round(percentile_cont(0.75) within group (order by value)) p75_kb
from perf_events
where ts > now() - interval '28 days' and event = 'hint_load'
group by 1,2 order by 1,2;

-- §A.2  js_stall — share of sessions hit by a >500ms stall
with sess as (select distinct session_id from perf_events where ts > now() - interval '28 days'),
     bad  as (select distinct session_id from perf_events where event = 'js_stall' and ts > now() - interval '28 days')
select (select count(*) from sess) total_sessions,
       (select count(*) from bad)  stalled_sessions,
       round(100.0 * (select count(*) from bad) / nullif((select count(*) from sess),0), 2) pct;

-- §A.3  errors by kind/reason
select meta->>'kind' kind, meta->>'reason' reason, count(*) n
from perf_events
where event = 'error' and ts > now() - interval '28 days'
group by 1,2 order by n desc;

-- ───────────────────────────────────────────────────────────────────────────
-- §B  CONVERSION FUNNELS  (BASELINE.md §B)  — instrumented 2026-06-18
-- ───────────────────────────────────────────────────────────────────────────

-- §B.1  MEMBERSHIP FUNNEL — the headline "do they complete the purchase" number.
-- initiated_to_success_pct is the target ≥ 80% metric (BASELINE.md §4).
with f as (
  select
    count(*) filter (where event = 'purchase_initiated' and meta->>'kind' = 'premium') initiated,
    count(*) filter (where event = 'purchase_result' and meta->>'kind' = 'premium'
                           and meta->>'outcome' = 'success')                           succeeded,
    count(*) filter (where event = 'purchase_result' and meta->>'kind' = 'premium'
                           and meta->>'outcome' = 'cancelled')                         cancelled,
    count(*) filter (where event = 'purchase_result' and meta->>'kind' = 'premium'
                           and meta->>'outcome' = 'lag')                               lag,
    count(*) filter (where event = 'purchase_result' and meta->>'kind' = 'premium'
                           and meta->>'outcome' = 'failed')                            failed
  from perf_events where ts > now() - interval '28 days'
)
select *, round(100.0 * succeeded / nullif(initiated,0), 1) initiated_to_success_pct from f;

-- §B.1a  Why premium purchases don't complete — failure reasons
select meta->>'outcome' outcome, meta->>'reason' reason, count(*) n
from perf_events
where event = 'purchase_result' and meta->>'kind' = 'premium'
  and meta->>'outcome' <> 'success' and ts > now() - interval '28 days'
group by 1,2 order by n desc;

-- §B.2  PACK-UNLOCK FUNNEL — paywall (paid-pack) → initiated → succeeded
select
  count(*) filter (where event = 'paywall_shown' and meta->>'context' = 'paid-pack') shown,
  count(*) filter (where event = 'purchase_initiated' and meta->>'kind' = 'pack')    initiated,
  count(*) filter (where event = 'purchase_result' and meta->>'kind' = 'pack'
                         and meta->>'outcome' = 'success')                           succeeded
from perf_events where ts > now() - interval '28 days';

-- §B.3  PAYWALL SURFACES — where users meet a paywall (membership top-of-funnel)
select meta->>'context' context, count(*) shown,
       count(distinct anon_user_id) users
from perf_events
where event = 'paywall_shown' and ts > now() - interval '28 days'
group by 1 order by shown desc;

-- §B.4  STREAK-ARCHIVE GATE — discovery + the "users want old streaks" hypothesis
select
  count(*) filter (where event = 'streak_archive_view')                     archive_views,
  count(distinct anon_user_id) filter (where event = 'streak_archive_view') archive_viewers,
  count(*) filter (where event = 'streak_archive_gate')                     gate_hits,
  count(distinct anon_user_id) filter (where event = 'streak_archive_gate') users_hit_gate
from perf_events where ts > now() - interval '28 days';

-- ───────────────────────────────────────────────────────────────────────────
-- §C  ENGAGEMENT  (BASELINE.md §C)
-- ───────────────────────────────────────────────────────────────────────────

-- §C.0  Streak PLAY vs COMPLETE per cadence — the play→complete ratio.
-- plays come from streak_play (Home card tap); completes from streak_recorded.
select
  meta->>'type' type,
  count(*) filter (where event = 'streak_play')     plays,
  count(*) filter (where event = 'streak_recorded') completes
from perf_events
where event in ('streak_play','streak_recorded') and ts > now() - interval '28 days'
group by 1 order by 1;

-- §C.1  Total puzzle completions + streak completions derived from puzzle_id prefix
-- (kept for cross-checking against streak_recorded; see src/shared/lib/progress.ts)
select count(*) total_completes,
       count(*) filter (where meta->>'puzzle_id' like 'daily:%')   daily,
       count(*) filter (where meta->>'puzzle_id' like 'weekly:%')  weekly,
       count(*) filter (where meta->>'puzzle_id' like 'monthly:%') monthly
from perf_events
where event = 'puzzle_complete' and ts > now() - interval '28 days';

-- §C.2  Hint dependency by difficulty (are puzzles too hard / too easy?)
select meta->>'difficulty' difficulty,
       count(*) n,
       round(avg((meta->>'hints_used')::int), 2) avg_hints
from perf_events
where event = 'puzzle_complete' and ts > now() - interval '28 days'
group by 1 order by 1;

-- §C.3  Streak length reached (max current/best seen per cadence)
select meta->>'type' type, count(*) recorded,
       max((meta->>'current')::int) max_current, max((meta->>'best')::int) max_best
from perf_events
where event = 'streak_recorded' and ts > now() - interval '28 days'
group by 1 order by 1;

-- §C.4  PACK COMPLETION — which packs do people finish? (do they want more?)
select meta->>'pack' pack, count(*) completions,
       count(distinct anon_user_id) finishers
from perf_events
where event = 'pack_complete' and ts > now() - interval '28 days'
group by 1 order by completions desc;

-- §C.5  HINT USAGE — who uses hints, how often, on which puzzles.
-- Per-reveal (incl. puzzles never completed), unlike puzzle_complete.hints_used.
select
  count(*) total_reveals,
  count(distinct anon_user_id) users_using_hints,
  count(distinct meta->>'puzzle_id') distinct_puzzles_hinted,
  round(avg((meta->>'hint_number')::int), 2) avg_hint_depth
from perf_events
where event = 'hint_used' and ts > now() - interval '28 days';

-- §C.5a  Most hint-heavy puzzles — candidates that are too hard / unclear
select meta->>'puzzle_id' puzzle_id, meta->>'difficulty' difficulty,
       count(*) reveals, count(distinct anon_user_id) users
from perf_events
where event = 'hint_used' and ts > now() - interval '28 days'
group by 1,2 order by reveals desc limit 25;

-- §C.5b  Hint reliance by difficulty
select meta->>'difficulty' difficulty,
       count(*) reveals, count(distinct anon_user_id) users
from perf_events
where event = 'hint_used' and ts > now() - interval '28 days'
group by 1 order by 1;

-- ───────────────────────────────────────────────────────────────────────────
-- §D  SEGMENTATION & NAMED-STEP FUNNELS  (BASELINE.md §3, §5, §6)
-- ───────────────────────────────────────────────────────────────────────────
-- Segment definitions (BASELINE.md §3) — how each cut is obtained:
--   platform / app_version  → native columns.
--   free vs paid            → meta->>'is_premium' / (meta->>'owned_pack_count')::int,
--                             STAMPED AT EMIT (added 2026-06-19). Rows from older
--                             builds have no is_premium key → null = "unknown (likely free)".
--   new vs returning        → DERIVED: first-seen ts per anon_user_id (§D.3).
--   streak-holder           → DERIVED: has a streak_recorded row (§D.4).
-- Always split funnels by app_version — never pool across a release that changed the flow.

-- §D.1  MEMBERSHIP FUNNEL AS NAMED STEPS, with drop-off %, by platform × version.
-- NOTE: `shown` (paywall_shown context=sequential) is the PAYWALL SURFACE ONLY.
-- Premium also starts from the Settings upgrade button, which emits NO paywall_shown
-- (BASELINE.md §5.1) — so shown_to_initiated_pct can exceed 100%. Read it only for
-- the paywall surface; for the all-surface split use §D.1b. The native sheet between
-- initiated and success is opaque (Adapty/StoreKit). initiated_to_success_pct is valid
-- for all surfaces (both events fire regardless of origin).
select
  coalesce(platform, '?')    platform,
  coalesce(app_version, '?') ver,
  count(*) filter (where event = 'paywall_shown'      and meta->>'context' = 'sequential') shown,
  count(*) filter (where event = 'purchase_initiated' and meta->>'kind'    = 'premium')    initiated,
  count(*) filter (where event = 'purchase_result'    and meta->>'kind'    = 'premium'
                                                       and meta->>'outcome' = 'success')    success,
  round(100.0 * count(*) filter (where event = 'purchase_initiated' and meta->>'kind' = 'premium')
        / nullif(count(*) filter (where event = 'paywall_shown' and meta->>'context' = 'sequential'), 0), 1) shown_to_initiated_pct,
  round(100.0 * count(*) filter (where event = 'purchase_result' and meta->>'kind' = 'premium' and meta->>'outcome' = 'success')
        / nullif(count(*) filter (where event = 'purchase_initiated' and meta->>'kind' = 'premium'), 0), 1)  initiated_to_success_pct
from perf_events
where ts > now() - interval '28 days'
group by 1, 2 order by 1, 2;

-- §D.1b  PREMIUM PURCHASES BY SOURCE (paywall / settings / archive / unknown).
-- source='archive' is the streak-archive gate → upgrade path (mission 2, EXACT —
-- stamped via openSettings('archive') → openReason); 'settings' = Settings opened
-- directly; 'paywall' = PaywallModal. Settings+archive have no paywall_shown by design.
select
  coalesce(meta->>'source', 'unknown') source,
  count(*) filter (where event = 'purchase_initiated') initiated,
  count(*) filter (where event = 'purchase_result' and meta->>'outcome' = 'success') success,
  round(100.0 * count(*) filter (where event = 'purchase_result' and meta->>'outcome' = 'success')
        / nullif(count(*) filter (where event = 'purchase_initiated'), 0), 1) initiated_to_success_pct
from perf_events
where meta->>'kind' = 'premium' and ts > now() - interval '28 days'
group by 1 order by 2 desc;

-- §D.2  PACK-UNLOCK FUNNEL AS NAMED STEPS (BASELINE.md §5.2). Compare these
-- volumes against §D.1 to answer "is pack-unlock a bigger driver than membership?".
select
  coalesce(platform, '?')    platform,
  coalesce(app_version, '?') ver,
  count(*) filter (where event = 'paywall_shown'      and meta->>'context' = 'paid-pack') shown,
  count(*) filter (where event = 'purchase_initiated' and meta->>'kind'    = 'pack')      initiated,
  count(*) filter (where event = 'purchase_result'    and meta->>'kind'    = 'pack'
                                                       and meta->>'outcome' = 'success')   success_downloaded,
  round(100.0 * count(*) filter (where event = 'purchase_result' and meta->>'kind' = 'pack' and meta->>'outcome' = 'success')
        / nullif(count(*) filter (where event = 'purchase_initiated' and meta->>'kind' = 'pack'), 0), 1) initiated_to_success_pct
from perf_events
where ts > now() - interval '28 days'
group by 1, 2 order by 1, 2;

-- §D.2a  DO PACK-BUYERS UPGRADE TO PREMIUM? Segment buyers by owned_pack_count at
-- emit time. A user seen buying premium while already owning packs = pack→premium path.
select
  (meta->>'owned_pack_count')::int owned_packs_at_purchase,
  count(*) filter (where meta->>'kind' = 'pack')    pack_purchases,
  count(*) filter (where meta->>'kind' = 'premium') premium_purchases
from perf_events
where event = 'purchase_result' and meta->>'outcome' = 'success'
  and ts > now() - interval '28 days'
group by 1 order by 1;

-- §D.3  NEW vs RETURNING (BASELINE.md §3). Window-relative: a user's first session
-- inside the window = "new"; later sessions = "returning". State the window.
with first_seen as (
  select anon_user_id, min(ts) first_ts
  from perf_events where ts > now() - interval '28 days'
  group by 1
)
select
  case when f.first_ts > now() - interval '7 days' then 'new_last_7d' else 'returning' end cohort,
  count(distinct e.anon_user_id) users,
  count(*)                       events,
  count(distinct e.session_id)   sessions
from perf_events e join first_seen f using (anon_user_id)
where e.ts > now() - interval '28 days'
group by 1 order by 1;

-- §D.3a  HEADLINE MEMBERSHIP RATE split by new vs returning — do newcomers or
-- veterans convert? (purchase funnel starts free for everyone, so the meaningful
-- cut here is cohort/platform, not free/paid.)
with first_seen as (
  select anon_user_id, min(ts) first_ts from perf_events
  where ts > now() - interval '28 days' group by 1
)
select
  case when f.first_ts > now() - interval '7 days' then 'new_last_7d' else 'returning' end cohort,
  count(*) filter (where event = 'purchase_initiated' and meta->>'kind' = 'premium') initiated,
  count(*) filter (where event = 'purchase_result' and meta->>'kind' = 'premium'
                                                    and meta->>'outcome' = 'success') success,
  round(100.0 * count(*) filter (where event = 'purchase_result' and meta->>'kind' = 'premium' and meta->>'outcome' = 'success')
        / nullif(count(*) filter (where event = 'purchase_initiated' and meta->>'kind' = 'premium'), 0), 1) initiated_to_success_pct
from perf_events e join first_seen f using (anon_user_id)
where e.ts > now() - interval '28 days'
group by 1 order by 1;

-- §D.4  REENGAGEMENT — DO STREAKS DRIVE RETURN VISITS? (mission 3's hardest Q,
-- BASELINE.md §6.) Active-days-per-user, streak-holders vs non-holders.
-- CAVEAT: correlational, not causal — streak-holders are already the more engaged
-- users (that's WHY they have a streak). §D.4a tries to reduce that selection bias.
with holders as (
  select distinct anon_user_id from perf_events
  where event = 'streak_recorded' and (meta->>'current')::int >= 1
),
user_days as (
  select anon_user_id, count(distinct date_trunc('day', ts)) active_days
  from perf_events where ts > now() - interval '28 days'
  group by 1
)
select
  case when h.anon_user_id is not null then 'streak_holder' else 'non_holder' end cohort,
  count(*)                                                              users,
  round(avg(active_days), 2)                                            avg_active_days,
  round(percentile_cont(0.5) within group (order by active_days))       median_active_days
from user_days u left join holders h using (anon_user_id)
group by 1 order by 1;

-- §D.4a  Less-biased cut: among users who STARTED a streak (streak_play ≥ 1),
-- compare those who went on to HOLD one (streak_recorded) vs those who didn't.
-- Both populations chose to engage with streaks, so the activity gap is closer to
-- "the streak itself drove return" than the §D.4 split.
with played as (select distinct anon_user_id from perf_events where event = 'streak_play'),
     held   as (select distinct anon_user_id from perf_events where event = 'streak_recorded'),
     user_days as (
       select anon_user_id, count(distinct date_trunc('day', ts)) active_days
       from perf_events where ts > now() - interval '28 days' group by 1
     )
select
  case when held.anon_user_id is not null then 'played_and_held' else 'played_not_held' end cohort,
  count(*) users, round(avg(active_days), 2) avg_active_days
from played p
  join user_days using (anon_user_id)
  left join held on held.anon_user_id = p.anon_user_id
group by 1 order by 1;

-- §D.5  ENGAGEMENT BY PAID STATUS — do paid users play/complete more? (free/paid
-- is meaningful here, unlike in the purchase funnel.) Uses the emit-time stamp.
select
  coalesce(meta->>'is_premium', 'unknown') is_premium,
  count(*) filter (where event = 'puzzle_complete')                                completes,
  count(*) filter (where event = 'streak_recorded')                                streaks,
  count(*) filter (where event = 'hint_used')                                      hint_reveals,
  count(distinct anon_user_id)                                                     users
from perf_events
where ts > now() - interval '28 days'
  and event in ('puzzle_complete', 'streak_recorded', 'hint_used')
group by 1 order by 1;
