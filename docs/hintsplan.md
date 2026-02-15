# Hints Implementation Plan

## Goal

Tapping the Lightbulb button in the Toolbar shows ghost previews (low-opacity stars and marks) on the board for the next unplaced hint step. The user taps a ghost cell to confirm and actually place it. Tapping the Lightbulb again while ghosts are showing dismisses them.

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
  → User taps ghost cell → confirmHintCell applies it for real
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
confirmHintCell: (row: number, col: number) => void;
```

### `showHint` logic

```ts
showHint: () => {
  const { puzzle, cells, boardSize, completed, hintGhosts } = get();
  if (!puzzle || completed) return;

  // If ghosts are already showing, dismiss them
  if (hintGhosts.size > 0) {
    set({ hintGhosts: new Map(), hintStepIndex: -1 });
    return;
  }

  // Walk hints to find the next step with unplaced cells
  for (let i = 0; i < puzzle.hints.length; i++) {
    const step = puzzle.hints[i];
    const ghosts = new Map<number, 'star' | 'mark'>();

    for (const [r, c] of step.placements) {
      const idx = r * boardSize + c;
      if (cells[idx] !== 1) ghosts.set(idx, 'star');
    }
    for (const [r, c] of step.marks) {
      const idx = r * boardSize + c;
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
    useShallow(s => ({
      value: s.cells[row * s.boardSize + col],
      hasError: s.errorCells.has(`${row},${col}`),
      ghost: s.hintGhosts.get(row * s.boardSize + col) ?? null,
    })),
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

## Step 6: Handle Ghost Cell Taps

**File: `src/components/BoardView.tsx`** (or `CellView.tsx` onPress)

The `tapCell` in the store already dismisses ghosts on manual interaction. For ghost taps, we need CellView to call a different action when a ghost is present:

**File: `src/components/CellView.tsx`** — update handlePress:

```ts
const confirmHintCell = usePuzzleStore(s => s.confirmHintCell);

const handlePress = useCallback(() => {
  if (ghost) {
    confirmHintCell(row, col);
  } else {
    onPress(row, col);
  }
}, [onPress, confirmHintCell, row, col, ghost]);
```

When the user taps a ghost cell, it confirms that single cell. When they tap a non-ghost cell, normal tap behavior runs (which also dismisses all remaining ghosts via the dismissal in `tapCell`).

---

## Step 7: Auto-X Interaction

When a ghost star is confirmed and auto-X settings are on, `computeAutoXForStar` already runs inside `confirmHintCell`. If a ghost mark cell gets auto-X'd by a confirmed star (the auto-X places a mark on a cell that also had a ghost mark), both resolve naturally — the ghost is cosmetic and the real cell value takes over.

One edge to handle: if auto-X from a confirmed star happens to fill a cell that also has a ghost mark, remove that ghost from the map too:

```ts
// After applying auto-X marks in confirmHintCell:
for (const change of changes) {
  if (change.index !== idx) {
    newGhosts.delete(change.index);
  }
}
```

---

## Behavioral Summary

| User action                            | Result                                                           |
| -------------------------------------- | ---------------------------------------------------------------- |
| Tap Lightbulb (no ghosts)              | Compute next hint step, show ghost cells                         |
| Tap Lightbulb (ghosts showing)         | Dismiss all ghosts                                               |
| Tap a ghost cell                       | Confirm that cell (place star/mark for real), remove from ghosts |
| Tap a non-ghost cell while ghosts show | Normal tap, all ghosts dismissed                                 |
| Undo/redo/clear while ghosts show      | Ghosts dismissed                                                 |
| All ghost cells confirmed              | Hint state auto-clears                                           |
| All hint steps already placed          | Lightbulb is a no-op                                             |

---

## Files Changed

| File                          | Change                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/puzzle.ts`         | Add `HintStep` type, make `hints` required on `Puzzle`                                                                                                    |
| `src/utils/parsePuzzle.ts`    | Thread `raw.hints` into parsed `Puzzle`                                                                                                                   |
| `src/store.ts`                | Add `hintGhosts`, `hintStepIndex`, `showHint`, `dismissHint`, `confirmHintCell`; dismiss ghosts in `tapCell`/`undo`/`redo`/`clearBoard`/`applyDrawStroke` |
| `src/components/CellView.tsx` | Subscribe to `hintGhosts`, render ghost overlay, route taps to `confirmHintCell`                                                                          |
| `src/components/Toolbar.tsx`  | Wire Lightbulb to `showHint`, visual active state                                                                                                         |

No new files needed. No changes to the solver or pack JSON format.
