# Baseline scorecard — YYYY-MM-DD

App: Star Battle (Free) · Platform: bare RN (iOS + Android) · Run by: [name] · Source: `perf_events` (Supabase, linked) + `baselines/queries.sql` · Build(s): [app_version range]

Golden paths (BASELINE.md §2): Buy membership · Streak tracking (archive) · Streak engagement · Pack completion · Pack unlocks · Hint usage

`✓` pass/healthy · `✗` fail/regressed · `—` not instrumented · blank = pending. **Copy this file to `scorecard-YYYY-MM-DD.md`; the filled file IS the baseline.** Diff each cycle vs the previous one and vs the Targets in `BASELINE.md §7`.

Filled by tool — `queries.sql` → A/B/C/D · Maestro → E · lab script → F · human → G/H.

> ⚠️ Note N (events / sessions / users / platforms) up top. Funnels and percentiles are meaningless below ~hundreds of events. A pre-release run proves the pipeline; the first **true** baseline is after a public/TestFlight release accumulates a few days of data.

**Data volume (`queries.sql §0`):** events ___ · sessions ___ · users ___ · platforms ___ · versions ___ · window ___

---

## A. Field perf (`queries.sql §A`)

| Event | n | p50 | p75 | p95 | Target (p75) | Read |
|---|---|---|---|---|---|---|
| `app_start` (launch→paint) | | | | | ≤ 1.5s | |
| `puzzle_open` (tap→board) | | | | | ≤ 600ms | |
| `hint_load` — disk | | | | | ≤ 150ms | |
| `hint_load` — download | | | | | ≤ 2.0s | |
| `js_stall` (% sessions >500ms) | | | | | ≤ 2% | |
| `error` (% sessions) | | | | | ≤ 0.5% | |

## B. Conversion funnels — named steps + drop-off (`queries.sql §B`, §D.1–2; BASELINE.md §5)

**B.1 Membership (P0):** shown ___ → initiated ___ → success ___ · shown→initiated __% *(paywall surface only — §5.1)* · **initiated→success __% (target ≥ 80%, all surfaces)** · cancelled ___ / failed ___ / lag ___ · by source (`§D.1b`): paywall ___ / settings ___ / **archive ___** / unknown ___
**B.2 Pack unlock (P2):** shown ___ → initiated ___ → success(downloaded) ___ · initiated→success __% · *vs membership volume:* ___
**B.3 Streak archive (P1):** archive_views ___ (viewers ___) → gate_hits ___ (users ___) → premium purchases ___ · **gate→purchase __%**
**B.1a Failure reasons (`§B.1a`):** ___

## C. Engagement (`queries.sql §C`; BASELINE.md §6)

| Metric | daily | weekly | monthly | Read |
|---|---|---|---|---|
| Plays (`streak_play`) | | | | |
| Completes (`streak_recorded`) | | | | |
| Play→complete ratio | | | | too hard / too easy? |
| Max streak length | | | | |

Pack completion rate (`§C.4`): ___ · Hint reveals/user (`§C.5`): ___ · Most hint-heavy puzzles (`§C.5a`): ___

## D. Segmentation & reengagement (`queries.sql §D`; BASELINE.md §3)

| Cut | Finding |
|---|---|
| Membership rate by platform × version (`§D.1`) | |
| Membership rate new vs returning (`§D.3a`) | |
| Pack-buyers upgrading to premium (`§D.2a`) | |
| **Reengagement: active-days holder vs non-holder (`§D.4`)** | |
| Reengagement, less-biased: played-and-held vs played-not-held (`§D.4a`) | |
| Engagement by paid status (`§D.5`) | |

## E. Golden-path reliability — Maestro (`.maestro/`)

| Path | iOS | Android | Notes |
|---|---|---|---|
| Buy membership (`paywall-reach`) | | | needs StoreKit/sandbox for full purchase |
| Streak archive (`streak-archive`) | | | |
| Play + complete (`play-complete`) | | | |
| Pack unlock (`paywall-reach`, paid-pack) | | | |
| Smoke (`smoke`) | | | |

## F. Lab perf — no harness yet
Cold / warm / **offline-cold** start, JS bundle size, frame jank: pending `baselines/lab/`.

## G. Offline integrity (BASELINE.md §11) — manual

| Check | iOS | Android |
|---|---|---|
| Airplane-mode cold launch → Home, no freeze | | |
| Hints load from disk offline (no re-download) | | |
| Downloaded packs fully playable offline | | |
| Premium content available offline after purchase | | |
| No crash / infinite spinner when network drops mid-session | | |

## H. Manual UX / a11y sign-off (BASELINE.md §11)

| Path / Device | Motion | Haptics | VoiceOver | Reduced motion | Contrast | No jank | First-run |
|---|---|---|---|---|---|---|---|
| Home — iOS | | | | | | | |
| Puzzle — iOS | | | | | | | |
| Paywall — iOS | | | | | | | |
| Streak archive — iOS | | | | | | | |

---

## Findings

*(The actual value of the run — what changed, what's broken, what to do. One numbered finding each.)*

**Finding 1 — …**
