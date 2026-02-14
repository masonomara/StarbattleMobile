# Research Report: StarbattleMobile

Deep read of `docs/` and project state. Everything below is what the plan says, what's built, what's not, and where the risks are.

---

## What This Project Is

A React Native Star Battle puzzle app targeting mastery-seeking puzzle players. The competitive angle: a production-rule solver that generates difficulty-calibrated puzzles with pre-computed hints. No other Star Battle app does this. Queens (LinkedIn) and Two Not Touch (NYT) are casual-only; Hoshi (59K downloads) has no hint system worth mentioning.

The solver is the moat. Everything else is packaging.

---

## What's Built

### Solver Engine (Complete)

- 38 production rules across 11 difficulty levels
- 999/1000 solve rate on Krazydad's 10x10 2-star corpus
- Deterministic generation via seeded RNG
- CLI with batch solving, tracing, difficulty filtering
- Lives in `/sieve/`, has its own `package.json` and test suite (vitest)

### Puzzle Packs (Complete)

- 5 pre-generated packs in `/packs/`: intro, 1star-5x5, 1star-6x6, 1star-8x8, 2star-10x10
- Missing: `3star-14x14` pack (mentioned in specs but not generated)
- Missing: daily/weekly/monthly pre-generated puzzles

### React Native Scaffold (Minimal)

- RN 0.84.0, React 19.2.3
- React Navigation installed but not wired up
- `App.tsx` is the stock NewAppScreen template
- `/src/` is empty
- Branch: `feature-boardRender`

---

## What's Not Built (Everything Else)

Grouped by BUILD_ORDER phases:

### Phase 0: Content Pipeline

- Pack generation script (exists as `pack-gen.ts` in sieve, but no daily/weekly/monthly generation)
- Year's worth of daily puzzles
- Repo hygiene: `package.json`/`tsconfig.json` were gitignored (noted as needing fix), difficulty formula produces values beyond claimed 1-10 range

### Phase 1: Playable Game

- Board renderer (grid, regions, stars, marks) -- the current branch target
- Tap-to-cycle input (empty -> star -> X -> empty) with haptics
- Puzzle selection screen
- Win detection + celebration
- Undo/redo
- Hint button (reads pre-computed HintStep metadata, shows faded marks)
- Auto-X toggle
- Light/dark theme
- Timer with persistence
- Local storage via MMKV

### Phase 2: Retention

- Daily puzzle delivery
- Streak tracking (daily/weekly/monthly, UTC-based, no grace period)
- Pack progression tracking
- Error highlighting toggle
- Privacy policy

### Phase 3: Monetization

- Terms of service
- Unlock-all IAP via RevenueCat (single entitlement: `unlock_all`)
- App Store submission

### Phase 4: Cloud (conditional -- only if Phases 1-3 prove out)

- Cloudflare Worker + D1 database
- BetterAuth (factory pattern, PBKDF2, cookie sessions, Google + Apple OAuth)
- Cloud sync (last-write-wins, debounced, offline queue in MMKV)
- R2 puzzle storage for paid packs
- RevenueCat webhook with HMAC verification
- Account deletion endpoint (GDPR/CCPA)

---

## Architecture Decisions (Locked)

| Decision                  | Choice                                            | Rationale                                    |
| ------------------------- | ------------------------------------------------- | -------------------------------------------- |
| Framework                 | React Native (bare, not Expo)                     | Already scaffolded                           |
| Local storage             | MMKV                                              | Fast, crash-safe for puzzle state            |
| State model               | Local-first, cloud optional                       | Offline play is non-negotiable for puzzles   |
| Hints                     | Free, unlimited, pre-computed                     | No solver on device, no server cost, instant |
| Auth                      | Anonymous by default, optional account            | No server records until user opts in         |
| Backend                   | Cloudflare Workers + D1 + R2                      | Cheap, auto-scaling, lightweight             |
| Monetization              | One-time unlock-all (v1), paid packs (post-v1)    | No ads, no subscriptions                     |
| Puzzle delivery (v1)      | Bundled in binary (~444KB for 6 packs with hints) | Works offline on first launch                |
| Puzzle delivery (post-v1) | R2 with version-based cache invalidation          | OTA pack updates                             |
| Streaks                   | UTC, no grace period                              | Miss a day, reset                            |

---

## The Solver: Technical Details

### Rule Hierarchy (11 Levels)

| Level | Category                 | Rule Count | What It Does                                                   |
| ----- | ------------------------ | :--------: | -------------------------------------------------------------- |
| 1     | Star Neighbors           |     1      | Mark cells adjacent to placed stars                            |
| 2-3   | Forced/Trivial           |     6      | Place stars when unknowns = needed; mark when container full   |
| 4     | Tiling Enumeration       |     5      | Enumerate valid star arrangements in containers, force/exclude |
| 5     | Counting Enumeration     |     2      | Distribution counting across region intersections              |
| 6     | Tiling Pairs             |     6      | Combine tiling constraints across container pairs              |
| 7     | Tiling Counting          |     6      | Merge tiling + counting techniques                             |
| 8     | Direct Hypotheticals     |     3      | "If star here, does container run out of room?"                |
| 9     | Tiling Hypotheticals     |     3      | "If star here, does tiling break?"                             |
| 10    | Counting Hypotheticals   |     2      | "If star here, does counting fail?"                            |
| 11    | Propagated Hypotheticals |     8      | Chain hypothesis through multiple techniques                   |

### Solve Performance

- 1000 Krazydad puzzles: 22s total, 999 solved
- 8x8 1-star generation: ~1.5s per batch of 10
- 10x10 2-star generation: ~15-60s per batch of 10
- 14x14 3-star generation: historically failed (likely fixed with later rules)

### Krazydad Comparison (Critical Data)

Krazydad solves 100% through pure deduction. Our solver gets stuck on ~19% of their puzzles (189/1000 at 81%, improved to 999/1000 after rule additions). The gap was caused by 6 missing techniques:

| Missing Technique              | % of Stuck Puzzles | Status                 |
| ------------------------------ | :----------------: | ---------------------- |
| Container cabal                |        47%         | Unknown if implemented |
| Multi-line crowding            |        36%         | Unknown if implemented |
| Subclump-occupies-line         |         8%         | Unknown if implemented |
| Subclump-occupies-line (multi) |         3%         | Unknown if implemented |
| At-most-N tuplet               |         1%         | Unknown if implemented |
| Multi-container singleton      |         1%         | Unknown if implemented |

The solver comparison doc (`solver-comparison.md`) shows the 81% era. The BUILD_ORDER doc claims 999/1000. The changelog (`changelog.md`) mentions getting down to 14 unsolvable puzzles. The exact current state of which techniques filled the gap isn't explicitly documented.

---

## Type System

All types are in `GEN-types.md`. Key structures:

### Puzzle Data (Build Output)

```
BundledPuzzle { sbn, solution: Coord[], hints: HintStep[] }
PackFile { id, name, version, free, gridSize, stars, puzzles: BundledPuzzle[] }
HintStep { rule, level, placements: Coord[], marks: Coord[] }
```

### App State (Runtime)

```
PuzzleProgress { puzzle_id, cells: EncodedCells, time_ms, completed, hints_used, current_hint_index, updated_at }
UserSettings { auto_x, highlight_errors, show_timer, theme, streaks..., updated_at }
SyncPayload { settings?, progress?, packProgress? }
```

### Cell Encoding

Flattened array: `[0,0,1,2,0,...]` where 0=unknown, 1=star, 2=marked. ~200 bytes for a 10x10 grid.

### Puzzle IDs

- Library: `{packId}:{index}` (e.g., `1star-5x5:12`)
- Daily: `daily:2025-01-30`
- Weekly: `weekly:2025-05`
- Monthly: `monthly:2025-01`

---

## Database Schema (D1)

5 tables total:

- `users` -- UUID primary key, optional email
- `puzzle_progress` -- per-user per-puzzle, composite key `(user_id, puzzle_id)`
- `user_settings` -- gameplay + app + streak settings
- `pack_progress` -- sequential unlock tracking per pack
- `purchases` -- `unlock_all` flag (synced from RevenueCat)

BetterAuth adds 4 more tables it manages: `user`, `session`, `account`, `verification`.

---

## Auth Design

Follows the same architecture as the developer's existing project [Docket](https://github.com/masonomara/docket):

- BetterAuth with Drizzle adapter on Cloudflare Workers
- Factory pattern (`getAuth(env)`) per-request (Workers requirement)
- PBKDF2-SHA256 100K iterations (Workers lack bcrypt)
- Cookie-based sessions (not JWT)
- Google + Apple social login
- Resend for email verification + password reset
- `withAuth(handler)` wrapper pattern (no middleware)
- Multi-step auth UI: enter email -> check-email endpoint -> branch to signup/signin/social

Key difference from Docket: anonymous users are purely local. No server record until account creation.

---

## Hint System Design

Core insight: the solver's step-by-step output IS the hint data. Pre-compute at build time, ship as metadata.

Flow:

1. Build-time: solver runs with step tracing, each cycle produces a `HintStep`
2. Runtime: user taps hint, app finds first unresolved `HintStep`, shows faded star/mark
3. Display: template-based explanation mapped from rule name (42 templates, one per rule)
4. User must tap to confirm the hint (marks aren't auto-applied)

No solver on device. No server call. No AI. Free and unlimited.

---

## Cut List (Explicitly Not Happening)

- Weekly/monthly challenges (daily is enough for v1)
- Midnight theme (light/dark covers it)
- A/B testing infrastructure (no traffic to test)
- Color highlighter tool
- Sequential puzzle unlocking (slows down power users)
- Leaderboards
- Paid puzzle packs (post-v1)

---

## Risks and Open Questions

1. **14x14+ generation reliability**: Performance notes show 14x14 3-star generation historically failed. If the solver improvements fixed this, it's not documented. Daily (17x17 4-star), weekly (21x21 5-star), and monthly (25x25 6-star) puzzles depend on this working.

2. **Solver gap between 81% and 99.9%**: The docs tell two stories -- `solver-comparison.md` shows 81.1% (189 stuck) with a clear roadmap of 6 missing techniques. `BUILD_ORDER.md` claims 999/1000. The changelog mentions 14 remaining unsolved. Exactly which techniques were added to bridge this gap isn't fully documented. The rule count went from ~14 to 38.

3. **Pack completeness**: Only 5 of 6 free packs exist. The `3star-14x14` pack is missing. No daily/weekly/monthly pre-generation has happened.

4. **Hint metadata**: The `BundledPuzzle` type includes `hints: HintStep[]`, but the existing pack files in `/packs/` may or may not include this data (depends on when `pack-gen.ts` was last run relative to the hint system being built).

5. **React Native bare vs Expo**: BUILD_ORDER says "pick one and commit." The scaffold uses bare RN. This is fine but means manual native module linking for things like haptics, MMKV, and RevenueCat.

6. **Daily puzzle validation**: BUILD_ORDER explicitly warns that every daily must be solver-validated because the solver fails 1/1000. A broken daily with streaks will lose users.

7. **SBN difficulty range**: The spec claims difficulty 1-10, but the formula can produce values beyond 10 (it's capped with `min(10, ...)`). The comments in the rule index say levels 1-10 but actual values go to 11. This discrepancy is noted as needing cleanup.

---

## Competitor Landscape

Three competitors analyzed:

- **johnhsrao/star-battle-puzzle**: Clean web UI, no solver (validation only), pedagogical
- **StarBattleLab**: Polished web app with themes, uses backtracking (not production rules), no difficulty scoring
- **gjohnhazel/StarBattleSolver**: Hint-focused teaching tool, ~10 pattern rules, no generation

Common thread: everyone else either uses backtracking (guessing) or has shallow rule sets. Nobody has difficulty-calibrated generation with human-solvable guarantees. The solver is the genuine competitive advantage.

---

## Summary

The hard part (solver) is done. The current work is Phase 1: making it playable. The branch name (`feature-boardRender`) matches BUILD_ORDER step 5 -- the board renderer is the next thing to build. Everything after that is UI work, storage plumbing, and store submission. The architecture is well-specified and the decisions are locked. The main execution risk is content pipeline completeness (larger grid sizes, daily generation, hint metadata bundling).
