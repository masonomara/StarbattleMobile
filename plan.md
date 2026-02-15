# Refactor Plan

## Why

The codebase works but has real bugs, unnecessary abstractions, duplicated state, dead code, and scattered file organization. This plan pares it down to a clean prototype — fix the bugs, remove indirection, organize consistently.

---

## 1. Fix autoMark bugs in draw-erase

**Files:** `src/store.ts`, `src/hooks/useDrawGesture.ts`

`applyDrawStroke` never touches `autoMarks`. When draw-erase clears an auto-marked cell, `autoMarks` still has that index. Stale state persists until the next star removal triggers a full rebuild.

**Fix:** In `applyDrawStroke`, after recording the move, prune `autoMarks` — remove indices where the cell is no longer `2`. Also remove the redundant `strokeChanges`/`visitedCells` reset in `onEnd` (already done by `onFinalize`).

---

## 2. Remove `boardSize` from store

**Files:** `src/store.ts`, `src/hooks/useDrawGesture.ts`, `src/components/CellView.tsx`

`boardSize` always equals `puzzle.size`. It's duplicated state.

**Fix:** Delete `boardSize` from the store type and initial state. Replace every `boardSize` reference in store actions with `puzzle!.size` or `puzzle.size` (after existing null guards). In `useDrawGesture.markCell`, replace `state.boardSize` with `state.puzzle!.size`. In `CellView`, compute `idx` from `s.puzzle!.size`.

---

## 3. Flatten userStore

**Files:** `src/stores/userStore.ts`, `src/store.ts`, `src/screens/HomeScreen.tsx`, `src/screens/PackScreen.tsx`, `src/utils/persistProgress.ts`

`getProgress()` and `getCompletedCount()` are one-line passthroughs to `storage.ts`. They use no Zustand state.

**Fix:**
- Remove `getProgress` and `getCompletedCount` from userStore type and implementation
- Import `getProgress` directly from `storage.ts` at call sites: `store.ts` loadPuzzle, `PackScreen.tsx`
- Import `computeCompletedCount` directly from `storage.ts` in `HomeScreen.tsx`
- Keep `saveProgress` in userStore (bumps `progressVersion` for list re-renders)
- Simplify `storageGetProgress`/`storageSaveProgress` aliases — just import `saveProgress as storageSaveProgress` and `getProgress` directly

---

## 4. Simplify persistence

**Files:** `src/storage.ts`, `src/utils/persistProgress.ts`

`saveProgress` reads from disk on every call to preserve an existing `completedAt`. This happens because `persistProgress` passes `completedAt: undefined` for non-winning saves.

**Fix:** Stop explicitly setting `completedAt: undefined`. Use conditional spread:
```ts
// persistProgress.ts
const progress: Progress = {
  puzzleId: puzzle.id, cells, autoMarks: [...autoMarks],
  timeMs, completed, updatedAt: Date.now(),
  ...(justCompleted ? { completedAt: Date.now() } : {}),
};
```

Simplify `saveProgress` in storage to a simple merge:
```ts
export function saveProgress(progress: Progress): void {
  const existing = getProgress(progress.puzzleId);
  const merged = existing ? { ...existing, ...progress } : progress;
  storage.set(progressKey(merged.puzzleId), JSON.stringify(merged));
}
```

Also fix `computeCompletedCount` to use `getProgress()` instead of duplicating the key template, and inline the `KEYS` object as simple functions:
```ts
const SETTINGS_KEY = 'local:settings';
const progressKey = (id: string) => `local:progress:${id}`;
```

---

## 5. Switch `errorCells` to numeric indices

**Files:** `src/store.ts`, `src/utils/puzzleLogic.ts`, `src/components/CellView.tsx`

`errorCells` is `Set<string>` with `"row,col"` keys. Everything else uses flat numeric indices. Creates unnecessary string allocation.

**Fix:**
- Change `errorCells` type to `Set<number>`
- `computeErrors` returns `Set<number>`, using `r * boardSize + c` instead of `` `${r},${c}` ``
- `CellView` selector: compute `idx = row * s.puzzle!.size + col` once, use for both `value` and `hasError`
- Update `clearBoard` and initial state to use `new Set<number>()`

---

## 6. Decouple SettingsModal from puzzle store

**Files:** `src/components/SettingsModal.tsx`, `src/store.ts`

Auto-X toggles directly call `usePuzzleStore.getState().recomputeAutoMarks()`. Settings UI shouldn't reach into puzzle internals.

**Fix:** Add a `useUserStore.subscribe` listener at module level in `store.ts` that watches auto-X settings and calls `recomputeAutoMarks` on change:
```ts
let prevAutoX = { ...pick auto-X fields from initial settings... };
useUserStore.subscribe(state => {
  const { autoXNeighbors, autoXRowsCols, autoXRegions } = state.settings;
  if (autoXNeighbors !== prevAutoX.n || autoXRowsCols !== prevAutoX.rc || autoXRegions !== prevAutoX.rg) {
    prevAutoX = { n: autoXNeighbors, rc: autoXRowsCols, rg: autoXRegions };
    usePuzzleStore.getState().recomputeAutoMarks();
  }
});
```
Remove `usePuzzleStore` import from SettingsModal. Toggles just call `updateSettings(...)`.

---

## 7. Unify Move and RedoEntry

**Files:** `src/types/state.ts`, `src/store.ts`

`Move` stores `{ changes: CellChange[], prevAutoMarks }` where CellChange has `{ index, previousValue }`. `RedoEntry` stores `{ cellValues: { index, value }[], autoMarks }`. Same shape, different names.

**Fix:** Add `next` to CellChange so it carries both directions:
```ts
export type CellChange = { index: number; prev: CellValue; next: CellValue };
```
Delete `RedoEntry`. `redoStack` becomes `Move[]`. Undo applies `prev` values, redo applies `next` values. This simplifies undo/redo logic — no more remapping between types.

Rename `prevAutoMarks` in `Move` to `autoMarks` for clarity (it's the snapshot before the move, used to restore on undo).

---

## 8. Move `useTheme` to hooks/, `Theme` type to types/

**Files:** `src/utils/useTheme.ts` → `src/hooks/useTheme.ts`, new `src/types/theme.ts`

`useTheme` is a hook in `utils/`. `Theme` type is exported from a non-types file. Both violate project conventions.

**Fix:**
- Create `src/types/theme.ts` with the `Theme` type
- Move `src/utils/useTheme.ts` → `src/hooks/useTheme.ts`, import `Theme` from `../types/theme`
- Delete `src/utils/useTheme.ts`
- Update all 13 import paths:
  - `../utils/useTheme` → `../hooks/useTheme` (9 component/screen files)
  - `./utils/useTheme` → `./hooks/useTheme` (navigation.tsx)
  - `import type { Theme } from '../utils/useTheme'` → `from '../types/theme'` (CellGridSvg, RegionBordersSvg, CellView, SettingsModal)

---

## 9. Inline single-use constants, delete dead code

**Files:** `src/utils/constants.ts` and all consumers

Analysis of every constant's usage:

**Delete (dead — zero imports):** `SPACING_XXL`, `FONT_SIZE_XL`, `FONT_WEIGHT_BOLD`, `INNER_BORDER_WIDTH`

**Inline into their sole consumer:**
- `WIN_BANNER_*` (8 constants) → inline in `WinBanner.tsx`
- `SHADOW_SM` → inline in `PackScreen.tsx`
- `SHADOW_MD` → inline in `Toolbar.tsx`
- `DISABLED_OPACITY` → inline in `Toolbar.tsx`
- `RADIUS_SM` → inline in `PackScreen.tsx`
- `RADIUS_LG` → inline in `Toolbar.tsx`
- `SPACING_XS` → inline in `HomeScreen.tsx`
- `SPACING_SM` → inline in `PackScreen.tsx`
- `GRID_COLUMNS` → inline in `PackScreen.tsx`
- `STAR_ICON_SIZE`, `MARK_ICON_SIZE` → inline in `CellView.tsx`
- `DEFAULT_ZOOM`, `MIN_ZOOM`, `MAX_ZOOM`, `PAN_PADDING` → inline in `useZoom.ts`
- `REGION_BORDER_WIDTH` → inline in `RegionBordersSvg.tsx`

**Keep in constants.ts (shared across 2+ files):**
- `CELL_SIZE` (6 files)
- `FONT_WEIGHT_SEMIBOLD` (4 files)
- `FONT_SIZE_SM` (3 files), `FONT_SIZE_MD` (2 files), `FONT_SIZE_LG` (3 files)
- `SPACING_MD` (2 files), `SPACING_LG` (2 files), `SPACING_XL` (3 files)
- `RADIUS_MD` (2 files)

This takes constants.ts from ~40 exports to ~10.

---

## 10. Small cleanups

- **Delete empty `src/navigation/` directory** — leftover from refactor
- **Remove `headerBackButtonDisplayMode: 'default'`** from `navigation.tsx` — it's already the default
- **Wrap `parsePuzzle` in try/catch** in `PuzzleScreen.tsx` — bad SBN data currently crashes. On error, `navigation.goBack()`
- **Remove `BoardLayout` type from `useDrawGesture.ts`** — move to `src/types/` per project rules

---

## Execution Order

Ordered to minimize merge conflicts (steps touching the same files are grouped):

1. Step 1 — autoMark bug fix
2. Step 2 — remove boardSize
3. Step 7 — unify Move/RedoEntry (heavy store.ts changes, do before other store work settles)
4. Step 5 — errorCells to numeric
5. Step 3 — flatten userStore
6. Step 4 — simplify persistence
7. Step 6 — decouple SettingsModal
8. Step 8 — move useTheme/Theme
9. Step 9 — inline constants
10. Step 10 — small cleanups

---

## Todo List

### Phase 1 — Fix bugs (Steps 1-2) ✓

- [x] **1a.** `store.ts` `applyDrawStroke`: prune stale indices from `autoMarks`
- [x] **1b.** `useDrawGesture.ts` `onEnd`: remove redundant cleanup (already in `onFinalize`)
- [x] **1c.** Verify: typecheck passes
- [x] **2a-g.** Remove `boardSize` from store, derive from `puzzle.size` everywhere

### Phase 2 — Unify undo/redo types (Step 7) ✓

- [x] **7a-c.** `CellChange` → `{ index, prev, next }`, rename `prevAutoMarks` → `autoMarks`, delete `RedoEntry`
- [x] **7d-m.** Rewrite store undo/redo/tapCell/clearBoard, update useDrawGesture + puzzleLogic

### Phase 3 — errorCells to numeric (Step 5) ✓

- [x] **5a-b.** `errorCells` → `Set<number>` in store type + all initializations
- [x] **5c.** `computeErrors` returns `Set<number>` using flat indices
- [x] **5d.** `CellView` selector uses `s.errorCells.has(idx)`

### Phase 4 — Flatten userStore (Step 3) ✓

- [x] **3a-c.** Remove `getProgress`, `getCompletedCount` from userStore
- [x] **3d-g.** Import directly from `storage.ts` at call sites

### Phase 5 — Simplify persistence (Step 4) ✓

- [x] **4a-b.** Inline `KEYS` object → `SETTINGS_KEY` + `progressKey()`
- [x] **4c.** `saveProgress` → simple merge `{ ...existing, ...progress }`
- [x] **4d.** `computeCompletedCount` → use `getProgress()` instead of raw key
- [x] **4e.** `persistProgress` → conditional spread for `completedAt`

### Phase 6 — Decouple SettingsModal (Step 6) ✓

- [x] **6a.** Add `useUserStore.subscribe` listener in `store.ts` for auto-X settings
- [x] **6b-c.** Remove `usePuzzleStore` from SettingsModal, simplify toggle handlers

### Phase 7 — Move useTheme/Theme (Step 8) ✓

- [x] **8a-c.** Create `types/theme.ts`, `hooks/useTheme.ts`, delete `utils/useTheme.ts`
- [x] **8d-g.** Update all 13 import paths

### Phase 8 — Inline constants (Step 9) ✓

- [x] **9a-j.** Inlined all single-use constants, deleted dead exports, reduced constants.ts to 11 shared exports

### Phase 9 — Small cleanups (Step 10) ✓

- [x] **10a.** Deleted empty `src/navigation/` directory
- [x] **10b.** Removed `headerBackButtonDisplayMode: 'default'`
- [x] **10c.** Wrapped `parsePuzzle` in try/catch
- [x] **10d.** Moved `BoardLayout` type to `src/types/board.ts`

### Phase 10 — Verify

- [x] Run `npx tsc --noEmit` — no type errors
- [ ] Build iOS: `cd ios && pod install && cd .. && npx react-native build-ios --mode Debug`
- [ ] Manual test: stars + auto-X + draw-erase + undo/redo + settings toggle + win + persistence + theme

---

## Verification

After all changes:
1. `npx tsc --noEmit` — type-check passes
2. iOS build: `cd ios && pod install && cd .. && npx react-native build-ios --mode Debug`
3. Manual test:
   - Place stars → auto-X marks appear
   - Draw-erase over auto-marked cells → no stale marks
   - Undo/redo through draw strokes and taps
   - Change auto-X settings mid-puzzle → marks recompute automatically
   - Complete puzzle → win banner animates up
   - Kill and reopen → progress persists
   - Toggle light/dark theme → all screens update
