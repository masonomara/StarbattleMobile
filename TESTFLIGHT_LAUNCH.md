# TestFlight Launch Plan

Everything below comes from a full read of `src/`. The goal is to ship a polished build testers feel good in, as fast as possible.

---

## Severity Overview

| #   | Finding                                                                           | Severity | Effort  | Group        |
| --- | --------------------------------------------------------------------------------- | -------- | ------- | ------------ |
| 1   | `usePackPreviews` drops ALL previews if any one pack fails                        | **Bug**  | Small   | Data Loading |
| 2   | `useZoom` isZoomed ignores translation — reset button vanishes                    | **Bug**  | Small   | Zoom/Gesture |
| 3   | `usePackData` catalog race — streak packs load as library packs on cold start     | **Bug**  | Small   | Data Loading |
| 4   | `StreaksModal` streak counts stale while modal is open                            | UX       | Small   | Streak Data  |
| 5   | Production logs leak internal pack paths (`[SB:PACK]`, `[SB:HINTS]`)              | Polish   | Trivial | Logs         |
| 6   | Header height `57` hard-coded in 3 screens independently                          | Debt     | Trivial | Layout       |
| 7   | `RELEASE_DATE` and `getPuzzleIndex` epoch are two separate constants              | Risk     | Trivial | Streak Logic |
| 8   | `sb_premium_599` product ID duplicated across 2 files                             | Risk     | Trivial | Payments     |
| 9   | `winTime` style defined in `WinBanner` but never used                             | Cleanup  | Trivial | Dead Code    |
| 10  | `numColumns` is a pointless alias of `NUM_COLS` in `LibraryScreen`                | Cleanup  | Trivial | Dead Code    |
| 11  | `authTabSegment` style defined in `SettingsModal` but never applied               | Cleanup  | Trivial | Dead Code    |
| 12  | Shadow color inconsistency (`#000000` vs `#25292E` across components)             | Polish   | Trivial | Visual       |
| 13  | `PuzzleCell` not memoized — full LibraryScreen re-render on completion            | Perf     | Small   | Performance  |
| 14  | `checkWin` O(stars × solution) inner loop                                         | Perf     | Small   | Performance  |
| 15  | `saveProgress` and `saveStreak` duplicate upsert logic                            | Debt     | Small   | Duplication  |
| 16  | `formatTime` duplicated between `WinBanner` and `HeaderTimer`                     | Debt     | Trivial | Duplication  |
| 17  | Region border path logic duplicated across `BackgroundCanvas` + `PuzzleThumbnail` | Debt     | Medium  | Duplication  |
| 18  | `SettingsModal` is a 1400-line god component (6 distinct concerns)                | Debt     | Large   | Architecture |
| 19  | `packs/index.ts` mixes fetching, caching, storage, and validation                 | Debt     | Medium  | Architecture |
| 20  | `theme.textSecondary` used as `PaywallModal` sheet background color               | Debt     | Small   | Naming       |

---

## Grouped Findings

### Group A — Data Loading Reliability

_These three issues share the same root cause: async data arriving in an unknown order relative to component mount._

**A1. `usePackPreviews` — one failed pack drops all previews** (`hooks/usePackPreviews.ts:21`)

Inside `Promise.all(packCatalog.map(async pack => { ... }))` there is no per-entry try/catch. If any single pack's fetch throws, `Promise.all` rejects and the outer `load()` call (also uncaught) silently discards every preview that had already resolved. HomeScreen renders with blank thumbnails for every pack.

Fix: add try/catch per entry inside the map:

```ts
await Promise.all(
  packCatalog.map(async pack => {
    try {
      // existing fetch logic
    } catch {
      // skip this pack, keep others
    }
  }),
);
```

**A2. `usePackData` — catalog race on cold start** (`hooks/usePackData.ts:29`)

`usePackData` reads `packCatalog` via `useEntitlementsStore.getState()` inside a `useEffect`. On cold start, the catalog may not have synced yet when the effect first fires — `meta` will be `undefined`, and the pack is treated as a library pack even if it's daily/weekly/monthly. The effect does NOT re-run when the catalog arrives (it only re-runs if `packId`, `puzzleIndex`, or `archiveKey` changes).

Fix: subscribe to the catalog reactively:

```ts
const packCatalog = useEntitlementsStore(s => s.packCatalog);
// add packCatalog to the useEffect dep array
```

**A3. `ArchivePackScreen` navigateToPuzzle fallback** (`screens/ArchivePackScreen.tsx:52`)

When catalog hasn't synced, `catalog.find(p => p.type === type)?.id` is undefined and the code falls back to using the `StreakType` string as the `packId`. `usePackData` won't find this packId in the catalog either, causing a navigation to an unresolvable route.

Fix: the same catalog subscription from A2 fixes this — show a loading state until catalog is available before allowing navigation.

---

### Group B — Zoom & Gesture UX

_One bug, one behavioral edge case — same hook._

**B1. `useZoom` — isZoomed ignores translation** (`hooks/useZoom.ts:115`)

`isZoomed` is only set to `true` when `clampedScale !== DEFAULT_ZOOM`. After a zoom + pan, if the user pinches back to scale 1.0 while the board is still panned off-center, `isZoomed` becomes `false` and the "reset zoom" button in the toolbar disappears — leaving the user unable to re-center the board without another pinch.

Fix:

```ts
runOnJS(setIsZoomed)(
  clampedScale !== DEFAULT_ZOOM ||
    savedTranslateX.value !== 0 ||
    savedTranslateY.value !== 0,
);
```

Also update `handleZoomReset` to call `setIsZoomed(false)` at the end (it already does via `savedScale.value = DEFAULT_ZOOM`, but the translate values are also zeroed there so it's consistent).

---

### Group C — Streak Data Consistency

_Same data source, inconsistent access pattern._

**C1. `StreaksModal` uses one-shot read, not reactive subscription** (`components/StreaksModal.tsx:70`)

HomeScreen uses `useStreakRows()` (PowerSync live watch — updates while visible). StreaksModal uses `loadStreaks()` (one-shot read on open). If a sync arrives while the modal is open (e.g. another device completed a puzzle), the counts stay stale until the modal is closed and reopened.

Fix: replace `loadStreaks()` with `useStreakRows(userId)` from the same hook:

```ts
const userId = useAuthStore(s => s.user?.id);
const streaks = useStreakRows(userId);
```

Remove the `useState<Streak[]>` and the `useEffect` load entirely. The streaks will still load on first render and update reactively.

**C2. `WinBanner` loads streaks imperatively after win** (`components/WinBanner.tsx:37`)

After solving a streak puzzle, `WinBanner` calls `loadStreaks()` to display the current streak count. This is a one-shot read that races with `recordStreak`'s PowerSync write propagating back. The count may show 0 briefly before updating.

Note: this is lower priority than C1. The fix is the same pattern — subscribe via `useStreakRows` from a parent and pass count down.

---

### Group D — Production Log Leaks

_Everything in `packs/index.ts` logs to console unconditionally._

**D1. Pack + hints fetching logs internal file paths and pack structure**

Lines like:

```
[SB:PACK] supabase.storage.from('packs').download('daily.json')
[SB:PACK] daily.json: 412.3 KB, 365 puzzles, keys: sbn,solution,hints
[SB:HINTS] loadPack side-effect: loadPackHints(daily)
```

These appear in production console output. Not a crash risk but a data hygiene / professionalism issue for testers inspecting logs.

Fix: wrap all `console.log` / `console.error` calls in packs/index.ts with `__DEV__`:

```ts
if (__DEV__) console.log(`[SB:PACK] ...`);
```

Or use a `__DEV__ && console.log(...)` pattern. The error logs (catch blocks) can stay unconditional — those are worth seeing in production.

---

### Group E — Layout & Constants

_Three files share a magic number that should be one._

**E1. Header height `57` hard-coded in three places**

- `HomeScreen.tsx:43` — `const HEADER_HEIGHT = 57` (has the const, uses it correctly)
- `LibraryScreen.tsx` — `57 + insets.top` in `createStyles` and `gridContent.paddingTop`
- `ArchivePackScreen.tsx` — same

Fix: create `src/layout.ts`:

```ts
export const SCREEN_HEADER_HEIGHT = 57;
```

Import in all three screens. HomeScreen's local const can be replaced.

---

### Group F — One-Line Risk Fixes

_Small constants or IDs that will silently break something if changed in only one place._

**F1. `streakDate.ts` — epoch duplicated**

`getPuzzleIndex` hardcodes `new Date(2026, 3, 16)` separately from `RELEASE_DATE`. If the epoch ever needs to change, it must be changed in both places or puzzles will show wrong content.

Fix:

```ts
export const RELEASE_DATE = new Date(2026, 3, 16);
// in getPuzzleIndex:
const epoch = RELEASE_DATE;
```

**F2. `payments.ts` + `SettingsModal.tsx` — product ID duplicated**

`'sb_premium_599'` appears in `purchasePremium()` and in `SettingsModal`'s `useProductPrice('sb_premium_599')`. A product rename breaks one silently.

Fix: export from `payments.ts`:

```ts
export const PREMIUM_PRODUCT_ID = 'sb_premium_599';
```

Import in SettingsModal.

**F3. `packs/index.ts` — `drainUploadQueue` grace period unnamed**

The 600ms initial delay before checking the upload queue is a magic number. Name it.

---

### Group G — Dead Code (Trivial Cleanup)

_All removals — no behavior change, reduces noise for testers reading the code._

- `WinBanner.tsx` — `winTime` style defined, never applied. Remove.
- `LibraryScreen.tsx:128` — `const numColumns = NUM_COLS` alias. Replace with `NUM_COLS` directly.
- `SettingsModal.tsx` — `authTabSegment: { height: 36 }` style never referenced. Remove.

---

### Group H — Performance (Post-Launch Backlog)

_None of these will affect TestFlight testers noticeably at current puzzle counts, but document them for later._

**H1. `checkWin` O(stars × solution.length)**

For each placed star, `solution.some(([sr, sc]) => ...)` scans the entire solution array. Pre-compute `new Set(solution.map(([r,c]) => r * size + c))` in `parsePuzzle` and attach it to the `Puzzle` object. `checkWin` becomes O(stars).

**H2. `PuzzleCell` not memoized in `LibraryScreen`**

Every time `completedSet` updates (after solving a puzzle), all `PuzzleCell` rows re-render. `React.memo` with a stable props comparison would limit updates to cells whose completion status or playability actually changed.

**H3. `Text.tsx` — `StyleSheet.flatten` on every render**

`StyleSheet.flatten(style)` is called for every instance of `<Text>` on every render to derive the `letterSpacing`. Precompute a static map of common font sizes (11, 12, 13, 15, 16, 17, 19, 20, 25, 33) → letterSpacing values and do a lookup instead.

**H4. `useCompletionData` — O(N×M) completion counting**

Counts completed puzzles by iterating `pack.puzzleCount` times per pack. Fine for current sizes. Revisit if packs grow to 200+ puzzles.

---

### Group I — Architecture (Post-Launch Backlog)

_These are real maintainability problems but will not affect what testers experience._

**I1. `SettingsModal.tsx` — God Component (1400 lines, 6 concerns)**

Recommended split:

- `components/settings/AccountSection.tsx` — auth forms, sign-out, delete
- `components/settings/SubscriptionSection.tsx` — premium badge, buy, restore, owned packs
- `components/settings/GameplaySection.tsx` — toggle rows
- `components/settings/AppearanceSection.tsx` — theme + palette picker
- `components/settings/PalettePreview.tsx` — the SVG preview grid (~130 lines of module-level setup)
- `components/settings/LegalView.tsx` — WebViews + Acknowledgements

**I2. `packs/index.ts` — Mixed concerns**

Recommended split: `packStorage.ts` (RNFS), `packFetcher.ts` (Supabase + ETag), `packCache.ts` (in-memory Maps), `index.ts` (public API).

**I3. Code duplication to consolidate eventually**

- `saveProgress` + `saveStreak` — shared `upsertById` helper
- `BackgroundCanvas` + `PuzzleThumbnail` — shared `buildRegionBorderPath` / `buildRegionFillPaths` in `src/utils/skiaHelpers.ts`
- `WinBanner.formatTime` + `HeaderTimer` inline format — shared `formatElapsedTime(ms)` in `src/utils/`

**I4. `theme.textSecondary` as `PaywallModal` sheet background**

Semantically incorrect — a text color token used as a surface color. Add a `sheetBackground` token to `Theme` that palettes set explicitly.

**I5. `Theme` mixes color roles with layout tokens**

`spacingMd`, `spacingLg`, `spacingXl`, `radiusMd`, `fontSizeBody`, etc. are in `Theme` but are layout constants that never change per-palette. They belong in `tokens` (exported from `palettes.ts`) and imported directly by components that don't need a color.

---

## Manual Testing Plan

Run these in order. Each test validates a fix group.

### Pre-flight: Build & Install

- [ ] Clean build (`npx react-native run-ios --configuration Release`)
- [ ] Install on a physical device (not simulator — haptics and gesture behavior differ)
- [ ] Sign in with a fresh anonymous account (wipe data or use a new simulator)

---

### Test 1 — Cold-start Pack Loading (Group A)

**What to do:**

1. Kill the app completely
2. Turn on airplane mode
3. Launch the app fresh
4. Observe HomeScreen

**What to look for:**

- Pack thumbnail previews should appear for packs already cached on disk
- Streak pack cards (Daily/Weekly/Monthly) should load with today's puzzle thumbnail
- No blank grey squares where thumbnails should be
- Streak packs should NOT be treated as "library" packs

**Pass criteria:** All thumbnails visible; navigating to a streak puzzle opens the correct daily/weekly/monthly puzzle, not puzzle index 0 of a library pack.

**Failure indicates:** Group A fixes needed (A1 or A2).

---

### Test 2 — Pack Preview Resilience (Group A1)

**What to do:**

1. Sign out and back in
2. While the HomeScreen is loading previews, briefly toggle airplane mode off/on to interrupt exactly one pack fetch

**What to look for:**

- Only the interrupted pack should have a missing thumbnail
- All other packs should display normally

**Pass criteria:** Partial failure (one blank) is acceptable; total failure (all blank) is a bug.

**Failure indicates:** A1 (no per-pack try/catch in usePackPreviews).

---

### Test 3 — Zoom Reset Button (Group B)

**What to do:**

1. Open any puzzle
2. Pinch to zoom in (scale > 1)
3. Pinch back to exactly scale 1.0 while simultaneously panning the board to the side
4. Lift fingers — board should now be at scale 1 but offset
5. Look at the toolbar

**What to look for:**

- The "minimize" (reset zoom) button in the toolbar should still be visible and tappable
- Tapping it should snap the board back to center

**Pass criteria:** Reset button visible whenever board is not in its default position (centered, scale 1).

**Failure indicates:** B1 fix needed (isZoomed only tracks scale, not translation).

---

### Test 4 — Streak Count in Modal (Group C)

**What to do:**

1. Complete today's daily puzzle
2. Immediately open the flame icon → Streaks modal
3. Check the daily streak count tile

**What to look for:**

- The count should reflect the completed puzzle immediately
- Close and reopen the modal — count should be the same

**What to also test:**

- Leave the modal open for 10–15 seconds
- On a second device (or after forcing a sync), complete a puzzle
- Without closing the modal, verify the count updates

**Pass criteria (minimum for TestFlight):** Count correct on open. Reactive update during open is a bonus.

**Failure indicates:** C1 fix needed.

---

### Test 5 — Production Log Check

**What to do:**

1. Connect device to Xcode
2. Open the console
3. Launch the app cold
4. Navigate through several screens

**What to look for:**

- No `[SB:PACK]` or `[SB:HINTS]` lines appearing in a release build
- No internal file paths or pack metadata in logs

**Pass criteria:** Console is clean in release builds. These logs are fine in debug builds.

**Failure indicates:** D1 fix needed (`__DEV__` gating in packs/index.ts).

---

### Test 6 — Settings Modal Smoke Test

**What to do:**

1. Open Settings (user icon on HomeScreen)
2. Scroll through all sections: Account, Gameplay, General, Color Theme
3. Toggle every setting on and off; verify the puzzle board updates live (colored regions, auto-X, etc.)
4. Change the color palette and theme (light/dark/system) — verify the whole app updates
5. Open Terms, Privacy, Acknowledgements sub-views
6. Close and reopen Settings

**What to look for:**

- No crashes
- No stale state when reopening (scrolled to the right section, no lingering email inputs from a previous session)
- Palette previews render correctly for all 6 themes

**Pass criteria:** All settings functional, no crashes, modal dismisses cleanly.

---

### Test 7 — Full Puzzle Flow

**What to do:**

1. Open a streak pack
2. Solve the puzzle completely
3. Verify the win banner appears with the correct solve time and streak count
4. Tap "Back to Home"
5. Verify the streak card on HomeScreen shows a checkmark and updated label

**Also test:**

- Open a library pack from the Puzzle Library section
- Tap a locked puzzle (shows paywall or sequential-lock message)
- Complete puzzle #1; verify puzzle #2 becomes available

**Pass criteria:** Win banner animates in, streak count correct, navigation back works, library lock/unlock is correct.

---

### Test 8 — Auth Flows

**What to do:**

1. Sign up with email (new account)
2. Sign out
3. Sign back in with the same email
4. Sign in with Google (if on a device with Google account)
5. Sign in with Apple (iOS only)
6. Test "Forgot Password" — confirm email arrives and link works
7. Test "Delete Account" — confirm the warning and follow through

**What to look for:**

- No crashes on any auth path
- After sign-in, progress and streaks from the anonymous session should be merged and visible

**Pass criteria:** All auth paths complete without error; data migration visible after sign-in.

---

### Test 9 — Purchase Flow (Sandbox)

**What to do:**

1. Use a Sandbox Apple ID
2. Open Settings → Subscription
3. Tap "Buy Premium"
4. Complete the Sandbox purchase
5. Verify premium badge appears and all packs unlock
6. Sign out and back in — verify premium status persists

**Also test:**

- Tap "Restore Purchases" with the same Sandbox account after reinstalling

**Pass criteria:** Purchase succeeds, premium unlocks immediately, persists across sessions.

---

### Test 10 — Regression Smoke

**What to do:**

1. Open the archive (flame icon → any archive pack — requires premium)
2. Play an archived puzzle
3. Back out — verify the archive list still shows the completed checkmark
4. Swipe through all three streak cards on HomeScreen
5. Open Library → verify puzzle count "X/Y" is correct

**Pass criteria:** No regressions in navigation or data display.

---

## Priority Order for TestFlight Launch

### Fix now (before build)

| Order | Fix                                                      | File                                          | Effort |
| ----- | -------------------------------------------------------- | --------------------------------------------- | ------ |
| 1     | A1 — per-pack try/catch in `usePackPreviews`             | `hooks/usePackPreviews.ts`                    | 10 min |
| 2     | B1 — isZoomed tracks translation too                     | `hooks/useZoom.ts`                            | 15 min |
| 3     | A2 — `usePackData` subscribe to catalog reactively       | `hooks/usePackData.ts`                        | 20 min |
| 4     | C1 — `StreaksModal` → `useStreakRows`                    | `components/StreaksModal.tsx`                 | 20 min |
| 5     | D1 — Gate `[SB:PACK]`/`[SB:HINTS]` logs behind `__DEV__` | `packs/index.ts`                              | 15 min |
| 6     | F1 — Unify `RELEASE_DATE` / epoch                        | `utils/streakDate.ts`                         | 5 min  |
| 7     | F2 — Export `PREMIUM_PRODUCT_ID`                         | `utils/payments.ts`, `SettingsModal`          | 5 min  |
| 8     | G — Remove dead styles + alias                           | `WinBanner`, `LibraryScreen`, `SettingsModal` | 10 min |

**Estimated total: ~1.5 hours**

### Fix before wide distribution (but ok for initial testers)

| Order | Fix                                         | File                                 | Effort |
| ----- | ------------------------------------------- | ------------------------------------ | ------ |
| 9     | E1 — Shared `SCREEN_HEADER_HEIGHT` constant | 3 files                              | 10 min |
| 10    | H2 — `PuzzleCell` React.memo                | `screens/LibraryScreen.tsx`          | 15 min |
| 11    | H1 — `checkWin` Set optimization            | `utils/puzzleLogic.ts`, `types.ts`   | 30 min |
| 12    | F3 — Name the 600ms grace period constant   | `stores/authStore.ts`                | 5 min  |
| 13    | H3 — `formatTime` shared utility            | `utils/`, `WinBanner`, `HeaderTimer` | 10 min |

---

## Backlog (Post-TestFlight)

These are real problems but do not affect what testers experience in TestFlight.

### Architecture

- [ ] Split `SettingsModal.tsx` into section components (I1) — biggest maintenance win
- [ ] Split `packs/index.ts` into storage / fetcher / cache / public API (I2)
- [ ] Extract `PalettePreview` to its own file

### Naming / Types

- [ ] `Theme`: separate color roles from layout tokens (I5)
- [ ] `effectivePackId`: discriminated union in `PackData` type
- [ ] `PaywallModal` sheet background: add `sheetBackground` token to `Theme` (I4)
- [ ] `fontWeight` numeric → string literals in `WinBanner` (safety with strict TS)
- [ ] Shadow color: standardise `#000000` vs `#25292E` across `CircleButton`, `Toolbar`, `WinBanner`

### Duplication

- [ ] `saveProgress` + `saveStreak` → shared `upsertById` helper
- [ ] `BackgroundCanvas` + `PuzzleThumbnail` region path logic → `src/utils/skiaHelpers.ts`

### Performance

- [ ] `Text.tsx` StyleSheet.flatten: precompute letterSpacing lookup table
- [ ] `useCompletionData`: prefix-filter approach for large pack counts

### Future-proofing

- [ ] `packCache` in-memory: consider a TTL or explicit invalidation strategy for when pack content changes server-side without a version bump
- [ ] `rgba()` in `themes/ansi.ts`: guard against shorthand hex (`#rgb`)
- [ ] Add crash reporting (ErrorBoundary has a `// TODO: forward to Sentry` comment already)
- [ ] `drainUploadQueue`: expose the timeout as a parameter with a named constant, not a magic number
