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

### Phase 1 — Fix bugs (Steps 1-2)

- [ ] **1a.** `store.ts` `applyDrawStroke`: after recording the move, prune stale indices from `autoMarks` (remove any where `cells[idx] !== 2`)
- [ ] **1b.** `useDrawGesture.ts` `onEnd`: remove the redundant `strokeChanges.current = []` and `visitedCells.current = new Set()` (already done in `onFinalize`)
- [ ] **1c.** Verify: place star → auto-marks appear → draw-erase over them → confirm autoMarks set is clean
- [ ] **2a.** `store.ts`: remove `boardSize: number` from `PuzzleState` type
- [ ] **2b.** `store.ts`: remove `boardSize: 0` from initial state
- [ ] **2c.** `store.ts`: remove `boardSize: puzzle.size` from `loadPuzzle`
- [ ] **2d.** `store.ts`: replace every `boardSize` reference in `tapCell`, `recomputeAutoMarks`, `undo`, `redo`, `applyDrawStroke`, `clearBoard` with `puzzle!.size` or `puzzle.size` (after null guard)
- [ ] **2e.** `useDrawGesture.ts` `markCell`: replace `state.boardSize` with `state.puzzle!.size`
- [ ] **2f.** `CellView.tsx`: update selector to compute `idx` from `s.puzzle!.size` instead of `s.boardSize`
- [ ] **2g.** `puzzleLogic.ts`: update `computeErrors` and `checkWin` signatures — `boardSize` param stays (it's a plain function param, not store state), no change needed here

### Phase 2 — Unify undo/redo types (Step 7)

- [ ] **7a.** `types/state.ts`: change `CellChange` to `{ index: number; prev: CellValue; next: CellValue }`
- [ ] **7b.** `types/state.ts`: rename `Move.prevAutoMarks` → `Move.autoMarks`
- [ ] **7c.** `types/state.ts`: delete `RedoEntry` type
- [ ] **7d.** `store.ts`: change `redoStack` type from `RedoEntry[]` to `Move[]`
- [ ] **7e.** `store.ts` `tapCell`: update `CellChange` construction to include both `prev` and `next`
- [ ] **7f.** `store.ts` `recomputeAutoMarks`: update change recording to use `prev`/`next`
- [ ] **7g.** `store.ts` `undo`: simplify — read `prev` from changes, build redo `Move` from current values as `next`, pop moveLog and push to redoStack
- [ ] **7h.** `store.ts` `redo`: simplify — read `next` from changes, build undo `Move` from current values as `prev`, pop redoStack and push to moveLog
- [ ] **7i.** `store.ts` `applyDrawStroke`: update change construction for `prev`/`next`
- [ ] **7j.** `store.ts` `clearBoard`: update change construction for `prev`/`next`
- [ ] **7k.** `useDrawGesture.ts`: update `strokeChanges` construction to include `prev`/`next`
- [ ] **7l.** `puzzleLogic.ts` `applyMarks`, `clearAutoMarks`: update `CellChange` construction for `prev`/`next`
- [ ] **7m.** Remove `RedoEntry` import from `store.ts`

### Phase 3 — errorCells to numeric (Step 5)

- [ ] **5a.** `store.ts`: change `errorCells` type from `Set<string>` to `Set<number>` in `PuzzleState`
- [ ] **5b.** `store.ts`: change all `new Set<string>()` for errorCells to `new Set<number>()`
- [ ] **5c.** `puzzleLogic.ts` `computeErrors`: change return type to `Set<number>`, replace all `errors.add(\`${r},${c}\`)` with `errors.add(r * boardSize + c)`
- [ ] **5d.** `CellView.tsx`: update selector — compute `const idx = row * s.puzzle!.size + col`, use `s.cells[idx]` and `s.errorCells.has(idx)`

### Phase 4 — Flatten userStore (Step 3)

- [ ] **3a.** `stores/userStore.ts`: remove `getProgress` method and its type
- [ ] **3b.** `stores/userStore.ts`: remove `getCompletedCount` method and its type
- [ ] **3c.** `stores/userStore.ts`: remove `storageGetProgress` and `computeCompletedCount` imports
- [ ] **3d.** `store.ts` `loadPuzzle`: import `getProgress` from `../storage` and call it directly instead of `useUserStore.getState().getProgress()`
- [ ] **3e.** `screens/PackScreen.tsx`: import `getProgress` from `../storage` and call directly instead of `useUserStore.getState().getProgress()`
- [ ] **3f.** `screens/HomeScreen.tsx`: import `computeCompletedCount` from `../storage` and call directly instead of through `useUserStore`
- [ ] **3g.** `screens/HomeScreen.tsx`: remove `getCompletedCount` selector subscription

### Phase 5 — Simplify persistence (Step 4)

- [ ] **4a.** `storage.ts`: replace `KEYS` object with `const SETTINGS_KEY = 'local:settings'` and `const progressKey = (id: string) => \`local:progress:${id}\``
- [ ] **4b.** `storage.ts`: update `getSettings`, `saveSettings`, `getProgress` to use `SETTINGS_KEY` and `progressKey`
- [ ] **4c.** `storage.ts` `saveProgress`: replace the `completedAt` special-case with a simple merge (`{ ...existing, ...progress }`)
- [ ] **4d.** `storage.ts` `computeCompletedCount`: replace raw key template with `getProgress(\`${packId}:${i}\`)`
- [ ] **4e.** `persistProgress.ts`: replace `completedAt: justCompleted ? Date.now() : undefined` with conditional spread `...(justCompleted ? { completedAt: Date.now() } : {})`

### Phase 6 — Decouple SettingsModal (Step 6)

- [ ] **6a.** `store.ts`: add `useUserStore.subscribe` listener at module level that watches auto-X settings and calls `recomputeAutoMarks` on change
- [ ] **6b.** `SettingsModal.tsx`: remove `import { usePuzzleStore }` and `import { usePuzzleStore } from '../store'`
- [ ] **6c.** `SettingsModal.tsx`: simplify auto-X toggle handlers to just `updateSettings({ autoXNeighbors: v })` etc. (remove `usePuzzleStore.getState().recomputeAutoMarks()` calls)

### Phase 7 — Move useTheme/Theme (Step 8)

- [ ] **8a.** Create `src/types/theme.ts` with the `Theme` type definition
- [ ] **8b.** Create `src/hooks/useTheme.ts` with hook + theme values, importing `Theme` from `../types/theme`
- [ ] **8c.** Delete `src/utils/useTheme.ts`
- [ ] **8d.** Update imports in `BoardView.tsx`, `CellView.tsx`, `CellGridSvg.tsx`, `RegionBordersSvg.tsx`, `HeaderTimer.tsx`, `Toolbar.tsx`, `WinBanner.tsx`, `SettingsModal.tsx` — change `../utils/useTheme` → `../hooks/useTheme`
- [ ] **8e.** Update imports in `HomeScreen.tsx`, `PackScreen.tsx`, `PuzzleScreen.tsx` — change `../utils/useTheme` → `../hooks/useTheme`
- [ ] **8f.** Update import in `navigation.tsx` — change `./utils/useTheme` → `./hooks/useTheme`
- [ ] **8g.** Update `import type { Theme }` in `CellGridSvg.tsx`, `RegionBordersSvg.tsx`, `CellView.tsx`, `SettingsModal.tsx` — change source to `../types/theme`

### Phase 8 — Inline constants (Step 9)

- [ ] **9a.** `constants.ts`: delete dead exports (`SPACING_XXL`, `FONT_SIZE_XL`, `FONT_WEIGHT_BOLD`, `INNER_BORDER_WIDTH`)
- [ ] **9b.** `WinBanner.tsx`: inline all 8 `WIN_BANNER_*` values directly in styles, remove imports
- [ ] **9c.** `Toolbar.tsx`: inline `SHADOW_MD`, `DISABLED_OPACITY`, `RADIUS_LG` values, remove imports
- [ ] **9d.** `PackScreen.tsx`: inline `SHADOW_SM`, `RADIUS_SM`, `SPACING_SM`, `GRID_COLUMNS` values, remove imports
- [ ] **9e.** `HomeScreen.tsx`: inline `SPACING_XS` value, remove import
- [ ] **9f.** `CellView.tsx`: inline `STAR_ICON_SIZE`, `MARK_ICON_SIZE` values, remove imports
- [ ] **9g.** `useZoom.ts`: inline `DEFAULT_ZOOM`, `MIN_ZOOM`, `MAX_ZOOM`, `PAN_PADDING` values, remove imports
- [ ] **9h.** `RegionBordersSvg.tsx`: inline `REGION_BORDER_WIDTH` value, remove import
- [ ] **9i.** `constants.ts`: remove all deleted/inlined exports, leaving only shared ones (`CELL_SIZE`, `FONT_WEIGHT_SEMIBOLD`, `FONT_SIZE_SM/MD/LG`, `SPACING_MD/LG/XL`, `RADIUS_MD`)
- [ ] **9j.** `constants.ts`: remove the `ViewStyle` import (no longer needed after shadow presets removed)

### Phase 9 — Small cleanups (Step 10)

- [ ] **10a.** Delete empty `src/navigation/` directory
- [ ] **10b.** `navigation.tsx`: remove `headerBackButtonDisplayMode: 'default'` line
- [ ] **10c.** `PuzzleScreen.tsx`: wrap `parsePuzzle` call in try/catch, on error call `navigation.goBack()`
- [ ] **10d.** Create `src/types/board.ts` with `BoardLayout` type, update `useDrawGesture.ts` to import from there and remove inline type

### Phase 10 — Verify

- [ ] Run `npx tsc --noEmit` — confirm no type errors
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
