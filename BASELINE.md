# Star Battle — Baselines & Goals

The canonical spec for what we measure, what "good" means, and how we track it every cycle.
This file is the **targets**; each measurement cycle produces a dated scorecard in `baselines/scorecard-YYYY-MM-DD.md`. Compare each cycle to the previous one and to the targets here.

- `✓` = pass / present · `✗` = fail / regressed · `—` = not yet instrumented (can't measure) · blank = human sign-off pending.
- Last updated: 2026-06-18

---

## 1. How we measure (read this first)

A mobile app has no external probe like a website does (no Lighthouse, no PSI, no crawl). Every signal is instrumented **inside the app** and shipped to Supabase, or exercised by an **E2E driver**, or captured in a **lab run**. Three systems, three tools:

| System | Question it answers | Tool | State |
|---|---|---|---|
| **A. Field telemetry** | What do *real users* do / experience? | SQL over `public.perf_events` → `baselines/queries.sql` | Perf **+ funnel/engagement events live** (instrumented 2026-06-18); data flows after next release |
| **B. E2E reliability** | *Can* a user complete a golden path on a clean build? | Maestro flows (proposed) → `.maestro/` | **Not built** |
| **C. Lab perf** | How fast on a fixed device/build? | Scripted launch + log scrape (proposed) → `baselines/lab/` | **Not built** (perfLog prints, nothing captures) |
| **D. Manual sign-off** | Does it feel right? (the Jony Ive bar) | Human checklist, §8 | Human |

Telemetry is **release-only** (`TELEMETRY_ENABLED = !__DEV__` in `src/shared/lib/telemetry.ts`). Dev builds print `[SB:*]` logs to console but persist nothing. So **field numbers only exist after a release/TestFlight build ships.**

---

## 2. Golden paths (the missions, in priority order)

Each path gets three lenses: **Reliability** (E2E pass/fail), **Funnel** (real-user rate), **Perf** (latency budget). "Instr?" = is the funnel measurable today.

| # | Golden path | Priority | Reliability check (E2E) | Funnel metric (field) | Perf budget | Instr? |
|---|---|---|---|---|---|---|
| **1** | **Buy membership** — paywall shown → tap *Buy Premium* → native sheet → success → premium unlocked | **P0** | Complete a sandbox purchase end-to-end, premium content unlocks | `purchase_initiated → success ≥ 80%`; shown→initiated rate | Paywall opens < 300ms | ✓ §B.1 |
| **2** | **Unlock a pack** — tap locked puzzle on paid pack → PaywallModal (`paid-pack`) → *Buy Pack* → pack downloads + plays | P1 | Sandbox pack purchase → pack playable offline after | unlock-tap → success %; is this a bigger driver than membership? | Pack download < 3s | ✓ §B.2 |
| **3** | **Find & use streak archive** — Home → tap streak card → ArchivePackScreen → tap past period → (premium gate) → play | P1 | Archive opens; non-premium hits gate; premium plays archived puzzle | archive-view rate; gate-hit → purchase % | Archive screen < 500ms | ✓ §B.4 |
| **4** | **Play + complete daily / weekly / monthly** — Home → today's streak → play → complete → streak increments | P2 | Each cadence completes and increments `current`/`best` | plays & completes per cadence; streak-length distribution | `puzzle_open` p75 < 600ms | ✓ §C.0 |
| **5** | **Complete a pack** — solve all puzzles in a pack until `completed === total` | P2 | Completing last puzzle flips pack to ✓ | pack-completion rate; do completers buy more? | — | ✓ §C.4 |

§ refs point to the query block in `baselines/queries.sql` that fills each funnel. All five were instrumented 2026-06-18; they populate once a release build carrying them reaches the field.

---

## 3. Scorecard structure (mobile)

The dated scorecard fills these sections. "Filled by" mirrors your web setup (psi.py → A/B…): each section is owned by one tool.

- **A. Field perf** — `queries.sql` — `app_start`, `puzzle_open`, `hint_load` p50/p75/p95; `js_stall` session rate; `error` rate. *(live)*
- **B. Conversion funnels** — `queries.sql` — membership, pack-unlock, archive-gate funnels. *(live — instrumented 2026-06-18)*
- **C. Engagement** — `queries.sql` + PowerSync — daily/weekly/monthly plays & completes, streak distribution, pack-completion rate, archive-discovery rate. *(live)*
- **D. Golden-path reliability** — Maestro — pass/fail per path × platform (iOS/Android). *(needs framework)*
- **E. Lab perf** — lab script — cold start, warm start, puzzle load, **offline cold load**, JS bundle size, frame jank. *(needs harness)*
- **F. Offline integrity** — manual + script — airplane-mode play, hints from disk, premium content offline, no crash. *(see §8; high priority per mission #3)*
- **G. Manual UX / a11y sign-off** — human — motion, haptics, VoiceOver, reduced motion, contrast, first-run feel. *(human only)*

---

## 4. Targets

Field perf targets are **field p75 unless noted**. v1 numbers are **proposed — calibrate against the first real baseline**, don't treat as gospel.

| Metric | Target | Status | Notes |
|---|---|---|---|
| `app_start` launch → first paint | ≤ 1.5s p75 / ≤ 2.5s p95 | re-anchored 2026-06-18 | Now fired at bootsplash-hidden (`navigation.tsx`), not HomeScreen mount — no longer polluted by tutorial dwell. Warm start ~115ms. Old metric read p50 11s (tutorial time). |
| `puzzle_open` tap → board interactive | ≤ 600ms p75 / ≤ 1.2s p95 | unknown | |
| `hint_load` from disk | ≤ 150ms p75 | unknown | offline path — must be fast |
| `hint_load` from download | ≤ 2.0s p75 | unknown | |
| `js_stall` (sessions with any >500ms stall) | ≤ 2% | unknown | watchdog already feeds telemetry |
| `error` event rate | ≤ 0.5% of sessions | unknown | |
| **Membership: initiated → success** | **≥ 80%** | **instrumented; awaiting field data** | **The headline number for mission #1** (`queries.sql §B.1`). `cancelled` is tracked separately so user cancels don't count against the rate. |
| Pack unlock: tap → success | calibrate | instrumented; awaiting data | `queries.sql §B.2` |
| Streak archive: gate-hit → purchase | calibrate | instrumented; awaiting data | `queries.sql §B.4` |
| Golden paths 1–5 reliability | 100% pass each release | — no E2E | |
| Crash-free sessions | ≥ 99.5% | **— no crash reporting** | `ErrorBoundary.tsx` has a TODO for Sentry; nothing wired. |
| JS bundle size | set after first lab run | — no lab harness | `npm run bundle:visualize` exists |

---

## 5. Funnel event spec (implemented 2026-06-18)

These events make missions 1–5 measurable. **Shipped** — verified with tsc + eslint + the existing test suite. Each is a `track(name, {...})` call reusing the existing pipeline (`src/shared/lib/telemetry.ts`): **no migration** (`perf_events.event` is free text, `meta` is JSONB), fire-and-forget, release-only, cannot affect gameplay. They populate the §B/§C queries once a release build carrying them reaches the field. In `__DEV__` they print `[SB:TELEMETRY] <event>` to console (without sending), so you can confirm each one fires while testing locally.

| Event | Fire where (anchor) | `meta` | Unlocks |
|---|---|---|---|
| `paywall_shown` | where `setPaywallContext(...)` is called + `PaywallModal` mount (`LibraryScreen.tsx:199`, `AccountSection.tsx:497`) | `{ context: 'sequential'\|'paid-pack'\|'unavailable', pack?, trigger: 'locked_puzzle'\|'settings'\|'archive' }` | top of membership + pack funnels |
| `purchase_initiated` | `payments.ts` before `adapty.makePurchase` (premium ~`:42`, pack ~`:65`) | `{ kind: 'premium'\|'pack', product_id, pack? }` | funnel start |
| `purchase_result` | `payments.ts` success branch + the `catch` in `useAsyncAction.ts:65` | `duration_ms` (initiated→result), `{ kind, product_id, outcome: 'success'\|'failed'\|'cancelled'\|'lag', reason? }` | **the 80% completion number** |
| `streak_archive_view` | `ArchivePackScreen.tsx` mount | `{ type, is_premium }` | "do users find the archive" |
| `streak_archive_gate` | non-premium Alert branch (`ArchivePackScreen.tsx:179`) | `{ type }` | "do they want old streaks" |
| `streak_recorded` | `recordStreak()` in `progress.ts:164` | `{ type, current, best }` | clean streak engagement (vs deriving from `puzzle_complete`) |
| `pack_complete` | where completed count reaches total (puzzle completion path, `puzzleStore.ts` / progress write) | `{ pack, puzzle_count }` | mission #4 (pack completion) |
| `hint_used` | `showHint()` reveal path in `puzzleStore.ts` (not the toggle-off branch) | `{ puzzle_id, difficulty, band, hint_number, step }` | hint frequency per user/puzzle; which puzzles are too hard (incl. abandoned) — `queries.sql §C.5` |

`streak_play` (Home streak-card tap, `HomeScreen.tsx`) is also wired, giving the play→complete ratio per cadence (`queries.sql §C.0`). `paywall_shown` also fires for the free-pack "Unlock All" alert in `LibraryScreen.tsx` (context `sequential`), covering the membership top-of-funnel that bypasses `PaywallModal`.

The §B/§C funnel queries in `baselines/queries.sql` are **active** and written against these exact event/meta shapes — run them once field data exists.

---

## 6. Tooling

| Tool | Path | What it does | Build status |
|---|---|---|---|
| Field baseline | `baselines/queries.sql` | One SQL block per scorecard section over `perf_events`. Run via `supabase db query --linked < baselines/queries.sql` or the SQL editor. | ✅ written (this commit) |
| E2E flows | `.maestro/*.yaml` | One flow per golden path. **Maestro** recommended over Detox: YAML, no native instrumentation, runs on bare RN, cloud option. Membership flow needs an iOS **StoreKit Configuration file** (`.storekit`) or sandbox tester to drive a real purchase in-sim. | proposed |
| Lab perf | `baselines/lab/run.sh` | Release build → launch on a fixed simulator N times → scrape `[SB:STARTUP]`/`[SB:*]` logs (`perfLog.ts`, `startupTimer.ts`) → median cold start. Bundle size via `npm run bundle:visualize`. | proposed |
| Offline check | §8 + script | Airplane-mode launch + play; partly scriptable in Maestro (toggle network), partly manual. | manual now |

---

## 7. Cadence

Run a full cycle **per release** (and after any change to startup, packs, payments, or offline):

1. Ship a release/TestFlight build (telemetry only flows from release builds).
2. Let field data accumulate (≥ a few days for funnels to have N).
3. Run `baselines/queries.sql` → fill sections A–C.
4. Run Maestro flows on iOS + Android → fill D.
5. Run lab script → fill E. Run offline checklist → fill F.
6. Human signs G.
7. Save as `baselines/scorecard-YYYY-MM-DD.md`; diff against previous + targets here. Regressions get a line in §Debt of `CLAUDE.md` or an issue.

---

## 8. Offline integrity & manual sign-off

**Offline (mission priority #3 — "offline must be perfect"). Known past failures live here as regression guards:**

| Check | Why it's here |
|---|---|
| Cold launch in airplane mode reaches Home without freeze | prefetch flood once froze first launch (fixed — guard it) |
| Hints load from disk offline (no re-download) | Android `readFileText` used `fetch('file://')`, OkHttp rejected it → offline hints broke (fixed — guard it, **test on Android specifically**) |
| Downloaded packs fully playable offline | core promise |
| Premium content available offline after purchase | entitlements + prefetch must survive no-network |
| No crash / infinite spinner when network drops mid-session | |

**Manual UX / a11y sign-off (tools can't judge these):**

| Path / Device | Motion feels right | Haptics | VoiceOver sensible | Reduced motion respected | Contrast by eye | No jank by eye | First-run feel |
|---|---|---|---|---|---|---|---|
| Home — iOS | | | | | | | |
| Puzzle — iOS | | | | | | | |
| Paywall — iOS | | | | | | | |
| Streak archive — iOS | | | | | | | |
| Home — Android | | | | | | | |
| Puzzle — Android | | | | | | | |

---

## 9. Known gaps (work backlog, by leverage)

1. ~~**Instrument the purchase/streak/pack funnels**~~ — **done 2026-06-18** (§5). Populates after the next release ships; re-anchored `app_start` too.
2. **Maestro E2E for the 5 golden paths** — proves "can complete," catches regressions CI-style. *Now the top open item.*
3. **Crash reporting** (Sentry) — wire the `ErrorBoundary.tsx` TODO; without it crash-free % is unknowable.
4. **Lab perf harness** — lower priority; field telemetry already gives real-device perf.
5. **CI** — no GitHub Actions/EAS/fastlane today; nothing runs tests or builds automatically.
