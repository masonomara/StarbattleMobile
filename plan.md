# Refactor Plan

Four phases. Each phase leaves the app in a buildable, working state. Changes within a phase are listed in dependency order.

---

## Phase 1 — Bugs and Dead Code

Fast fixes. No architectural changes. Gets the app correct before restructuring.

### 1.1 Fix duplicate settings button

**File:** `src/screens/PuzzleScreen.tsx:122-134`
Remove the second `<Pressable>` in `renderHeaderRight`. Keep one.

### 1.2 Fix WinBanner puzzle number off-by-one

**File:** `src/components/WinBanner.tsx:68`
Change `#{puzzleIndex}` to `#{puzzleIndex + 1}`.

### 1.3 Fix hardcoded header tint for dark mode

**File:** `src/navigation.tsx:37-43`
Remove the hardcoded `headerTintColor: '#000000'` from Puzzle screen options. The tint color needs to come from the theme. Since `screenOptions` doesn't have access to hooks, set `headerTintColor` dynamically inside `PuzzleScreen` via `navigation.setOptions` where `useTheme()` is already available. Also delete the commented-out `// headerTransparent: true` line.

### 1.4 Fix undo allowed after win

**File:** `src/store.ts:481`
Add `if (completed) return;` guard at the top of `undo()`, matching what `redo()` already does at line 527.

### 1.5 Fix `completedAt` overwrite

**File:** `src/store.ts:663-676`

Only set `completedAt` when `justCompleted` is true. On all other saves, leave it `undefined` so the existing stored value isn't overwritten. The simpler approach — no extra storage reads needed:

```ts
completedAt: justCompleted ? Date.now() : undefined,
```

Then update `saveProgress` in `storage.ts` to merge instead of replace: if the incoming `completedAt` is `undefined` and the stored value has one, keep the stored value. This isolates the fix to one place and every caller stays simple.

### 1.6 Fix `applyDrawStroke` stale error computation

**File:** `src/store.ts:581-613`
The function reads `cells` at the top but the draw gesture has already mutated cells via direct `setState`. Fix: read cells from the current store state inside the `set()` callback, or call `get()` again before computing errors.

### 1.7 Clean up dead exports

- `src/packs.ts` — delete `getPuzzle` (unused, no clear consumer)
- `src/haptics.ts` — keep `hapticMedium`. Wire it to toolbar button presses (undo, redo, clear, mode cycle) to differentiate them from cell taps which use `hapticLight`. This gives the toolbar a heavier tactile feel.

### 1.8 Fix board outline

**File:** `src/components/RegionBordersSvg.tsx:64`

The board's outer edge segments are drawn by `buildSegments` at `REGION_BORDER_WIDTH` (3px), same as internal region borders. But because the segments sit exactly at the SVG boundary, half the stroke (1.5px) gets clipped — making the outer border look thinner than internal borders. The invalid `outlineWidth: 1.5` style was a failed attempt to fix this.

**Fix:** Remove `outlineWidth: 1.5` from the Svg style. Add `overflow="visible"` to the `<Svg>` element so edge strokes paint outside the viewbox without clipping. This makes the outer border visually match `REGION_BORDER_WIDTH`.

### 1.9 Move `RootStackParams` to types

**File:** `src/navigation.tsx:8-12` → `src/types/navigation.ts`
Create `src/types/navigation.ts` with the `RootStackParams` type. Update imports in `navigation.tsx`, `HomeScreen.tsx`, `PackScreen.tsx`, `PuzzleScreen.tsx`, `WinBanner.tsx`.

### 1.10 Fix draw gesture firing during pinch

**File:** `src/hooks/useDrawGesture.ts:101`

When two fingers touch the board for a pinch-to-zoom, the draw gesture can activate if one finger lands slightly before the other (>100ms apart, beating the `activateAfterLongPress` threshold). Add `.maxPointers(1)` to the draw gesture Pan so it only recognizes single-finger input:

```ts
const drawGesture = Gesture.Pan()
  .maxPointers(1)
  .activateAfterLongPress(100)
  .minDistance(0);
```

This prevents the draw gesture from ever activating when two fingers are on screen.

### 1.11 Fix win detection only checking on star placement

**File:** `src/store.ts:413`

Currently: `const won = next === 1 && checkWin(...)`. The `next === 1` guard means win is only evaluated when placing a star. This misses edge cases — e.g. if a star placement triggers auto-marks that change the board, or if any unexpected cell transition leaves the board in a solved state without the check running.

**Fix:** Remove the `next === 1` guard. Check win on every cell change:

```ts
const won = checkWin(newCells, boardSize, puzzle);
```

The cost is negligible (iterating ~100 cells). Simpler and more robust — the board is either solved or it isn't, regardless of what action got it there.

### 1.12 Fix auto-marks not updating when settings toggle

**Files:** `src/components/SettingsModal.tsx`, `src/store.ts`

When a user toggles Auto-X Neighbors/Rows/Regions ON, marks should appear immediately on the board for any existing stars. When toggled OFF, the auto-placed marks should be removed immediately. Currently neither happens because `recomputeAutoMarks` is never called.

**Fix:** In `SettingsModal`, after `updateSettings` is called for any auto-X setting, call `usePuzzleStore.getState().recomputeAutoMarks()`. The existing `recomputeAutoMarks` action already handles both cases — it clears all auto-marks and rebuilds from current settings, so toggling OFF removes marks and toggling ON adds them.

This is a Phase 1 fix (user-facing bug). The later Phase 3.4 item about wiring this up is now handled here and can be removed.

---

## Phase 2 — Remove Over-Engineering

Strip systems that don't serve the prototype. Reduces total code and simplifies what Phase 3 has to refactor.

### 2.1 Remove auth/migration infrastructure

Delete and rebuild when real requirements arrive. The current implementation guesses at patterns (key prefixing, anonymous-to-authenticated migration, manual data copying) that may not match the actual auth provider or sync strategy. Keeping dead abstractions adds confusion for anyone reading the code now and constrains future design. A clean storage layer is easier to extend than a speculative one.

**Delete from `src/storage.ts`:**

- `userId` module variable and `setUserId`, `getUserId`
- `migrateUserData`, `deleteUserData`
- Remove `${userId}:` prefix from all KEYS — hardcode a single namespace (e.g. `sb:`)

**Delete from `src/stores/userStore.ts`:**

- `switchUser`, `migrateFromAnonymous` actions
- `UserProfile` usage — remove `profile` from state entirely

**Delete from `src/types/state.ts`:**

- `UserProfile` type

**Result:** Storage keys become `sb:settings`, `sb:progress:{puzzleId}`, `sb:packProgress:{packId}`. No user switching. No migration. ~80 lines removed.

**Data continuity:** Right now `userId` is always `'local'` (nothing ever calls `setUserId`), so every key in MMKV is prefixed `local:`. Changing the prefix to `sb:` means existing saved data under `local:` keys becomes orphaned — users lose their progress. To avoid this, either: (a) keep the prefix as `local:` instead of `sb:` so existing keys still match, or (b) run a one-time migration on app launch that copies `local:*` keys to `sb:*` keys and deletes the old ones. Option (a) is simpler and has zero risk — just hardcode `'local'` directly in KEYS instead of referencing a variable. The key format doesn't matter for a future auth system since that will need its own migration regardless.

### 2.2 Remove `PackProgress` cache

The completed count can be computed from individual puzzle progress entries. With 5 packs and <200 puzzles, this is instant.

**`src/storage.ts`:**

- Delete `getPackProgress`, `savePackProgress`
- Keep `computeCompletedCount` (renamed to just count completed puzzles)

**`src/stores/userStore.ts`:**

- Remove `packProgress` from state
- Remove `refreshPackProgress`, `incrementPackCompleted` actions
- Add a `getCompletedCount(packId: string, total: number): number` method that calls `computeCompletedCount` directly
- Simplify `initialize` — it no longer needs to build or cache pack progress

**`src/types/state.ts`:**

- Delete `PackProgress` type

**`src/store.ts` (`persistProgress`):**

- Remove `incrementPackCompleted` call — pack counts are computed on read, not maintained on write

**`src/screens/HomeScreen.tsx`:**

- Instead of subscribing to `packProgress`, call `computeCompletedCount` (via store helper) when rendering each pack card

### 2.3 Collapse three auto-mark sets into one

The three sets (`autoMarksNeighbors`, `autoMarksRowsCols`, `autoMarksRegions`) exist so each feature toggle can be independently tracked. But `rebuildAutoMarks` already clears all and recomputes from scratch using current settings. A single `autoMarks: Set<number>` is sufficient — `rebuildAutoMarks` naturally respects which toggles are on.

**`src/types/state.ts`:**

- Delete `prevAutoMarksNeighbors`, `prevAutoMarksRowsCols`, `prevAutoMarksRegions` from `Move`
- Replace with single `prevAutoMarks: number[]`
- Delete `autoMarksNeighbors`, `autoMarksRowsCols`, `autoMarksRegions` from `RedoEntry`
- Replace with single `autoMarks: number[]`

**`src/store.ts`:**

- Replace three `autoMarks*` state fields with single `autoMarks: Set<number>`
- Simplify `computeAutoXForStar` to return a flat `number[]` instead of three named arrays
- Simplify `applyMarks`, `clearAllAutoMarks`, `rebuildAutoMarks` to use one set
- Every `set()` call that spreads three prev arrays now spreads one
- `loadPuzzle` restores one set from saved progress
- Undo/redo snapshot and restore one array instead of three

**`src/storage.ts` / `src/types/state.ts` (Progress type):**

- Replace `autoMarksNeighbors?`, `autoMarksRowsCols?`, `autoMarksRegions?` in `Progress` with single `autoMarks?: number[]`

**Migration note:** Existing saved progress with old field names will have `autoMarks` as `undefined`. The `loadPuzzle` fallback `?? []` handles this — old saves just lose their auto-marks, which get recomputed on the next star placement.

### 2.4 Inline `UserProvider`

**Delete:** `src/components/UserProvider.tsx`
**File:** `App.tsx`
Call `useUserStore.getState().initialize()` at the top level of `App` via `useEffect`, or call it synchronously before the component tree mounts (since it's just reading from MMKV, which is synchronous). Remove the `<UserProvider>` wrapper.

---

## Phase 3 — Refactor `store.ts`

Break the 680-line god module into focused pieces.

### 3.1 Extract puzzle logic into pure functions

**Create:** `src/utils/puzzleLogic.ts`

Move these existing free functions out of `store.ts`:

- `collectZoneMarks`
- `computeAutoXForStar` (simplified from Phase 2.3)
- `applyMarks`
- `clearAutoMarks` (simplified from Phase 2.3)
- `rebuildAutoMarks` (simplified from Phase 2.3)
- `computeErrors`
- `checkWin`

These are already pure functions that take cells/puzzle/settings and return results. No store dependency. Easy to test.

### 3.2 Extract persistence

**Create:** `src/utils/persistProgress.ts`

Move `persistProgress` out of `store.ts`. It imports from both stores, so it belongs in a utility that coordinates between them. Signature:

```ts
export function persistProgress(
  puzzleState: PuzzleState,
  justCompleted: boolean,
): void;
```

Fix the `completedAt` bug (1.5) here during extraction.

### 3.3 Simplify the store

**File:** `src/store.ts`

After extraction, the store contains only state + actions that call the extracted functions. Each action becomes a thin coordinator:

- `tapCell`: compute next value → apply auto-marks → set state → check win → persist
- `undo`: pop move → restore cells and auto-marks → set state → persist
- `redo`: pop redo entry → apply forward → set state → persist
- `applyDrawStroke`: record move → set state → persist
- `clearBoard`: zero all cells → set state → persist
- `tick`: increment timer

Target: ~200 lines for the store itself.

### 3.4 Fix completion delay when navigating back to PackScreen

PackScreen subscribes to `useUserStore(s => s.getProgress)` — a function reference that never changes. So Zustand never triggers a re-render when progress updates. The only thing forcing a refresh is the `focusCount` hack, which fires via `useFocusEffect` AFTER the navigation animation completes, causing a visible delay where the just-completed puzzle still looks incomplete.

**Fix:** Stop subscribing to `s.getProgress` (a function that never changes). Instead, have PackScreen call `getProgress` directly from MMKV via `useUserStore.getState().getProgress(puzzleId)` inside `renderPuzzle`. To trigger re-renders, keep the existing `useFocusEffect` pattern (which already works for this screen) until Phase 4.3 replaces it with a proper `extraData` value. No new state fields needed.

---

## Phase 4 — Component Cleanup

### 4.1 Fix timer re-render cascade

**File:** `src/screens/PuzzleScreen.tsx`

Extract `HeaderTimer` as a small component that subscribes to `timeMs` and `completed` on its own. PuzzleScreen passes it to `headerTitle` once via `navigation.setOptions`. The timer re-renders itself every second without re-rendering PuzzleScreen.

Remove `timeMs` and `showTimer` subscriptions from PuzzleScreen.

### 4.2 Memoize BoardView cell indices

**File:** `src/components/BoardView.tsx:23-26`

Replace the loop with `useMemo`:

```ts
const cells = useMemo(
  () => Array.from({ length: puzzle.size * puzzle.size }, (_, i) => i),
  [puzzle.size],
);
```

### 4.3 Remove `focusCount` hack from HomeScreen and PackScreen

**Files:** `src/screens/HomeScreen.tsx:28-33`, `src/screens/PackScreen.tsx:28-33`

After Phase 2.2, pack progress is computed fresh on every render. After Phase 3.4, PackScreen reads progress directly from MMKV. The `focusCount` hack can be replaced with a lighter approach.

Delete the `focusCount` state and `useState` import from both screens. Keep `useFocusEffect` but use it to set a simple `extraData` timestamp that tells FlatList to re-render its items when the screen regains focus. This is a one-liner per screen and doesn't require new store infrastructure.

### 4.4 Extract FlatList renderItem functions

**File:** `src/screens/HomeScreen.tsx`
Wrap `renderPack` in `useCallback` with deps on `theme`, `navigation`.

**File:** `src/screens/PackScreen.tsx`
Wrap `renderPuzzle` in `useCallback` with deps on `packId`, `theme`, `navigation`. Or extract to a `PuzzleCell` component that handles its own store subscription.

### 4.5 Clean up WinBanner magic numbers

**File:** `src/components/WinBanner.tsx:87-127`

Replace hardcoded values with constants from `utils/constants.ts`. Add any missing tokens there. The `bottom: -160` / `marginBottom: 160` pattern is fragile — replace with a layout approach that doesn't depend on matching magic numbers (e.g., position the banner off-screen by its own measured height, which the component already captures in `bannerHeight`).

### 4.6 Extract puzzleId parsing utility

**Create:** small helper in `src/utils/puzzleId.ts`

```ts
export function parsePuzzleId(id: string): { packId: string; index: number } {
  const [packId, idx] = id.split(':');
  return { packId, index: Number(idx) };
}

export function makePuzzleId(packId: string, index: number): string {
  return `${packId}:${index}`;
}
```

Replace string splitting in `WinBanner.tsx:20-21`, `store.ts:persistProgress`, and `PuzzleScreen.tsx:82`.

---

## Final File Structure After Refactor

```txt
src/
  types/
    puzzle.ts          — Coord, RawPuzzle, Puzzle, Pack
    state.ts           — CellValue, TapMode, Progress, UserSettings, CellChange, Move, RedoEntry
    navigation.ts      — RootStackParams
  utils/
    constants.ts       — spacing, sizing, zoom limits, shadows
    formatTime.ts      — time formatter
    parsePuzzle.ts     — SBN parser
    puzzleLogic.ts     — auto-marks, error checking, win detection (NEW)
    persistProgress.ts — cross-store save (NEW)
    puzzleId.ts        — ID parse/build helpers (NEW)
    useTheme.ts        — theme hook + light/dark palettes
  hooks/
    useZoom.ts         — pinch/pan gesture + zoom state
    useDrawGesture.ts  — long-press draw gesture
  stores/
    userStore.ts       — settings + progress reads/writes (simplified)
  store.ts             — puzzle state + actions (~200 lines, down from ~680)
  storage.ts           — MMKV wrapper (simplified, no user prefixing)
  packs.ts             — static pack imports
  haptics.ts           — haptic triggers
  navigation.tsx       — stack navigator
  screens/
    HomeScreen.tsx
    PackScreen.tsx
    PuzzleScreen.tsx
  components/
    BoardView.tsx
    CellView.tsx
    CellGridSvg.tsx
    RegionBordersSvg.tsx
    Toolbar.tsx
    SettingsModal.tsx
    WinBanner.tsx
    HeaderTimer.tsx    — isolated timer display (NEW)
    icons/
      StarIcon.tsx
      MarkIcon.tsx
```

**Deleted files:** `src/components/UserProvider.tsx`

---

## Execution Order

1. **Phase 1** (bugs + dead code) — standalone fixes, no dependencies between them. 1.12 (auto-marks on settings toggle) replaces the former Phase 3.4 auto-marks wiring.
2. **Phase 2.1** (auth removal) → **2.2** (PackProgress removal) → **2.3** (auto-mark collapse) → **2.4** (UserProvider inline) — sequential, each simplifies state that the next step touches
3. **Phase 3.1** (extract pure functions) → **3.2** (extract persistence) → **3.3** (simplify store) → **3.4** (PackScreen subscription fix) — sequential, each depends on the prior extraction
4. **Phase 4** — all items are independent of each other, can be done in any order after Phase 3

---

## Todo List

Every task needed to ship the plan. Checked off as completed.

### Phase 1 — Bugs and Dead Code

- [x] **1.1** Remove duplicate `<Pressable>` in `PuzzleScreen.tsx` `renderHeaderRight`
- [x] **1.2** Change `#{puzzleIndex}` to `#{puzzleIndex + 1}` in `WinBanner.tsx`
- [x] **1.3a** Remove `headerTintColor: '#000000'` and commented-out `headerTransparent` from `navigation.tsx` Puzzle screen options
- [x] **1.3b** Add `headerTintColor: theme.text` to the `navigation.setOptions` call in `PuzzleScreen.tsx`
- [x] **1.4** Add `if (completed) return;` guard to top of `undo()` in `store.ts`
- [x] **1.5a** Change `persistProgress` in `store.ts` to pass `completedAt: justCompleted ? Date.now() : undefined`
- [x] **1.5b** Update `saveProgress` in `storage.ts` to merge — preserve existing `completedAt` when incoming value is `undefined`
- [x] **1.6** In `applyDrawStroke` in `store.ts`, call `get()` again before `computeErrors` so it uses current cells, not the stale destructured snapshot
- [x] **1.7a** Delete `getPuzzle` from `src/packs.ts`
- [x] **1.7b** Import `hapticMedium` in `Toolbar.tsx` and use it for undo, redo, clear, and mode cycle button presses
- [x] **1.8a** Remove `outlineWidth: 1.5` from the Svg style in `RegionBordersSvg.tsx`
- [x] **1.8b** Add `overflow="visible"` to the `<Svg>` element in `RegionBordersSvg.tsx`
- [x] **1.9a** Create `src/types/navigation.ts` with `RootStackParams` type
- [x] **1.9b** Update imports in `navigation.tsx`, `HomeScreen.tsx`, `PackScreen.tsx`, `PuzzleScreen.tsx`, `WinBanner.tsx`
- [x] **1.10** Add `.maxPointers(1)` to the draw gesture Pan in `useDrawGesture.ts`
- [x] **1.11** Remove `next === 1 &&` guard from win check in `tapCell` in `store.ts` — call `checkWin` unconditionally
- [x] **1.12a** Import `usePuzzleStore` in `SettingsModal.tsx`
- [x] **1.12b** After each auto-X toggle's `updateSettings` call, add `usePuzzleStore.getState().recomputeAutoMarks()`

### Phase 2 — Remove Over-Engineering

- [ ] **2.1a** Delete `userId` variable, `setUserId`, `getUserId` from `storage.ts`
- [ ] **2.1b** Hardcode `'local'` directly in KEYS object in `storage.ts` (preserves existing data)
- [ ] **2.1c** Delete `migrateUserData` and `deleteUserData` from `storage.ts`
- [ ] **2.1d** Delete `switchUser` and `migrateFromAnonymous` actions from `userStore.ts`
- [ ] **2.1e** Remove `profile` field from `userStore.ts` state
- [ ] **2.1f** Delete `UserProfile` type from `src/types/state.ts`
- [ ] **2.2a** Delete `getPackProgress` and `savePackProgress` from `storage.ts`
- [ ] **2.2b** Delete `PackProgress` type from `src/types/state.ts`
- [ ] **2.2c** Remove `packProgress` state, `refreshPackProgress`, `incrementPackCompleted` from `userStore.ts`
- [ ] **2.2d** Add `getCompletedCount(packId, total)` method to `userStore.ts` that calls `computeCompletedCount`
- [ ] **2.2e** Simplify `initialize` in `userStore.ts` — remove pack progress cache building
- [ ] **2.2f** Remove `incrementPackCompleted` call from `persistProgress` in `store.ts`
- [ ] **2.2g** Update `HomeScreen.tsx` to call `getCompletedCount` per pack instead of subscribing to `packProgress`
- [ ] **2.3a** Replace `autoMarksNeighbors?`, `autoMarksRowsCols?`, `autoMarksRegions?` with `autoMarks?: number[]` in `Progress` type
- [ ] **2.3b** Replace `prevAutoMarksNeighbors`, `prevAutoMarksRowsCols`, `prevAutoMarksRegions` with `prevAutoMarks: number[]` in `Move` type
- [ ] **2.3c** Replace `autoMarksNeighbors`, `autoMarksRowsCols`, `autoMarksRegions` with `autoMarks: number[]` in `RedoEntry` type
- [ ] **2.3d** Replace three `autoMarks*` state fields with single `autoMarks: Set<number>` in `store.ts`
- [ ] **2.3e** Simplify `computeAutoXForStar` to return flat `number[]` in `store.ts`
- [ ] **2.3f** Simplify `applyMarks`, `clearAllAutoMarks`, `rebuildAutoMarks` to use one set in `store.ts`
- [ ] **2.3g** Update `loadPuzzle` to restore single `autoMarks` set
- [ ] **2.3h** Update `tapCell` — snapshot/restore single `prevAutoMarks` array
- [ ] **2.3i** Update `undo` — restore single `autoMarks` set from move
- [ ] **2.3j** Update `redo` — snapshot/restore single `autoMarks` array
- [ ] **2.3k** Update `recomputeAutoMarks` — use single set
- [ ] **2.3l** Update `applyDrawStroke` — snapshot single `autoMarks` array
- [ ] **2.3m** Update `clearBoard` — snapshot and reset single `autoMarks` set
- [ ] **2.3n** Update `persistProgress` — serialize single `autoMarks` array
- [ ] **2.4a** Delete `src/components/UserProvider.tsx`
- [ ] **2.4b** Remove `<UserProvider>` wrapper from `App.tsx`
- [ ] **2.4c** Add `useEffect(() => { useUserStore.getState().initialize(); }, [])` in `App.tsx`

### Phase 3 — Refactor `store.ts`

- [ ] **3.1a** Create `src/utils/puzzleLogic.ts`
- [ ] **3.1b** Move `collectZoneMarks` to `puzzleLogic.ts`
- [ ] **3.1c** Move `computeAutoXForStar` to `puzzleLogic.ts`
- [ ] **3.1d** Move `applyMarks` to `puzzleLogic.ts`
- [ ] **3.1e** Move `clearAutoMarks` / `rebuildAutoMarks` to `puzzleLogic.ts`
- [ ] **3.1f** Move `computeErrors` to `puzzleLogic.ts`
- [ ] **3.1g** Move `checkWin` to `puzzleLogic.ts`
- [ ] **3.1h** Update `store.ts` to import all moved functions from `puzzleLogic.ts`
- [ ] **3.2a** Create `src/utils/persistProgress.ts`
- [ ] **3.2b** Move `persistProgress` function from `store.ts` to `persistProgress.ts`
- [ ] **3.2c** Update `store.ts` to import `persistProgress` from the new file
- [ ] **3.3** Review `store.ts` — confirm each action is a thin coordinator calling extracted functions, target ~200 lines
- [ ] **3.4a** Remove `useUserStore(s => s.getProgress)` subscription from `PackScreen.tsx`
- [ ] **3.4b** Call `useUserStore.getState().getProgress(puzzleId)` directly inside `renderPuzzle`

### Phase 4 — Component Cleanup

- [ ] **4.1a** Create `src/components/HeaderTimer.tsx` that subscribes to `timeMs`, `completed`, and `showTimer` from stores
- [ ] **4.1b** In `PuzzleScreen.tsx`, remove `timeMs` and `showTimer` subscriptions
- [ ] **4.1c** Pass `HeaderTimer` component to `navigation.setOptions({ headerTitle })` once
- [ ] **4.1d** Remove `renderHeaderTitle` callback and its deps from `PuzzleScreen.tsx`
- [ ] **4.2** Replace cell index loop in `BoardView.tsx` with `useMemo` keyed on `puzzle.size`
- [ ] **4.3a** In `HomeScreen.tsx`, delete `focusCount` state and `useState` import; use `useFocusEffect` to set an `extraData` timestamp
- [ ] **4.3b** In `PackScreen.tsx`, delete `focusCount` state and `useState` import; use `useFocusEffect` to set an `extraData` timestamp
- [ ] **4.4a** Wrap `renderPack` in `useCallback` in `HomeScreen.tsx`
- [ ] **4.4b** Wrap `renderPuzzle` in `useCallback` in `PackScreen.tsx`
- [ ] **4.5a** Add missing design tokens to `utils/constants.ts` for WinBanner values (padding, font sizes, button height, border radius)
- [ ] **4.5b** Replace all hardcoded numbers in `WinBanner.tsx` styles with constants
- [ ] **4.5c** Replace `bottom: -160` / `marginBottom: 160` pattern with `bannerHeight`-based positioning
- [ ] **4.6a** Create `src/utils/puzzleId.ts` with `parsePuzzleId` and `makePuzzleId`
- [ ] **4.6b** Replace string splitting in `WinBanner.tsx` with `parsePuzzleId`
- [ ] **4.6c** Replace string splitting in `persistProgress.ts` with `parsePuzzleId`
- [ ] **4.6d** Replace string concatenation in `PuzzleScreen.tsx` with `makePuzzleId`
