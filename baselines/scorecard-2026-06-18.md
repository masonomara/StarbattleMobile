# Baseline scorecard — 2026-06-18

App: Star Battle (Free) · Platform: bare RN 0.84 (iOS + Android) · Run by: Hobbes · Source: `perf_events` (Supabase, linked) + `baselines/queries.sql`

Golden paths: Buy membership · Unlock pack · Streak archive · Play+complete daily/weekly/monthly · Complete pack (see `BASELINE.md §2`)

`✓` pass · `✗` fail/regressed · `—` not instrumented · blank = pending.

> ⚠️ **This is a pre-release seed, not a real baseline.** All field data is **8 users / 44 events / iOS only**, from internal builds `0.0.1`–`0.0.2`. N is far too small for percentiles or funnels. Purpose: prove the pipeline works and lock the format. **First true baseline = after a public/TestFlight release accumulates a few days of data.**

## A. Field perf (telemetry)

| Event | n | p50 | p95 | min | max | Target (p75) | Read |
|---|---|---|---|---|---|---|---|
| `app_start` (cold→home) | 14 | 11,096ms | 187,203ms | 98ms | 470,900ms | ≤ 2,000ms | **✗ metric is broken — see Finding 1** |
| `puzzle_open` (tap→board) | 12 | 10ms | 16ms | 4ms | 19ms | ≤ 600ms | ⚠ implausibly fast — verify boundary (Finding 3) |
| `hint_load` (disk) | 12 | 98ms | 123ms | 17ms | 123ms | ≤ 150ms | **✓ healthy** (avg 89ms, all disk) |
| `js_stall` (>500ms) | 5 events | — | — | — | — | ≤ 2% sessions | N too small; ~5 stalls / 13 sessions |
| `error` | 0 | — | — | — | — | ≤ 0.5% | ✓ none |

## B. Conversion funnels

| Funnel | shown | initiated | success | rate | Read |
|---|---|---|---|---|---|
| Membership | — | — | — | — | **Not instrumented** (BASELINE.md §5). Headline #1 metric is blind. |
| Pack unlock | — | — | — | — | Not instrumented |
| Streak-archive gate | — | — | — | — | Not instrumented |

## C. Engagement

| Metric | Value | Read |
|---|---|---|
| `puzzle_complete` total | 1 | pre-release, effectively nil |
| daily / weekly / monthly completes | 0 / 0 / 0 | no streak completions recorded yet |
| Streak length distribution | — | needs `streak_recorded` (BASELINE.md §5) |
| Pack completion rate | — | needs `pack_complete` |
| Archive discovery rate | — | needs `streak_archive_view` |

## D. Golden-path reliability (E2E) — no framework yet

| Path | iOS | Android |
|---|---|---|
| Buy membership | | |
| Unlock pack | | |
| Streak archive | | |
| Play+complete daily/weekly/monthly | | |
| Complete pack | | |

## E. Lab perf — no harness yet
Bundle size, scripted cold/warm/offline cold start: pending `baselines/lab/`.

## F. Offline integrity — manual, pending
See `BASELINE.md §8`. Note: hint_load is 100% disk-sourced in this data (good offline sign), but **Android is entirely absent** from telemetry — the known Android offline file-read bug means Android offline must be checked by hand.

## G. Manual UX / a11y sign-off — pending

---

## Findings (the actual value of this run)

**Finding 1 — `app_start` does not measure load; it measures tutorial dwell.** p50 = 11s, max = 470s (7.8 min). `app_start` fires on HomeScreen first render via `msSinceLaunch()` (`HomeScreen.tsx:270`), but on fresh install the app opens the **Tutorial** route first, so the timer keeps running while the user reads the tutorial. The min (98ms) matches the known ~115ms warm path. **Action: re-anchor the startup metric to bootsplash-hidden → first interactive, or exclude tutorial sessions.** Until then the cold-start target is unmeasurable and the number is noise. *(Confirms the known startup-metric pitfall with field data.)*

**Finding 2 — `hint_load` from disk is healthy: ~90ms avg, p95 123ms, under the 150ms target, 100% disk-sourced.** The offline hint path (the one that broke on Android) looks good on iOS. Hold this as the disk baseline.

**Finding 3 — `puzzle_open` p50 = 10ms is implausibly fast for tap→board-interactive.** Either the board renders from warm cache (plausible for repeat opens) or the measurement boundary (`PuzzleScreen.tsx:261`, mount→isReady) is narrower than "user sees a playable board." Verify what it actually captures before trusting it as the puzzle-load number.

**Finding 4 — Android emits zero telemetry.** All 44 events are iOS. Either no Android release build is in anyone's hands, or Android telemetry isn't reaching Supabase. Given the known Android offline file-read bug, Android needs explicit attention.
