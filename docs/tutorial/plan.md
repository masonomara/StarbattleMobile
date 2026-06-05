# Tutorial / Onboarding — Implementation Plan

> A dedicated, skippable **one-time** tutorial that cold-opens on first launch onto a tiny 5×5 / 1★
> grid. Teaches two rules — "tap to place a star" and "stars can't touch" — one idea per step, the
> adjacency rule taught by *letting the player break it* (the touching stars turn red, the header shows
> the one line, they fix it). **Shown once, then discarded — not replayable; no "How to play" entry.**
>
> **Secondary benefit:** zero synced data (hardcoded puzzle), so it's a natural cover for background
> prefetch + first sync. **Caveat:** only helps an online, engaged first launch — useless for an instant
> Skip or an offline first launch, so it is *not* a substitute for getting the `{id}-hints.json` files
> into Storage (see `docs/hints`).
>
> Build on its own branch **after** the hints work is committed.

---

## Design decisions

- **The header is the only new screen chrome.** The tutorial otherwise behaves exactly like the real
  puzzle screen — same canvas, same tap-cycle, same red error highlight. We do **not** add a shake, an
  auto-clear, a highlight, or any new mechanic. (The disabled-hint toolbar and the completion overlay
  below come from earlier notes, not new inventions — say the word to drop them for a pure header-only
  screen.)
- **Adjacency = the existing red highlight, nothing more.** Neither a shake nor an auto-clear exists in
  the app, and we're not adding them. When two stars touch they turn red via the built-in error
  highlighting (`computeErrors` → `PuzzleCanvas`'s red star path); the header swaps to "Stars can't
  touch."; the player clears their own star with the normal tap-cycle — exactly like the main game.
- **Fully isolated — local controller, no `usePuzzleStore`, no persistence.** The tutorial owns its
  board in a `useTutorial` hook and reuses only presentational pieces (`PuzzleCanvas`, `Header`). Nothing
  it does touches the real game's store, progress, or PowerSync.
- **Tap model: the real cycle** (empty→mark→star), reimplemented locally with the pure helpers from
  `src/utils/puzzleLogic` so the rules are identical.
- **Auto-marks OFF** (local choice) — keeps "one idea per step" clean and the adjacency break easy to reach.
- **Standalone `TutorialToolbar`** with the same look as `Toolbar`, wired to the local controller; the
  **hint button is disabled** and tapping it shows **"Hints not available for the tutorial."** (per note).
- **Colored regions OFF** (per note) — `PuzzleCanvas` reads `coloredRegions` from settings, default
  `false`; on a first launch that's always the value, so no override is needed.
- **No highlight** (per note) — guidance is text only.
- **One-time only.** `tutorialSeen` gates the cold open; finishing *or* skipping sets it. No replay.
- **Grid:** 5×5 / 1★. **Header:** instruction + Skip, nothing else.
- **Finish:** a WinBanner-style overlay — **"Tutorial Complete!"** + a **"Start playing"** button → Home.

---

## Task checklist

Order keeps the build green; typecheck after each phase. **Implemented 2026-06-04** — typecheck /
eslint (0 errors) / jest (4/4) / Metro bundle all green. Built on `hints-disk-cache` (hints not yet
committed, so no separate `tutorial` branch). Puzzle = first puzzle of `5x5-normal` (swappable).

**Phase 0 — Pre-flight** ✅
- [x] Baseline `npx tsc --noEmit` passes
- [~] Branch — built on `hints-disk-cache` instead of a separate `tutorial` branch (hints isn't committed)

**Phase 1 — Types + content** ✅
- [x] `src/types.ts` — added `Tutorial: undefined`, `TutorialStep`, `TutorialToolbarProps`, `UserSettings.tutorialSeen`
- [x] `src/tutorial/tutorialPuzzle.ts` — real 5×5/1★ SBN + solution + the ordered instruction lines

**Phase 2 — Settings flag (cold-open gate)** ✅
- [x] `settingsStore` — `tutorialSeen` default `false`; `completeTutorial()` action; **synchronous** `hasSeenTutorial()` getter

**Phase 3 — Local controller + toolbar (isolated)** ✅
- [x] `src/tutorial/useTutorial.ts` — local `cells`, `errorCells` (via `computeErrors`), `tapMode`, undo/redo, real cycle tap, `clear`, win via `checkWin`; auto-marks off
- [x] `src/components/TutorialToolbar.tsx` — same look as `Toolbar`, wired to the controller; 💡 disabled → alert "Hints not available for the tutorial"

**Phase 4 — TutorialScreen** ✅
- [x] tutorial `Header` (instruction center, Skip right; nothing else)
- [x] `PuzzleCanvas` from the controller's `cells`/`errorCells` (+ empty `hintGhosts`) — no animation, no shake
- [x] tap gesture → `controller.tap(row, col)` (tiny static grid — no zoom/pan/draw)
- [x] header text = current instruction, swapped to "Stars can't touch." while `errorCells` is non-empty (the built-in red highlight is the only visual; the player clears their own star)
- [x] `TutorialToolbar`

**Phase 5 — Completion overlay** ✅
- [x] on win → WinBanner-style overlay: "Tutorial Complete!" + "Start playing"
- [x] "Start playing" / Skip → `completeTutorial()` → `navigation.reset()` to `Home`

**Phase 6 — Navigation + cold-open** ✅
- [x] register `Tutorial` screen (wrapped in `ErrorBoundary` like the others)
- [x] `initialRouteName` = `hasSeenTutorial() ? 'Home' : 'Tutorial'` (synchronous, at first render)
- [x] `App.tsx` — if `!hasSeenTutorial()`, `markHomeReady()` immediately (lift splash onto the tutorial; prefetch runs underneath)

**Phase 7 — Verify** 🟡 build green; device checks pending (you)
- [x] build gate: typecheck + eslint (0 errors) + jest (4/4) + Metro bundle
- [ ] ⚠️ fresh install → cold-opens on tiny grid, no splash wait, Skip visible
- [ ] ⚠️ tap cycles empty→mark→star; toolbar works; 💡 tap → "Hints not available for the tutorial"
- [ ] ⚠️ place a star next to another → it turns red + header shows "Stars can't touch." → player clears it (no shake, no auto-clear)
- [ ] ⚠️ solve → "Tutorial Complete!" → "Start playing" → Home (stack reset; back doesn't return)
- [ ] ⚠️ Skip → Home; `tutorialSeen` set; never shown again
- [ ] ⚠️ confirm **no** `puzzle_progress` row and **no** store mutation from the tutorial (fully isolated)
- [ ] ⚠️ (prefetch cover) `[SB:HINTS]`/`[SB:PACK]` logs run while the tutorial is on screen

---

## Phase 1 — Types + content

### `src/types.ts`
```ts
// RootStackParamList — add (no params; one-time, not replayable):
Tutorial: undefined;

// near the puzzle types:
export type TutorialStep = {
  instruction: string;                                      // one sentence, in the header
  until: (cells: CellValue[], puzzle: Puzzle) => boolean;   // advance when true
};

// UserSettings — add:
tutorialSeen: boolean;
```

### `src/tutorial/tutorialPuzzle.ts`
```ts
import { parsePuzzle } from '../utils/parsePuzzle';
import { checkWin, computeErrors } from '../utils/puzzleLogic';
import type { CellValue, Puzzle, TutorialStep } from '../types';

const TUTORIAL_SBN = '5x1.<25-letter-layout>';
const TUTORIAL_SOLUTION: [number, number][] = [/* one [row,col] per star */];

export const TUTORIAL_PUZZLE: Puzzle = parsePuzzle(
  { sbn: TUTORIAL_SBN, solution: TUTORIAL_SOLUTION },
  'tutorial',
);

const stars = (cells: CellValue[]) => cells.filter(c => c === 1).length;

// Text only — the header is the whole teaching surface. The "next to it" step
// advances once two stars touch (the board turns red on its own); the player
// then clears their own star to finish.
export const TUTORIAL_STEPS: TutorialStep[] = [
  { instruction: 'Tap to place a star.', until: cells => stars(cells) >= 1 },
  { instruction: 'Now place a star next to it.', until: (c, p) => computeErrors(c, p.size, p).size > 0 },
  { instruction: 'One star per row, column, and region.', until: (c, p) => checkWin(c, p.size, p) },
];
```
> Generate `TUTORIAL_SBN`/`TUTORIAL_SOLUTION` with the star-battle generator (or hand-pick a 5×5).

---

## Phase 2 — Settings flag

`src/stores/settingsStore.ts` — `tutorialSeen` rides the existing MMKV settings blob:
```ts
// DEFAULT_SETTINGS — add: tutorialSeen: false,

// Synchronous read for the initial-route decision (MMKV is sync; getSettings is module-private).
export function hasSeenTutorial(): boolean {
  return getSettings().tutorialSeen;
}

// in the store:
completeTutorial: () => {
  saveSettings({ tutorialSeen: true });
  set(state => ({ settings: { ...state.settings, tutorialSeen: true } }));
},
```

---

## Phase 3 — Local controller + toolbar

### `src/tutorial/useTutorial.ts` — isolated board state
Reuses the pure rule helpers; **no store, no persistence, no auto-marks, no auto-clear**.
```ts
import { useMemo, useState } from 'react';
import { computeErrors, checkWin } from '../utils/puzzleLogic';
import { TUTORIAL_PUZZLE } from './tutorialPuzzle';
import type { CellValue, TapMode } from '../types';

const N = TUTORIAL_PUZZLE.size;
const empty = (): CellValue[] => new Array(N * N).fill(0);

export function useTutorial(onWin: () => void) {
  const [cells, setCells] = useState<CellValue[]>(empty);
  const [past, setPast] = useState<CellValue[][]>([]);
  const [future, setFuture] = useState<CellValue[][]>([]);
  const [tapMode, setTapMode] = useState<TapMode>('cycle');

  const errorCells = useMemo(() => computeErrors(cells, N, TUTORIAL_PUZZLE), [cells]);

  const commit = (next: CellValue[]) => {
    setPast(p => [...p, cells]);
    setFuture([]);
    setCells(next);
    if (checkWin(next, N, TUTORIAL_PUZZLE)) onWin();
  };

  const tap = (row: number, col: number) => {
    const i = row * N + col;
    const cur = cells[i];
    const next = [...cells] as CellValue[];
    // empty → mark → star → empty (erase mode clears to empty)
    next[i] = tapMode === 'erase' ? 0 : cur === 0 ? 2 : cur === 2 ? 1 : 0;
    commit(next);
  };

  const undo = () => setPast(p => {
    if (!p.length) return p;
    setFuture(f => [...f, cells]);
    setCells(p[p.length - 1]);
    return p.slice(0, -1);
  });
  const redo = () => setFuture(f => {
    if (!f.length) return f;
    setPast(p => [...p, cells]);
    setCells(f[f.length - 1]);
    return f.slice(0, -1);
  });
  const clear = () => commit(empty());

  return {
    puzzle: TUTORIAL_PUZZLE, cells, errorCells, tapMode, tap, undo, redo, clear,
    cycleTapMode: () => setTapMode(m => (m === 'cycle' ? 'erase' : 'cycle')),
    canUndo: past.length > 0, canRedo: future.length > 0,
  };
}
```

### `src/components/TutorialToolbar.tsx` — same look, local wiring, hint disabled
Self-contained (the real `Toolbar` is store-bound and stays untouched). Reuse `Toolbar`'s `createStyles`
or copy them. The 💡 is faded and tapping alerts the tutorial message; the others drive the controller.
```ts
function handleHint() {
  Alert.alert('Hints', 'Hints not available for the tutorial');
}
// buttons: zoom-reset (hidden — no zoom on the tiny grid), 💡 (disabled+message),
// tap-mode (cycle/erase), undo, redo, clear — all from useTutorial.
```
> *De-dup option:* extract `Toolbar`'s JSX into a dumb `ToolbarView` (props-driven) shared by both the
> real `Toolbar` (store wrapper) and `TutorialToolbar` (local wrapper). Still fully isolated at the state
> level. Default plan keeps them separate.

---

## Phase 4 — TutorialScreen (`src/screens/TutorialScreen.tsx`)

No store, no shake, no auto-clear — the header is the only tutorial-specific chrome.
```ts
// shape (abridged):
const c = useTutorial(() => setDone(true));
const [done, setDone] = useState(false);

const stepIndex = TUTORIAL_STEPS.findIndex(s => !s.until(c.cells, c.puzzle));
const instruction = TUTORIAL_STEPS[Math.max(0, stepIndex)].instruction;
// touching stars are already drawn red by PuzzleCanvas; just swap the header line.
const headerText = c.errorCells.size > 0 ? "Stars can't touch." : instruction;

return (
  <View style={styles.container}>
    <Header
      center={<Text>{headerText}</Text>}
      right={<Pressable onPress={finish}><Text>Skip</Text></Pressable>}
    />
    <View style={styles.boardArea}>
      <GestureDetector gesture={tapToCell(c.tap)}>
        <PuzzleCanvas
          puzzle={c.puzzle} cells={c.cells} errorCells={c.errorCells}
          hintGhosts={EMPTY_GHOSTS} theme={theme}
          canvasSize={theme.cellSize * c.puzzle.size}
        />
      </GestureDetector>
    </View>
    <TutorialToolbar controller={c} />
    {done && <TutorialComplete onStart={finish} />}
  </View>
);
```
- No store anywhere; `c` is the only source of board truth.
- No `coloredRegions` prop → regions render per the app default (off), per note.
- `EMPTY_GHOSTS` is a shared empty `Map` (no highlight); `tapToCell` maps a tap → (row, col).

---

## Phase 5 — Completion overlay (`TutorialComplete`)

WinBanner-style visual; tutorial content + action (don't reuse the real `WinBanner` — it's
game/navigation-specific):
```ts
// "Tutorial Complete!"  +  <Button> Start playing </Button>
function finish() {
  useSettingsStore.getState().completeTutorial();
  navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
}
```
Both "Start playing" and the header "Skip" call `finish()` (one-time: always set the flag + go Home).

---

## Phase 6 — Navigation + cold-open

### `src/navigation.tsx`
```ts
// add WrappedTutorial (ErrorBoundary like the others), then:
const [initialRouteName] = useState<keyof RootStackParamList>(
  () => (hasSeenTutorial() ? 'Home' : 'Tutorial'),
);
// <Stack.Navigator initialRouteName={initialRouteName} ...>
//   ...existing screens...
//   <Stack.Screen name="Tutorial" component={WrappedTutorial} />
```

### `App.tsx`
```ts
// early in the setup effect — don't make the first-launch tutorial wait on synced data:
if (!hasSeenTutorial()) useSplashStore.getState().markHomeReady();
```
Native launch screen still flashes during JS init (unavoidable); the FauxSplash lifts straight onto the
tutorial while `db.connect` / sync / `prefetchAllCatalog` run underneath.

---

## Files

| File | Change |
|---|---|
| `src/types.ts` | + `Tutorial` route, `TutorialStep`, `UserSettings.tutorialSeen` |
| `src/tutorial/tutorialPuzzle.ts` | new — puzzle + instruction lines |
| `src/tutorial/useTutorial.ts` | new — isolated controller (cells, cycle, undo/redo, errors, win) |
| `src/screens/TutorialScreen.tsx` | new — header + canvas + toolbar + completion (no shake/auto-clear) |
| `src/components/TutorialToolbar.tsx` | new — toolbar look, local wiring, hint disabled |
| `src/stores/settingsStore.ts` | + `tutorialSeen`, `completeTutorial()`, `hasSeenTutorial()` |
| `src/navigation.tsx` | + `Tutorial` screen + conditional `initialRouteName` |
| `App.tsx` | first-launch `markHomeReady()` |

**Untouched (full isolation):** `usePuzzleStore`, `progress.ts`, the real `Toolbar`, `PuzzleScreen`,
`PuzzleCanvas` (reused as-is, read-only), `WinBanner`.

## Open questions
- Win copy beyond "Tutorial Complete!" / "Start playing" — any subtext?
- Should the tutorial toolbar's undo/redo/clear be functional, or shown inert for visual fidelity?
  (Plan wires them up; trivial to make inert.)
- With no auto-clear, the player must clear their own adjacent star (tap-cycle / undo) before they can
  finish — confirm that reads well, or drop the guided "place a star next to it" step and let adjacency
  be purely incidental.
