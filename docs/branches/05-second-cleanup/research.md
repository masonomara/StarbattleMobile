# Codebase Audit — StarbattleMobile

Thorough review of every file in `src/`. Findings organized by severity.

---

## Bugs

### 1. Draw-erase leaves stale autoMarks (store.ts + useDrawGesture.ts)
When the draw gesture erases a cell that was auto-marked, the `autoMarks` Set still contains that cell's index. `applyDrawStroke` records the move but never updates `autoMarks`. The stale entries persist until the next full `rebuildAutoMarks` call (triggered only when a star is removed). This is a state inconsistency — the store says a cell is auto-marked, but the cell is empty.

**Where:** `useDrawGesture.ts:63-71` (erase path), `store.ts` `applyDrawStroke` (no autoMark cleanup)

### 2. applyDrawStroke skips autoMark recomputation entirely (store.ts:175-192)
Unlike `tapCell`, the `applyDrawStroke` action only computes errors — it never recomputes auto-marks. If a draw-erase wipes out cells that were auto-marked due to a placed star, the autoMarks set becomes inconsistent with the board. The next undo or star placement may then produce incorrect behavior because `rebuildAutoMarks` calls `clearAutoMarks` on the stale set.

### 3. saveProgress reads from disk on every save to preserve completedAt (storage.ts:36-44)
Every call to `saveProgress` where `completedAt` is undefined (i.e., every non-winning save — timer ticks, taps, undos) triggers an extra MMKV read (`getProgress`) just to check if a `completedAt` existed previously. During active play, this means an extra disk read every 5 seconds (persist interval) and on every tap/undo/redo. The root cause: `completedAt` isn't tracked in store state, so the storage layer has to merge it from disk.

### 4. computeCompletedCount duplicates key construction logic (storage.ts:48-57)
Uses the raw template `` `local:progress:${packId}:${i}` `` instead of `KEYS.progress(makePuzzleId(packId, i))`. If the key format ever changes, this function silently breaks while everything else works. It also imports nothing from `puzzleId.ts`, creating an invisible coupling.

### 5. No error handling around puzzle parsing (PuzzleScreen.tsx:79-82)
`parsePuzzle` throws on a bad SBN header. If any pack JSON has a malformed puzzle, the app crashes — no try/catch, no error boundary, no fallback UI. The throw is in `parsePuzzle.ts:8`.

---

## Code Smells

### 6. `boardSize` is duplicated state (store.ts:46, 58)
The store tracks `boardSize` separately from `puzzle.size`, but they're always identical — `loadPuzzle` sets `boardSize: puzzle.size`. Every read of `boardSize` could just be `puzzle.size`. This duplication means two state fields to keep in sync for no benefit.

### 7. userStore has pointless passthrough methods (stores/userStore.ts:23-31)
`getProgress` and `getCompletedCount` are one-liners that just call the identically-named storage functions. They don't use Zustand state, don't cache anything, don't add logic. They exist only to route calls through the store for no architectural reason. Consumers could import directly from `storage.ts`.

### 8. persistProgress called from 6 places with identical boilerplate (store.ts)
Every action (`tapCell`, `recomputeAutoMarks`, `undo`, `redo`, `applyDrawStroke`, `clearBoard`) ends with:
```ts
const s = get();
persistProgress(s.puzzle, s.cells, s.autoMarks, s.timeMs, s.completed, justWon);
```
This is a cross-cutting concern that should be middleware or a subscribe listener, not manually called in every action.

### 9. errorCells uses string keys, everything else uses numeric indices
`errorCells` is a `Set<string>` with keys like `"0,1"` — string concatenation in every error check. `autoMarks` is a `Set<number>` using flat indices (`row * size + col`). The inconsistency forces string allocation in hot paths (`computeErrors`, `CellView`'s selector) and makes the code harder to follow.

### 10. Theme type defined in utils/useTheme.ts — violates project rules
Per CLAUDE.md: "All types live in `src/types/` folder." The `Theme` type is defined and exported from `src/utils/useTheme.ts` (line 5-19). Same issue with `BoardLayout` in `useDrawGesture.ts:9-12`.

### 11. useTheme hook lives in utils/ instead of hooks/
There are two hooks in `src/hooks/` (useZoom, useDrawGesture) but `useTheme` lives in `src/utils/`. Inconsistent organization — hooks should be in the hooks directory.

### 12. SettingsModal directly calls into puzzle store (SettingsModal.tsx:76-78)
Auto-X toggle handlers call `usePuzzleStore.getState().recomputeAutoMarks()` directly from the settings UI. This creates tight coupling between settings and puzzle logic. The puzzle store should react to settings changes (e.g., via a Zustand subscribe or effect), not be poked from the settings modal.

### 13. Empty src/navigation/ directory
The `ls` output shows both `navigation/` (directory) and `navigation.tsx` (file). The directory appears empty — likely a leftover from a refactor. Should be deleted.

### 14. PackScreen calls getState() inside render callback (PackScreen.tsx:43)
```tsx
const progress = useUserStore.getState().getProgress(puzzleId);
```
Calling `.getState()` inside `renderPuzzle` means this isn't reactive — the component relies on `extraData={progressVersion}` to force FlatList re-renders. It works but is fragile and non-idiomatic.

### 15. useDrawGesture duplicates cleanup in onEnd and onFinalize (useDrawGesture.ts:119-136)
Both `onEnd` and `onFinalize` reset `strokeChanges.current` and `visitedCells.current`. Since `onFinalize` always fires after `onEnd` (or after cancellation), the cleanup in `onEnd` is redundant.

---

## Non-Atomic Functions

### 16. tapCell does 7 things in one function (store.ts:63-113)
1. Determines next cell value based on tapMode
2. Records change for undo
3. Computes auto-X marks for new stars
4. Rebuilds auto-marks when removing stars
5. Triggers haptic feedback
6. Computes error highlights
7. Checks win condition and persists

Each of these is a distinct concern. The function is 50 lines of interleaved logic. Breaking it into `computeNextValue`, `applyAutoMarks`, `checkAndPersist` would make each piece testable and the flow readable.

### 17. computeErrors iterates all cells 4 separate times (puzzleLogic.ts:87-135)
One pass for adjacency (O(stars^2)), one for rows, one for columns, one for regions. A single pass collecting stars into row/col/region buckets, then checking constraints, would be cleaner and faster.

### 18. persistProgress takes 6 primitive arguments (persistProgress.ts:7-12)
```ts
persistProgress(puzzle, cells, autoMarks, timeMs, completed, justCompleted)
```
Six positional args (easy to swap accidentally) that are all just fields from the store state. Should accept the store state directly, or be a store subscriber.

---

## Over-Engineering

### 19. constants.ts exports ~40 named constants, most used once (utils/constants.ts)
`WIN_BANNER_PADDING`, `WIN_BANNER_BORDER_RADIUS`, `WIN_BANNER_BUTTON_HEIGHT`, `WIN_BANNER_BUTTON_RADIUS`, `WIN_BANNER_TITLE_SIZE`, `WIN_BANNER_TITLE_LINE_HEIGHT`, `WIN_BANNER_INFO_SIZE`, `WIN_BANNER_INFO_LINE_HEIGHT` — all used exclusively in `WinBanner.tsx`. Same for shadow presets, spacing scale, font sizes, font weights, and radius values. Extracting single-use magic numbers into a central constants file doesn't aid readability — it forces readers to hop between files to understand a component's layout. Only truly shared constants (CELL_SIZE, REGION_BORDER_WIDTH, zoom limits) benefit from centralization.

### 20. KEYS object in storage.ts for two string templates
```ts
const KEYS = {
  settings: () => 'local:settings',
  progress: (puzzleId: string) => `local:progress:${puzzleId}`,
};
```
Two keys don't warrant a lookup object. Inline the templates or use plain constants.

### 21. headerBackButtonDisplayMode: 'default' (navigation.tsx:20)
Explicitly setting the default value. Remove it.

### 22. RedoEntry type partially duplicates Move (types/state.ts)
`Move` stores `{ changes: CellChange[], prevAutoMarks: number[] }` where `CellChange` has `{ index, previousValue }`. `RedoEntry` stores `{ cellValues: { index, value }[], autoMarks: number[] }`. These are the same shape — a list of cell index/value pairs and an autoMarks snapshot — just with different field names (`previousValue` vs `value`, `prevAutoMarks` vs `autoMarks`). Unifying them would reduce conceptual overhead.

---

## Summary

| Category | Count |
|---|---|
| Bugs | 5 |
| Code Smells | 10 |
| Non-Atomic Functions | 3 |
| Over-Engineering | 4 |
| **Total** | **22** |

**Highest priority:** Bugs #1-2 (autoMark state inconsistency during draw-erase), Bug #5 (crash on bad SBN), and Code Smell #8 (persistence boilerplate that makes every action harder to maintain).
