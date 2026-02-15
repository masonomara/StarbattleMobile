# Hints Implementation Plan

## Goal

Tapping the Lightbulb button in the Toolbar shows ghost previews (low-opacity stars and marks) on the board for the next unplaced hint step. Ghosts are purely visual guidance — tapping any cell (ghost or not) runs normal tap logic and dismisses all ghosts. Tapping the Lightbulb again while ghosts are showing dismisses them.

---

## Core Concept

The hints array is an ordered solve trace. The user's board may be partially filled (correctly or incorrectly). The system walks the hints array from the beginning, skipping any step whose placements and marks are already present on the board, and surfaces the first step that has at least one unplaced cell. Those unplaced cells appear as ghost overlays.

---

## Data Flow

```
Pack JSON (hints: HintStep[])
  → PuzzleScreen reads rawPuzzle.hints
  → Passed into puzzle store as typed HintStep[]
  → showHint action computes next visible ghosts
  → CellView renders ghost stars/marks at low opacity
  → User taps any cell → normal tapCell runs, ghosts dismissed
```

---

## Step 1: Add HintStep Type

**File: `src/types/puzzle.ts`**

```ts
export type HintStep = {
  rule: string;
  level: number;
  placements: Coord[];
  marks: Coord[];
};

export type RawPuzzle = {
  sbn: string;
  solution: Coord[];
  hints?: HintStep[];
};

export type Puzzle = {
  id: string;
  size: number;
  stars: number;
  regions: number[][];
  solution: Coord[];
  hints: HintStep[];
};
```

Make `hints` required on `Puzzle` (default to `[]` at parse time) so the store doesn't need optional chaining everywhere.

---

## Step 2: Thread Hints Through Parsing

**File: `src/utils/parsePuzzle.ts`**

```ts
import type { RawPuzzle, Puzzle, HintStep } from '../types/puzzle';

export function parsePuzzle(raw: RawPuzzle, puzzleId: string): Puzzle {
  // ... existing header/layout parsing ...

  return {
    id: puzzleId,
    size,
    stars,
    regions,
    solution: raw.solution,
    hints: (raw.hints ?? []) as HintStep[],
  };
}
```

No other file changes — `Puzzle` already flows into the store and components.

---

## Step 3: Add Hint State to the Puzzle Store

**File: `src/store.ts`**

New state fields:

```ts
// In PuzzleState type:
hintGhosts: Map<number, 'star' | 'mark'>; // index → ghost type
hintStepIndex: number; // which hint step is active (-1 = none)
```

New actions:

```ts
showHint: () => void;
dismissHint: () => void;
```

### `showHint` logic

```ts
showHint: () => {
  const { puzzle, cells, completed, hintGhosts } = get();
  if (!puzzle || completed) return;

  // If ghosts are already showing, dismiss them
  if (hintGhosts.size > 0) {
    set({ hintGhosts: new Map(), hintStepIndex: -1 });
    return;
  }

  // Walk hints to find the next step with unplaced cells
  const size = puzzle.size;
  for (let i = 0; i < puzzle.hints.length; i++) {
    const step = puzzle.hints[i];
    const ghosts = new Map<number, 'star' | 'mark'>();

    for (const [r, c] of step.placements) {
      const idx = r * size + c;
      if (cells[idx] !== 1) ghosts.set(idx, 'star');
    }
    for (const [r, c] of step.marks) {
      const idx = r * size + c;
      if (cells[idx] !== 2) ghosts.set(idx, 'mark');
    }

    if (ghosts.size > 0) {
      set({ hintGhosts: ghosts, hintStepIndex: i });
      return;
    }
  }

  // All hints already placed — no-op (puzzle should be solved)
},
```

### `dismissHint` logic

```ts
dismissHint: () => {
  set({ hintGhosts: new Map(), hintStepIndex: -1 });
},
```

### No special ghost tap behavior

Tapping a ghost cell does **not** auto-place the hinted value. It runs the normal `tapCell` logic — respecting the current tap mode (cycle, mark, star, erase). The ghosts are purely visual guidance. Any board interaction (including tapping a ghost cell) dismisses all ghosts via the guard in `tapCell`.

### Reset on puzzle load

In `loadPuzzle`, add:

```ts
hintGhosts: new Map(),
hintStepIndex: -1,
```

### Dismiss on manual interaction

In `tapCell`, `undo`, `redo`, `clearBoard`, and `applyDrawStroke` — dismiss active ghosts at the top:

```ts
if (get().hintGhosts.size > 0) {
  set({ hintGhosts: new Map(), hintStepIndex: -1 });
}
```

This ensures ghosts disappear whenever the user takes a manual board action (the hint becomes stale since the board state changed).

---

## Step 4: Render Ghosts in CellView

**File: `src/components/CellView.tsx`**

Add a ghost subscription alongside the existing value subscription:

```ts
export const CellView = memo(function CellView({
  row,
  col,
  theme,
  onPress,
}: Props) {
  const { value, hasError, ghost } = usePuzzleStore(
    useShallow(s => {
      const idx = row * s.puzzle!.size + col;
      return {
        value: s.cells[idx],
        hasError: s.errorCells.has(idx),
        ghost: s.hintGhosts.get(idx) ?? null,
      };
    }),
  );

  const handlePress = useCallback(() => onPress(row, col), [onPress, row, col]);

  const starColor = hasError ? theme.starErrorColor : theme.starColor;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.cell,
        {
          width: CELL_SIZE,
          height: CELL_SIZE,
          backgroundColor: theme.cellBg,
        },
      ]}
    >
      {/* Real placed values */}
      {value === 1 && <StarIcon size={STAR_ICON_SIZE} color={starColor} />}
      {value === 2 && (
        <MarkIcon size={MARK_ICON_SIZE} color={theme.markColor} />
      )}

      {/* Ghost hint overlays */}
      {ghost === 'star' && value !== 1 && (
        <View style={styles.ghost}>
          <StarIcon size={STAR_ICON_SIZE} color={theme.accent} />
        </View>
      )}
      {ghost === 'mark' && value !== 2 && (
        <View style={styles.ghost}>
          <MarkIcon size={MARK_ICON_SIZE} color={theme.accent} />
        </View>
      )}
    </Pressable>
  );
});
```

Add to the stylesheet:

```ts
ghost: {
  position: 'absolute',
  opacity: 0.3,
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
},
```

Ghost cells render the same star/mark icons but in the accent color at 30% opacity. They sit behind real values and only appear when the cell is empty (or has the wrong value).

---

## Step 5: Wire the Lightbulb Button

**File: `src/components/Toolbar.tsx`**

Replace the placeholder Alert with real hint logic:

```ts
const showHint = usePuzzleStore(s => s.showHint);
const hasGhosts = usePuzzleStore(s => s.hintGhosts.size > 0);
const hasHints = usePuzzleStore(s => s.puzzle?.hints.length ?? 0) > 0;
const hintDisabled = completed || !hasHints;
```

```tsx
<Pressable
  onPress={() => {
    if (hapticsEnabled) hapticMedium();
    showHint();
  }}
  disabled={hintDisabled}
  style={[
    styles.button,
    {
      backgroundColor: hasGhosts ? theme.accent : theme.card,
      shadowColor: theme.shadow,
    },
    hintDisabled && styles.disabled,
  ]}
>
  <Lightbulb size={22} color={hasGhosts ? theme.onAccent : theme.text} />
</Pressable>
```

When ghosts are active, the Lightbulb button gets accent background so the user knows the hint mode is on. Tapping again dismisses (handled by `showHint`'s toggle logic).

---

## Step 6: Ghost Cell Tap Behavior

No special tap routing needed. Tapping any cell — ghost or not — calls the same `onPress` → `tapCell` path. The `tapCell` dismissal guard (Step 3) clears all ghosts on any board interaction. The user's current tap mode (cycle, mark, star, erase) determines what gets placed, independent of what the ghost was showing.

`handlePress` in CellView stays unchanged:

```ts
const handlePress = useCallback(() => onPress(row, col), [onPress, row, col]);
```

This keeps CellView simple and avoids any coupling between ghost state and tap logic.

---

## Behavioral Summary

| User action                            | Result                                                           |
| -------------------------------------- | ---------------------------------------------------------------- |
| Tap Lightbulb (no ghosts)              | Compute next hint step, show ghost cells                         |
| Tap Lightbulb (ghosts showing)         | Dismiss all ghosts                                               |
| Tap any cell while ghosts show         | Normal tap (respects current tap mode), all ghosts dismissed     |
| Undo/redo/clear while ghosts show      | Ghosts dismissed                                                 |
| Draw gesture while ghosts show         | Normal draw, all ghosts dismissed                                |
| All hint steps already placed          | Lightbulb is a no-op                                             |

---

## Files Changed

| File                          | Change                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/puzzle.ts`         | Add `HintStep` type, make `hints` required on `Puzzle`                                                                                                    |
| `src/utils/parsePuzzle.ts`    | Thread `raw.hints` into parsed `Puzzle`                                                                                                                   |
| `src/store.ts`                | Add `hintGhosts`, `hintStepIndex`, `showHint`, `dismissHint`; dismiss ghosts in `tapCell`/`undo`/`redo`/`clearBoard`/`applyDrawStroke`                    |
| `src/components/CellView.tsx` | Subscribe to `hintGhosts`, render ghost overlay (no tap logic changes)                                                                                    |
| `src/components/Toolbar.tsx`  | Wire Lightbulb to `showHint`, visual active state                                                                                                         |

No new files needed. No changes to the solver or pack JSON format.

---

## TODO

### Phase 1: Types & Parsing

**`src/types/puzzle.ts`**

- [ ] Add `HintStep` type: `{ rule: string; level: number; placements: Coord[]; marks: Coord[] }`
- [ ] Change `RawPuzzle.hints` from `hints?: unknown` to `hints?: HintStep[]`
- [ ] Add `hints: HintStep[]` to `Puzzle` type (required, not optional)

**`src/utils/parsePuzzle.ts`**

- [ ] Import `HintStep` from `../types/puzzle`
- [ ] Add `hints: (raw.hints ?? []) as HintStep[]` to the returned `Puzzle` object

### Phase 2: Store State & Actions

**`src/store.ts` — PuzzleState type**

- [ ] Add `hintGhosts: Map<number, 'star' | 'mark'>` to `PuzzleState`
- [ ] Add `hintStepIndex: number` to `PuzzleState`
- [ ] Add `showHint: () => void` to `PuzzleState`
- [ ] Add `dismissHint: () => void` to `PuzzleState`

**`src/store.ts` — initial state**

- [ ] Add `hintGhosts: new Map()` to store defaults (next to `errorCells`)
- [ ] Add `hintStepIndex: -1` to store defaults

**`src/store.ts` — loadPuzzle**

- [ ] Reset `hintGhosts: new Map()` in `loadPuzzle`'s `set()` call
- [ ] Reset `hintStepIndex: -1` in `loadPuzzle`'s `set()` call

**`src/store.ts` — showHint action**

- [ ] Implement `showHint`: early-return if `!puzzle || completed`
- [ ] Toggle off: if `hintGhosts.size > 0`, set both to empty/`-1` and return
- [ ] Walk `puzzle.hints` from index 0: for each step, build a `Map<number, 'star' | 'mark'>` of unplaced cells
- [ ] Use `puzzle.size` (not `boardSize` — store has no `boardSize` field) for index math: `r * puzzle.size + c`
- [ ] Compare `cells[idx] !== 1` for placements, `cells[idx] !== 2` for marks
- [ ] On first step with non-empty ghosts map, `set({ hintGhosts: ghosts, hintStepIndex: i })` and return

**`src/store.ts` — dismissHint action**

- [ ] Implement `dismissHint`: `set({ hintGhosts: new Map(), hintStepIndex: -1 })`

**`src/store.ts` — ghost dismissal guards**

Add this guard at the top of each action, before any other logic:

```ts
if (get().hintGhosts.size > 0) {
  set({ hintGhosts: new Map(), hintStepIndex: -1 });
}
```

- [ ] Add guard to `tapCell` (after the `completed` early-return)
- [ ] Add guard to `undo` (after the `moveLog.length === 0` early-return)
- [ ] Add guard to `redo` (after the `redoStack.length === 0` early-return)
- [ ] Add guard to `clearBoard` (after the `completed` early-return)
- [ ] Add guard to `applyDrawStroke` (after the `completed` early-return)

### Phase 3: CellView Ghost Rendering

**`src/components/CellView.tsx` — imports**

- [ ] Add `View` to the `react-native` import
- [ ] Add `STAR_ICON_SIZE` and `MARK_ICON_SIZE` to the `../utils/constants` import (currently hard-coded as `22` and `14`)

**`src/components/CellView.tsx` — selector**

- [ ] Add `ghost` to the `useShallow` selector: `ghost: s.hintGhosts.get(idx) ?? null`
- [ ] Note: current selector uses `row * s.puzzle!.size + col` — keep that pattern (no `boardSize`)

**`src/components/CellView.tsx` — JSX**

- [ ] Render ghost star overlay: `ghost === 'star' && value !== 1` → `<View style={styles.ghost}><StarIcon ... color={theme.accent} /></View>`
- [ ] Render ghost mark overlay: `ghost === 'mark' && value !== 2` → `<View style={styles.ghost}><MarkIcon ... color={theme.accent} /></View>`
- [ ] Place ghost elements after the real value elements (ghosts sit on top visually but opacity makes them recessive)

**`src/components/CellView.tsx` — stylesheet**

- [ ] Add `ghost` style: `{ position: 'absolute', opacity: 0.3, alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }`

### Phase 4: Toolbar Wiring

**`src/components/Toolbar.tsx` — selectors**

- [ ] Add `showHint` selector: `usePuzzleStore(s => s.showHint)`
- [ ] Add `hasGhosts` selector: `usePuzzleStore(s => s.hintGhosts.size > 0)`
- [ ] Add `hasHints` selector: `usePuzzleStore(s => (s.puzzle?.hints.length ?? 0) > 0)`
- [ ] Compute `hintDisabled = completed || !hasHints`

**`src/components/Toolbar.tsx` — Lightbulb button**

- [ ] Replace `Alert.alert(...)` with `showHint()` call
- [ ] Set `disabled={hintDisabled}` on the Pressable
- [ ] Dynamic background: `backgroundColor: hasGhosts ? theme.accent : theme.card`
- [ ] Dynamic icon color: `color={hasGhosts ? theme.onAccent : theme.text}`
- [ ] Add `hintDisabled && styles.disabled` to style array

### Phase 5: Verify & Clean Up

- [ ] Confirm `theme.accent` and `theme.onAccent` exist on the `Theme` type (check `src/types/theme.ts`)
- [ ] Build iOS to verify no type errors
- [ ] Test: tap Lightbulb on a puzzle with hints → ghosts appear
- [ ] Test: tap Lightbulb again → ghosts dismiss
- [ ] Test: tap a cell while ghosts show → normal tap mode fires, ghosts dismiss
- [ ] Test: undo/redo/clear while ghosts show → ghosts dismiss
- [ ] Test: draw gesture while ghosts show → ghosts dismiss
- [ ] Test: puzzle with no hints → Lightbulb disabled
- [ ] Test: completed puzzle → Lightbulb disabled
- [ ] Test: board partially filled correctly → hint skips already-placed steps
