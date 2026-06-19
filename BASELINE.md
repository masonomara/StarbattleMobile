# Star Battle — Baselines & Goals

The canonical spec for **what we measure, what "good" means, and how we track it every cycle.**
This file is the **targets + definitions**; each measurement cycle produces a dated scorecard in
`baselines/scorecard-YYYY-MM-DD.md` (start from `baselines/scorecard-template.md`). Compare each
cycle to the previous one and to the targets here.

This is the behavioral equivalent of a website's Lighthouse/SEO scorecard: a mobile app has no
external probe, so **every signal is instrumented inside the app** (or exercised by an E2E driver,
or captured in a lab run). The discipline that makes the numbers trustworthy across cycles lives in
three places — and these are the parts that are easy to get wrong:

- **§3 Segmentation** — the cuts (new/returning, free/paid, platform, streak-holder). Without them,
  one aggregate hides four different stories. *"Do streaks drive reengagement?" is unanswerable
  without splitting streak-holders from everyone else.*
- **§4 Event taxonomy** — the event names + property schema. The column definitions of the behavior
  layer. Without a convention, every metric gets defined three ways and cross-cycle comparison lies.
- **§5 Funnels with named steps** — start → each intermediate step → completion. The **drop-off
  point is the insight**; a bare conversion rate isn't.

Legend: `✓` pass/present · `✗` fail/regressed · `—` not yet instrumented (can't measure) · blank = human sign-off pending.
Last updated: **2026-06-19**.

---

## 1. How we measure (read this first)

Four systems, four tools. Each scorecard section is owned by exactly one.

| System | Question it answers | Tool | State |
|---|---|---|---|
| **A. Field telemetry** | What do *real users* do / experience? | SQL over `public.perf_events` → `baselines/queries.sql` | **Live.** Perf + funnel/engagement events instrumented 2026-06-18; **per-event segment stamping added 2026-06-19** (§3). Data flows after a release build ships. |
| **B. E2E reliability** | *Can* a user complete a golden path on a clean build? | Maestro flows → `.maestro/*.yaml` | **Built** (5 flows, 2026-06-19) + `.storekit` config (`ios/StarbattleMobile.storekit`) drives the purchase sheet in-sim. JS gates run in CI (§9); Maestro runs manually (needs macOS runner + sim). Entitlement-unlock assertion needs a sandbox tester. |
| **C. Lab perf** | How fast on a fixed device/build? | Scripted launch + `[SB:*]` log scrape → `baselines/lab/` | **Not built** (perfLog prints; nothing captures). |
| **D. Manual sign-off** | Does it feel right? (the Jony Ive bar) | Human checklist, §11 | Human. |

**Telemetry is release-only** (`TELEMETRY_ENABLED = !__DEV__` in `src/shared/lib/telemetry.ts`). Dev
builds print `[SB:TELEMETRY] <event>` to console but persist nothing — so **field numbers only exist
after a release/TestFlight build ships.** Use the console line to confirm an event *fires* while
testing locally; the row's segment properties (§3) are stamped on send, not shown in that line.

---

## 2. Missions & golden paths (priority order)

The six missions, each as a golden path with three lenses — **Reliability** (E2E pass/fail),
**Funnel** (real-user rates, §5), **Perf** (latency budget) — plus whether it's measurable today.

| # | Mission / golden path | Pri | Reliability (E2E) | Funnel / engagement metric | Perf budget | Instr? |
|---|---|---|---|---|---|---|
| **1** | **Buy membership** — *if a user starts a purchase, they can finish it.* paywall → *Buy Premium* → native sheet → success → premium unlocks | **P0** | `.maestro/paywall-reach.yaml` (+ sandbox purchase) | `purchase_initiated → success ≥ 80%` (§5.1) — **the headline number** | Paywall opens < 300ms | ✓ |
| **2** | **Streak tracking** — *do users find the streak archive, and do they buy premium to unlock old streaks?* Home → streak card → ArchivePackScreen → past period → premium gate → play | **P1** | `.maestro/streak-archive.yaml` (gate for non-premium; premium plays) | archive-view rate; **gate-hit → purchase %** (§5.3) | Archive screen < 500ms | ✓ |
| **3** | **Streak engagement** — *plays/completes daily-weekly-monthly; tries to create streaks; and does holding a streak drive reengagement?* | **P1** | `.maestro/play-complete.yaml` (each cadence increments) | plays & completes per cadence; play→complete ratio (§6); **reengagement: streak-holders vs not (§6, §D)** | `puzzle_open` p75 < 600ms | ✓ |
| **4** | **Pack completion** — *do people finish packs (→ do they want more)?* solve until `completed === total` | P2 | last puzzle flips pack to ✓ | pack-completion rate; do completers buy more? (§6) | — | ✓ |
| **5** | **Pack unlocks** — *do users tap to unlock locked packs, and is that a bigger purchase driver than membership?* locked puzzle → PaywallModal(`paid-pack`) → *Buy Pack* → downloads + plays | P2 | `.maestro/paywall-reach.yaml` (paid-pack path) | unlock-tap → success % (§5.2); compare volume vs §5.1 | Pack download < 3s | ✓ |
| **6** | **Hint usage** — *who uses hints, how often, on which puzzles?* reveal a hint mid-solve | P2 | covered in play flow | reveals/user; hint-heavy puzzles = too-hard candidates (§6) | `hint_load` disk < 150ms | ✓ |

All funnels were instrumented 2026-06-18 and populate once a release build carrying them reaches the
field. Each "Instr? ✓" depends on the event taxonomy in §4 and is segmentable per §3.

---

## 3. Segmentation (the cuts every metric is sliced by)

An aggregate hides the story. Every number in §5–§6 should be reported **both overall and split by the
dimensions below.** A dimension is only usable if the data carries it — so each row says *how* it's
obtained. The rule:

> **Stamp at emit-time only what cannot be reconstructed from the stream. Derive everything else at query time.**

| Dimension | Values | How obtained | Notes / limits |
|---|---|---|---|
| **Platform** | `ios` · `android` | column `platform` (native) | Android emits **zero** telemetry today (see scorecard 2026-06-18, Finding 4) — splits are iOS-only until an Android build ships. |
| **App version** | e.g. `0.0.3` | column `app_version` (native) | Always split funnels by version; never pool across a release that changed the flow. |
| **Free vs paid** | free · pack-buyer · premium | **stamped at emit** → `meta.is_premium` (bool), `meta.owned_pack_count` (int) | **Added 2026-06-19** (`setSegmentProvider` in `App.tsx` → `telemetry.ts`). This is the *one* user-state that can't be rebuilt at query time — a user's paid status *at the instant an event fired* isn't otherwise in the stream. It's **state-at-emit**: a `purchase_initiated` carries `is_premium:false`, its matching `purchase_result:success` carries `true` (the entitlement flips before the result is tracked). Rows from builds **before** 2026-06-19, or the first few early-boot events before `App` registers the provider, have **no** `is_premium` key → treat null as "unknown (likely free)". |
| **New vs returning** | new · returning | **derived at query** → first-seen `ts` per `anon_user_id` (window fn, §D) | Window-relative: a user "new" inside a 28-day window may be returning lifetime. State the window. |
| **Streak-holder** | holder · non-holder | **derived at query** → has ≥1 `streak_recorded` (current ≥ 1) | The whole point of `streak_recorded` carrying `current/best`: streak status is reconstructable, so it's never stamped. Powers the reengagement question (§6). |
| **Cadence** | daily · weekly · monthly | `meta.type` on streak events | Per-mission cut for mission 3. |
| **Difficulty / band** | `easy`·`medium`·`hard` (+ numeric) | `meta.difficulty`, `meta.band` on `hint_used` / `puzzle_complete` | Per-mission cut for mission 6 (which puzzles are too hard). |

**Why this split matters, concretely:** *"Do streaks drive reengagement?"* = compare active-days-per-user
for **streak-holders vs non-holders** (§6 / `queries.sql §D`). *"Is pack-unlock a bigger driver than
membership?"* = compare **§5.2 vs §5.1 volume**, and segment buyers by `owned_pack_count` to see if
pack-buyers ever convert to premium. Neither is answerable from a pooled aggregate.

---

## 4. Event taxonomy (the column definitions of the behavior layer)

**Naming convention.** `snake_case`, `object_action` (noun then past-tense/state verb): `purchase_initiated`,
`streak_recorded`, `pack_complete`, `paywall_shown`. New events follow this shape. The canonical list is the
`PerfEventName` union in `src/shared/lib/telemetry.ts` — the union **is** the schema (adding a value there is how
you add an event). One `track(name, {...})` call per event; fire-and-forget, release-only, cannot affect gameplay.

**Standard properties — auto-attached to every event, never passed by call sites:**

| Property | Source | Added |
|---|---|---|
| `ts`, `anon_user_id`, `session_id`, `app_version`, `platform` | columns, set in `flush()` | 0008 migration |
| `meta.is_premium`, `meta.owned_pack_count` | `setSegmentProvider` (§3) | 2026-06-19 |

`session_id` = one cold start (new per process). `duration_ms` and `value` are typed columns; everything
else lives in the free-form JSONB `meta` (so **new properties need no migration**).

**Per-event property dictionary.** Types: `b`=bool, `i`=int, `ms`=duration_ms column, `kb`=value column, `s`=string/enum.

| Event | Fires where | `meta` / typed fields | Mission |
|---|---|---|---|
| `app_start` | bootsplash hidden (`navigation.tsx`) | `ms` launch→first paint · `meta.cold`(b) · `meta.route`(s) | perf |
| `puzzle_open` | tap → board `isReady` (`PuzzleScreen`) | `ms` | 3 perf |
| `hint_load` | hints fetched | `ms` · `kb`(value) · `meta.source` `disk\|download\|fallback` | 6 perf, offline |
| `js_stall` | JS thread frozen > threshold | `ms` block length | perf |
| `error` | failure path | `meta.kind`(s) · `meta.reason`(s) | reliability |
| `puzzle_complete` | puzzle solved | `ms` solve time · `meta.puzzle_id`(s) · `meta.difficulty`(s) · `meta.hints_used`(i) | 4, 6 |
| `hint_used` | a hint is **revealed** (not toggle-off) | `meta.puzzle_id`·`difficulty`·`band`·`hint_number`(i)·`step`(i) | **6** |
| `streak_play` | Home streak-card tap (start a challenge) | `meta.type` `daily\|weekly\|monthly` | **3** (the "tries to create a streak" step) |
| `streak_recorded` | `recordStreak()` on completion | `meta.type`·`current`(i)·`best`(i) | **3** (creates/advances a streak) |
| `pack_complete` | final puzzle of a library pack solved | `meta.pack`(s)·`meta.puzzle_count`(i) | **4** |
| `streak_archive_view` | ArchivePackScreen mount | `meta.type`·`is_premium`(b) | **2** (do they find it) |
| `streak_archive_gate` | non-premium hits the archive paywall | `meta.type` | **2** (do they want old streaks) |
| `paywall_shown` | `PaywallModal` mount + the free-pack "Unlock All" alert (`LibraryScreen`) | `meta.context` `sequential\|paid-pack\|unavailable` · `meta.pack`(s) | 1, 5 funnel tops — **paywall surface only**; Settings emits none (§5.1) |
| `purchase_initiated` | before `adapty.makePurchase` (`payments.ts`) | `meta.kind` `premium\|pack` · `meta.product_id`(s) · `meta.pack`(s) · `meta.source` `paywall\|settings\|archive\|unknown` (premium) | **1, 5** funnel start |
| `purchase_result` | success / catch (`payments.ts`) | `ms` initiated→result · `meta.kind` · `meta.source` · `meta.outcome` `success\|failed\|cancelled\|lag` · `meta.reason`(s) | **1, 5** — the 80% number |

> ⚠️ **`meta.source` is overloaded** — two unrelated meanings on different events: on `hint_load` it's the data origin (`disk\|download\|fallback`); on `purchase_*` it's the funnel surface (`paywall\|settings\|archive\|unknown`). They never collide because every query scopes by `event` (or `meta.kind='premium'`) first — but **always scope before grouping on `source`**, never `group by meta->>'source'` unscoped.

---

## 5. Funnels with named steps (drop-off is the insight)

Each mission funnel is an **ordered set of named steps**; the value is *where users fall out*, not the
endpoint rate. Steps that are physically un-instrumentable are marked **(opaque)** — we name them so the
gap is explicit rather than silently skipped. Queries: `baselines/queries.sql §B` (overall) + `§D` (segmented).

### 5.1 Membership — mission 1 (P0)

Premium can be initiated from **two surfaces**, and only one emits a top-of-funnel event:

```
paywall (PaywallModal) ──→ purchase_initiated ─→ [native sheet] ─→ purchase_result(success)
 ↑ paywall_shown            (kind:premium,        (opaque —          → premium unlocked
   (context:sequential)      source:paywall)       Adapty/StoreKit)
Settings upgrade button ──→ purchase_initiated ─→ …  (source:settings — NO paywall_shown)
 ↑ no event                  (the streak-archive gate routes here via openSettings → §5.3)
```

| Step transition | Metric | Target |
|---|---|---|
| shown → initiated (**paywall surface only**) | intent rate — paywall persuasion | calibrate |
| **initiated → success (all surfaces)** | **completion rate — headline ≥ 80%** | **≥ 80%** |
| initiated split by `source` (`§D.1b`) | paywall vs settings share | sizes the Settings/archive path |
| outcome split | success vs cancelled vs failed vs lag | `cancelled` = user choice, **excluded** from failure rate |

Two opacities, kept honest: **(1)** the Settings surface has **no `paywall_shown`**, so a single
`shown→initiated` across all premium purchases is wrong — split `initiated` by `meta.source` instead
(`§D.1b`); the `shown→initiated` rate is meaningful **only** for the paywall surface. **(2)** the native
sheet is opaque — "sheet dismissed before paying" can't be separated from "cancelled," so cancellation is
bucketed at `purchase_result`; `failed`/`lag` (webhook lag) are the actionable losses (`§B.1a`). The
**initiated→success headline is correct regardless of surface** — both events fire everywhere.

### 5.2 Pack unlock — mission 5 (P2)

```
paywall_shown ─→ purchase_initiated ─→ [native sheet] ─→ purchase_result(success)
 (context:           (kind:pack)         (opaque)          → pack DOWNLOADED & playable
  paid-pack)
```

Pack purchases run entirely through `PaywallModal` (locked-puzzle tap → `setPaywallContext('paid-pack')`),
so unlike membership the `shown` step is real and complete here.

`success` fires only **after** `downloadPack` resolves, so it means *playable offline*, not just *paid*.
Compare this funnel's **volume** against §5.1 to answer mission 5's real question — *is unlocking single
packs a bigger driver than membership?* Segment buyers by `owned_pack_count` to see if pack-buyers later
upgrade to premium.

### 5.3 Streak archive → purchase — mission 2 (P1)

```
streak card ─→ streak_archive_view ─→ streak_archive_gate ─→ openSettings('archive') ─→ purchase_initiated ─→ success
 (reachable;    (DISCOVERY —           (non-premium tapped     (Settings upgrade btn;     (kind:premium,
  no event)      "do they find it")     "upgrade")              no paywall_shown)          source:archive)
```

| Step | Metric | Reads as |
|---|---|---|
| → archive_view | view rate / # viewers | do users **find** the archive |
| view → gate | non-premium share who hit the wall | demand meets the wall |
| **gate → premium (`source:archive`)** | **gate-hit → premium %** | **"users want old streaks" hypothesis** |

**Attribution (exact, 2026-06-19):** the archive "upgrade" button calls `openSettings('archive')`; the
Settings upgrade button reads that (`openReason`) and stamps the purchase as `source:'archive'`, so an
archive-driven premium purchase is **directly identified**, not inferred by correlation. `openReason` is set
on every settings-open (a generic open clears it), so a normal Settings purchase stays `source:'settings'`.
There's still no `paywall_shown` on this path — the **gate is the top-of-funnel event**, and `gate →
purchase_initiated(source:archive)` is the conversion (`§D.1b`).

---

## 6. Engagement & reengagement

| Metric | Source | Reads as | Query |
|---|---|---|---|
| Plays per cadence | `streak_play` by `meta.type` | mission 3 "tries to create a streak" (attempt) | §C.0 |
| Completes per cadence | `streak_recorded` by `meta.type` | mission 3 "completes" (success) | §C.0 |
| **Play → complete ratio** per cadence | both | **are streaks too hard / too easy?** (make easier or harder) | §C.0 |
| Streak length distribution | `streak_recorded.current/best` | how deep streaks go before breaking | §C.3 |
| **Reengagement: active-days/user, streak-holders vs not** | sessions × streak-holder cut (§3) | **mission 3's hardest question — do streaks drive return visits?** | **§D** |
| Pack completion rate + who finishes | `pack_complete` | mission 4 — do they want more? | §C.4 |
| Hint reveals / user, hint-heavy puzzles | `hint_used` | mission 6 — which puzzles are too hard (incl. abandoned ones) | §C.5 |

`hint_used` (per reveal) vs `puzzle_complete.hints_used` (per finished puzzle): the former also captures
puzzles a user **gave up on**, which is exactly where the "too hard" signal hides — use `hint_used`.

---

## 7. Targets

Field targets are **p75 unless noted**. Latency v1 numbers are **proposed — calibrate against the first
real release baseline**, not gospel.

| Metric | Target | Status | Notes |
|---|---|---|---|
| `app_start` launch → first paint | ≤ 1.5s p75 / ≤ 2.5s p95 | re-anchored 2026-06-18 | Now fired at bootsplash-hidden (`navigation.tsx`), not HomeScreen mount — no longer polluted by tutorial dwell. Warm ~115ms. |
| `puzzle_open` tap → board interactive | ≤ 600ms p75 / ≤ 1.2s p95 | unknown | Verify the measurement boundary (scorecard Finding 3: p50 10ms is implausibly fast). |
| `hint_load` from disk | ≤ 150ms p75 | ✓ ~90ms (iOS, seed) | offline path — must stay fast. |
| `hint_load` from download | ≤ 2.0s p75 | unknown | |
| `js_stall` (sessions with any >500ms stall) | ≤ 2% | unknown | watchdog feeds telemetry. |
| `error` event rate | ≤ 0.5% of sessions | unknown | |
| **Membership: initiated → success** | **≥ 80%** | instrumented; awaiting field data | headline #1 (`§5.1` / `queries.sql §B.1`). `cancelled` excluded. |
| Pack unlock: tap → success | calibrate | instrumented; awaiting data | `§5.2` / `queries.sql §B.2` |
| Streak archive: gate-hit → purchase | calibrate | instrumented; awaiting data | `§5.3` / `queries.sql §B.4` |
| Streak reengagement lift (holders vs not) | set after first baseline | instrumented; awaiting data | `queries.sql §D` |
| Golden paths 1–6 reliability | 100% pass each release | Maestro built + `.storekit` | JS gates in CI; Maestro run pending (macOS-CI; sandbox for entitlement). |
| Crash-free sessions | ≥ 99.5% | **— no crash reporting** | `ErrorBoundary.tsx` has a Sentry TODO; nothing wired. |
| JS bundle size | set after first lab run | — no lab harness | `npm run bundle:visualize` exists. |

---

## 8. Scorecard structure

Each cycle copies `baselines/scorecard-template.md` → `baselines/scorecard-YYYY-MM-DD.md` and fills it.
**Every funnel/engagement row is reported overall AND segmented (§3).** Sections, each owned by one tool:

- **A. Field perf** — `queries.sql §A` — `app_start`/`puzzle_open`/`hint_load` p50/p75/p95, `js_stall` session rate, `error` rate.
- **B. Conversion funnels** — `queries.sql §B` — membership, pack-unlock, archive-gate, **as named steps with drop-off (§5)**.
- **C. Engagement** — `queries.sql §C` — plays/completes per cadence, streak distribution, pack completion, hint usage.
- **D. Segmentation & reengagement** — `queries.sql §D` — funnels × {platform, version, free/paid, new/returning}; streak-holder reengagement.
- **E. Golden-path reliability** — Maestro — pass/fail per path × platform.
- **F. Lab perf** — lab script — cold/warm/**offline-cold** start, bundle size, frame jank.
- **G. Offline integrity** — manual + script — airplane-mode play, hints from disk, premium offline (§11).
- **H. Manual UX / a11y sign-off** — human — motion, haptics, VoiceOver, reduced motion, contrast, first-run feel (§11).

---

## 9. Tooling

| Tool | Path | What it does | Status |
|---|---|---|---|
| Field baseline | `baselines/queries.sql` | One SQL block per scorecard section over `perf_events`. `supabase db query --linked < baselines/queries.sql` or the SQL editor. | ✅ |
| CI (JS gates) | `.github/workflows/ci.yml` | `typecheck` + `lint` + `test` on every PR and push to `main` (Linux, no native build). | ✅ added 2026-06-19 |
| E2E flows | `.maestro/*.yaml` | One flow per golden path (`smoke`, `paywall-reach`, `play-complete`, `streak-archive` + `helpers/dismiss-tutorial`). `maestro test .maestro/`. `ios/StarbattleMobile.storekit` drives the purchase sheet in-sim (entitlement still needs sandbox — see `.maestro/README.md`). | ✅ built; Maestro-in-CI pending |
| Lab perf | `baselines/lab/run.sh` | Release build → launch on fixed sim N× → scrape `[SB:STARTUP]`/`[SB:*]` → median cold start. Bundle via `npm run bundle:visualize`. | proposed |
| Offline check | §11 + script | Airplane-mode launch + play; partly Maestro-scriptable (network toggle), partly manual. | manual |

---

## 10. Cadence

Run a full cycle **per release** (and after any change to startup, packs, payments, streaks, or offline):

1. Ship a release/TestFlight build (telemetry only flows from release builds).
2. Let field data accumulate (≥ a few days for funnels to reach N).
3. Run `baselines/queries.sql` → fill A–D. **Report overall + segmented.**
4. Run Maestro on iOS + Android → fill E.
5. Run lab script → F. Run offline checklist → G.
6. Human signs H.
7. Save `baselines/scorecard-YYYY-MM-DD.md`; diff vs previous + targets here. Regressions get a line in `CLAUDE.md` §Debt or an issue.

---

## 11. Offline integrity & manual sign-off

**Offline (mission priority #3 — "offline must be perfect"). Past failures live here as regression guards:**

| Check | Why it's here |
|---|---|
| Cold launch in airplane mode reaches Home without freeze | prefetch flood once froze first launch (fixed — guard it) |
| Hints load from disk offline (no re-download) | Android `readFileText` used `fetch('file://')`, OkHttp rejected it → offline hints broke (fixed — **test on Android specifically**) |
| Downloaded packs fully playable offline | core promise |
| Premium content available offline after purchase | entitlements + prefetch must survive no-network |
| No crash / infinite spinner when network drops mid-session | |

**Manual UX / a11y sign-off (tools can't judge these):**

| Path / Device | Motion right | Haptics | VoiceOver | Reduced motion | Contrast | No jank | First-run feel |
|---|---|---|---|---|---|---|---|
| Home — iOS | | | | | | | |
| Puzzle — iOS | | | | | | | |
| Paywall — iOS | | | | | | | |
| Streak archive — iOS | | | | | | | |
| Home — Android | | | | | | | |
| Puzzle — Android | | | | | | | |

---

## 12. Known gaps (backlog, by leverage)

1. ~~Instrument purchase/streak/pack funnels~~ — **done 2026-06-18** (§4).
2. ~~Per-event segmentation~~ — **done 2026-06-19** (§3): paid status stamped at emit; new/returning + streak-holder derived at query time.
3. ~~Maestro E2E for the golden paths~~ — **built 2026-06-19** (5 flows) + `.storekit` config (`ios/StarbattleMobile.storekit`) drives the purchase sheet in-sim. Open: running Maestro in CI (needs a macOS runner + booted sim), and a sandbox tester to assert *entitlement unlock* (a local StoreKit transaction can't — Adapty server-validates).
4. **Android telemetry is absent** — all field data is iOS (scorecard Finding 4). Until an Android release build reports, every platform split is iOS-only and the Android offline path (§11) is hand-checked only.
5. **Crash reporting (Sentry)** — wire the `ErrorBoundary.tsx` TODO; crash-free % is unknowable without it.
6. **Lab perf harness** — lower priority; field telemetry already gives real-device perf.
7. ~~CI~~ — **JS gates added 2026-06-19** (`.github/workflows/ci.yml`: `typecheck`/`lint`/`test` on every PR + push to `main`). Open: native build + Maestro E2E in CI (need a macOS runner; EAS/fastlane not set up).
8. ~~Purchase source / archive attribution~~ — **done 2026-06-19.** `purchase_initiated/result.meta.source` = `paywall\|settings\|archive\|unknown` splits the membership funnel by surface (§D.1b); the streak-archive gate stamps `source:'archive'` (via `openSettings('archive')` → `openReason`) for exact mission-2 attribution. Optional future: a `paywall_shown`-equivalent render event for the Settings surface if its `shown→initiated` step is ever needed (today Settings has no top-of-funnel event, by design).
