# Codebase Audit — StarbattleMobile

Full review of `App.tsx` and all `src/` files. Findings organized by severity.

---

## Bugs

### 1. Duplicate Settings Button

`src/screens/PuzzleScreen.tsx:125-130` — `renderHeaderRight` renders **two** identical settings buttons inside a fragment. Copy-paste error.

```tsx
<Pressable onPress={() => setSettingsVisible(true)} hitSlop={8}>
  <Settings size={20} color={theme.text} />
</Pressable>
<Pressable onPress={() => setSettingsVisible(true)} hitSlop={8}>
  <Settings size={20} color={theme.text} />
</Pressable>
```

### 2. WinBanner Puzzle Number Off-by-One

`src/components/WinBanner.tsx:68` — Displays `#{puzzleIndex}` which is 0-indexed. First puzzle shows "#0". PackScreen shows `{index + 1}`, so the WinBanner should too.

```tsx
// Shows: "Pack Name #0" for the first puzzle
{pack?.name} #{puzzleIndex}
```

### 3. Hardcoded Header Tint Breaks Dark Mode

`src/navigation.tsx:43` — `headerTintColor: '#000000'` is hardcoded black. In dark mode the back arrow is invisible against the dark background.

### 4. `recomputeAutoMarks` Is Never Called

`src/store.ts:430-478` — This action exists to sync auto-marks when settings change, but nothing calls it. When a user toggles Auto-X Neighbors/Rows/Regions in SettingsModal, the setting saves but the board doesn't update. Old auto-marks stay visible (or new ones don't appear) until the next manual move.

### 5. Undo Allowed After Win

`src/store.ts:481` — `undo()` does not check `completed`. After solving, the user can undo moves, putting the board into a state where `completed: true` but cells don't match the solution. The WinBanner stays visible over a broken board. `redo()` guards against this (line 527), but `undo()` doesn't.

### 6. `applyDrawStroke` Computes Errors from Stale Cells

`src/store.ts:593-596` — Destructures `cells` at the top of the function, but by this point the draw gesture's `markCell` has already mutated cells via direct `setState` calls. `computeErrors` runs on the pre-draw snapshot, so error highlighting is one draw-stroke behind.

### 7. `completedAt` Overwritten on Post-Win Persists

`src/store.ts:673` — `completedAt: state.completed ? Date.now() : undefined`. Since `completed` stays `true` after win, any subsequent `persistProgress` call (from undo, redo, etc.) overwrites `completedAt` with the current time instead of preserving the original win time.

### 8. Navigation: Dead Code and Duplicate Property

`src/navigation.tsx:37-41` — Commented-out `headerTransparent: true` immediately followed by a live `headerTransparent: true`. The commented line should be deleted.

---

## Code Smells

### 9. `store.ts` Is a God Module (~680 lines)

Contains auto-mark computation, error validation, win detection, move/undo/redo logic, draw stroke handling, board clearing, timer ticking, AND cross-store persistence. These are at least 4 distinct concerns in one file.

### 10. Cross-Store Coupling

`src/store.ts` calls `useUserStore.getState()` in 8+ places: inside `tapCell`, `undo`, `redo`, `applyDrawStroke`, `clearBoard`, `recomputeAutoMarks`, `loadPuzzle`, and `persistProgress`. The puzzle store directly invokes user store methods (`saveProgress`, `incrementPackCompleted`, `getProgress`, `settings`). This creates a tight bidirectional dependency that makes both stores impossible to test in isolation.

### 11. `persistProgress` Is a Loose Function Outside the Store

`src/store.ts:663-682` — Defined as a module-level function that reaches into both stores. It's not a store action, not importable for testing, and the data flow is hidden from consumers.

### 12. `tapCell` Is Not Atomic (~110 lines)

`src/store.ts:308-420` — A single function that does: cell value computation, auto-mark creation, auto-mark rebuild, haptic feedback, error computation, state update via `set()`, win check, second `set()` call, and persistence. Should be decomposed.

### 13. `focusCount` Workaround in HomeScreen and PackScreen

`src/screens/HomeScreen.tsx:28-33` and `src/screens/PackScreen.tsx:28-33` — Both use an identical `useState(0)` + `useFocusEffect(setFocusCount(c => c + 1))` pattern to force FlatList re-renders on screen focus. This works around stale data, but the data comes from Zustand which already triggers re-renders on state changes. The `packProgress` subscription in HomeScreen and `userGetProgress` calls in PackScreen should handle freshness. If they don't, the fix belongs in the data layer.

### 14. Store Function Subscribed Reactively

`src/screens/PackScreen.tsx:26` — `const userGetProgress = useUserStore(s => s.getProgress)` subscribes to a store function reference. Store functions are stable and never change; this selector fires on every store update (because the function reference doesn't change, but the selector still runs). Should use `useUserStore.getState().getProgress` directly.

### 15. BoardView Allocates Array Every Render

`src/components/BoardView.tsx:23-26` — Creates a new `cells` array with a loop on every render. Should be memoized with `useMemo` keyed on `puzzle.size`.

### 16. Render Functions Defined Inside List Components

`src/screens/HomeScreen.tsx:35-60` and `src/screens/PackScreen.tsx:41-75` — `renderPack` and `renderPuzzle` are closures recreated every render. For FlatList performance these should be `useCallback`-wrapped or extracted.

### 17. PuzzleScreen Timer Causes Cascade Re-renders

`src/screens/PuzzleScreen.tsx:33-34` — Subscribing to `timeMs` causes the entire PuzzleScreen to re-render every second. This triggers `renderHeaderTitle` recomputation (line 112-119), which calls `navigation.setOptions` (line 136-141) every second. The timer display should be isolated into its own component that subscribes to the store independently.

### 18. WinBanner Magic Numbers

`src/components/WinBanner.tsx:88-127` — Uses 10+ hardcoded numbers (24, 31, 39, 16, 20, 40, 120, 160, 600) while `constants.ts` defines `WIN_BANNER_SLIDE_DISTANCE` and other design tokens that go unused here.

### 19. Puzzle ID Convention Parsed by String Splitting

`src/components/WinBanner.tsx:20-21` and `src/store.ts:679` — Both extract `packId` and `puzzleIndex` from `puzzleId` by splitting on `:`. This implicit convention is duplicated in two files with no shared utility. If the format changes, both break silently.

### 20. `RegionBordersSvg` Uses Invalid Style Property

`src/components/RegionBordersSvg.tsx:64` — `outlineWidth: 1.5` is not a valid React Native style property. Does nothing.

### 21. `computeCompletedCount` Bypasses Key Helper

`src/storage.ts:67` — Manually constructs `${userId}:progress:${packId}:${i}` instead of using `KEYS.progress()`. If the key format in `KEYS` ever changes, this function won't follow.

### 22. `RootStackParams` Type Lives in `navigation.tsx`

`src/navigation.tsx:8-12` — Per project rules, all types should live in `src/types/`. This type is imported by 3 files (HomeScreen, PackScreen, WinBanner).

---

## Dead Code

### 23. `hapticMedium` Never Used

`src/haptics.ts:5-6` — Exported but never imported anywhere.

### 24. `getPuzzle` Never Used

`src/packs.ts:25-27` — Exported but never imported anywhere in the app.

### 25. `recomputeAutoMarks` Never Called

`src/store.ts:269,430` — Defined as a store action but never invoked from any component or hook. (Also a bug, listed above as #4.)

---

## Over-Engineering

### 26. Three Separate Auto-Mark Sets

`store.ts` tracks `autoMarksNeighbors`, `autoMarksRowsCols`, `autoMarksRegions` as three independent `Set<number>`. Every state operation (undo, redo, draw, clear, persist) must snapshot and restore all three. The undo `Move` type stores three `prevAutoMarks*` arrays. The redo `RedoEntry` stores three more. This is ~18 extra fields across the undo/redo stack for a feature that could use a single combined set — since `rebuildAutoMarks` already clears all three and recomputes from scratch.

### 27. User Auth Infrastructure That Doesn't Exist

`src/stores/userStore.ts` has `switchUser`, `migrateFromAnonymous`; `src/storage.ts` has `migrateUserData`, `deleteUserData`, `setUserId`; `src/types/state.ts` has `UserProfile`. The profile is always `{ id: 'local', isAnonymous: true }`. This is ~80 lines of untested code for a feature that doesn't ship. YAGNI.

### 28. `PackProgress` as a Persisted Cache

`src/types/state.ts:17-22`, `src/storage.ts:52-58`, `src/stores/userStore.ts:84-109` — The completed count per pack is cached in MMKV, has its own read/write functions, own refresh logic, and can drift from actual progress (requiring `refreshPackProgress` to fix). With 5 packs and <200 puzzles each, computing this on the fly from puzzle progress is instantaneous and eliminates the entire cache layer.

### 29. `UserProvider` Component

`src/components/UserProvider.tsx` — 12 lines that just call `initialize()` on mount and return children. This could be a `useEffect` in App.tsx (3 lines) or the store could self-initialize.

### 30. Full Redo Stack with Separate Type

`src/types/state.ts:51-56` and `src/store.ts:525-578` — The redo system introduces a separate `RedoEntry` type distinct from `Move`, with its own state reconstruction logic. Since auto-marks can be recomputed from cell state, both undo and redo could use a simpler snapshot model.

---

## Summary

| Category | Count |
|---|---|
| Bugs | 8 |
| Code Smells | 14 |
| Dead Code | 3 |
| Over-Engineering | 5 |

**Highest priority fixes:** #1 (duplicate button), #2 (off-by-one), #3 (dark mode broken), #4 (auto-marks never recompute), #5 (undo after win).

**Biggest architectural wins:** Extract auto-mark logic and persistence from `store.ts` (#9), eliminate cross-store coupling (#10), remove premature auth/migration infrastructure (#27), simplify auto-mark tracking to a single set (#26).
