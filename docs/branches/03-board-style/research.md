# Board & Cell Rendering — Complete Reference

## Overview

The board is a flat grid of `Pressable` cells rendered inside an `Animated.View`. There is no `FlatList`, no `ScrollView`, no nested row containers. The entire grid is built with `flexDirection: 'row'` + `flexWrap: 'wrap'` on the parent, so cells flow left-to-right and wrap at the board width.

---

## File Map

| File                           | Role                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `src/components/BoardView.tsx` | Grid container, border computation, cell iteration               |
| `src/components/CellView.tsx`  | Individual cell: borders, icon, press handler                    |
| `src/utils/constants.ts`       | All numeric constants (sizes, widths, ratios, zoom limits)       |
| `src/utils/useTheme.ts`        | Theme object with all colors used by cells and borders           |
| `src/hooks/useZoom.ts`         | Pinch/pan gesture + Animated transform values                    |
| `src/screens/PuzzleScreen.tsx` | Orchestrator: loads puzzle, wraps board in GestureDetector       |
| `src/store.ts`                 | Zustand store: cell state, tap logic, error detection, win check |
| `src/types/puzzle.ts`          | `Puzzle`, `Borders`, `Coord` types                               |
| `src/types/state.ts`           | `CellValue` (0/1/2), `Progress`, `Move`                          |

---

## Constants (`src/utils/constants.ts`)

```
CELL_SIZE              = 38        // px, width and height of every cell
REGION_BORDER_WIDTH    = 1.5       // thick border between regions
INNER_BORDER_WIDTH     = 0.5       // thin border between cells in same region
BORDER_STYLE           = 'solid'
STAR_ICON_SIZE_RATIO   = 0.6       // star icon = 38 * 0.6 = 22.8px
MARK_ICON_SIZE_RATIO   = 0.4       // X icon = 38 * 0.4 = 15.2px (unused — X hardcodes size=16)
MIN_ZOOM               = 0.5
MAX_ZOOM               = 5
```

**Note:** The X icon in `CellView` hardcodes `size={16}` and ignores `MARK_ICON_SIZE_RATIO`. The star icon correctly uses the ratio.

---

## Board Layout (`BoardView.tsx`)

### Container Style

```js
{
  alignSelf: 'center',
  flexDirection: 'row',
  flexWrap: 'wrap',
  outlineWidth: REGION_BORDER_WIDTH,  // outer board border
  width: CELL_SIZE * puzzle.size,
  height: CELL_SIZE * puzzle.size,
  transform: [{ translateX }, { translateY }, { scale }],
}
```

- **`flexDirection: 'row'` + `flexWrap: 'wrap'`** — cells are rendered as a flat list; wrapping at exactly `CELL_SIZE * size` creates rows automatically. No nested row views.
- **`outlineWidth`** — applies the outer board border. Uses `outlineWidth` (not `borderWidth`) so it doesn't eat into the board dimensions. This is a React Native ViewStyle property.
- **Transform order** — translate first, then scale. This means pan happens in pre-scale coordinates.
- **`Animated.View`** — uses RN's built-in `Animated` (not Reanimated, which is incompatible with RN 0.84).

### Border Computation

The `cellBorders` memo computes a flat `Borders[]` array (one per cell, row-major order):

```ts
type Borders = { top: boolean; bottom: boolean; left: boolean; right: boolean };
```

Each direction is `true` if the cell is on the board edge OR if the adjacent cell belongs to a different region. The comparison is `puzzle.regions[row][col] !== puzzle.regions[adjacentRow][adjacentCol]`.

The result is a flat array of length `size * size`, indexed by `row * size + col`.

### Cell Rendering

Cells are rendered by mapping over `cellBorders`:

```tsx
cellBorders.map((borders, i) => {
  const row = Math.floor(i / puzzle.size);
  const col = i % puzzle.size;
  return (
    <CellView
      key={i}
      row={row}
      col={col}
      borders={borders}
      theme={theme}
      onPress={tapCell}
    />
  );
});
```

- `key={i}` — integer index, stable because the grid never reorders.
- `theme` is passed as a prop (not subscribed per-cell) to avoid re-render cascades on theme change.
- `tapCell` from the Zustand store is passed down as `onPress`.

---

## Cell Rendering (`CellView.tsx`)

### Component Structure

`CellView` is wrapped in `React.memo`. It renders a single `Pressable` containing an optional star or X icon.

### Store Subscription

Each cell subscribes to exactly two values from Zustand, using `useShallow`:

```ts
const { value, hasError } = usePuzzleStore(
  useShallow(s => ({
    value: s.cells[row * s.boardSize + col], // CellValue: 0 | 1 | 2
    hasError: s.errorCells.has(`${row},${col}`), // boolean
  })),
);
```

- Uses `useShallow` so the cell only re-renders when `value` or `hasError` actually change.
- Cell index computed as `row * boardSize + col` (flat array addressing).
- Error lookup uses string key `"row,col"`.

### Border Styling

Each cell's border width and color are set independently per side:

```
borderTopWidth:    borders.top    ? REGION_BORDER_WIDTH (1.5) : INNER_BORDER_WIDTH (0.5)
borderBottomWidth: borders.bottom ? REGION_BORDER_WIDTH (1.5) : INNER_BORDER_WIDTH (0.5)
borderLeftWidth:   borders.left   ? REGION_BORDER_WIDTH (1.5) : INNER_BORDER_WIDTH (0.5)
borderRightWidth:  borders.right  ? REGION_BORDER_WIDTH (1.5) : INNER_BORDER_WIDTH (0.5)
```

**Colors** differ between region boundaries and inner cell boundaries:

```
Region boundary:  theme.regionBorder  (light: #000000, dark: #CCCCCC)
Inner boundary:   theme.innerBorder   (light: #000000, dark: #444444)
```

In light mode, both are black — regions are distinguished purely by weight (1.5 vs 0.5). In dark mode, regions also differ by color (bright gray vs dim gray).

`borderStyle` is always `'solid'`.

**Border box model note:** Border widths are included in the cell's hit area but the cell's `width`/`height` are set to `CELL_SIZE` directly. This means the actual content area inside borders is `CELL_SIZE - leftBorder - rightBorder` by `CELL_SIZE - topBorder - bottomBorder`. Since RN defaults to `borderBox` sizing on Android but `contentBox` on iOS (prior to style changes), this may cause slight size discrepancies between platforms. The cells are sized at exactly 38px including borders.

### Cell Content

Three states, rendered by the `value` from the store:

| Value | Meaning  | Rendered               |
| ----- | -------- | ---------------------- |
| `0`   | Empty    | Nothing                |
| `1`   | Star     | `<Star>` icon (lucide) |
| `2`   | Mark (X) | `<X>` icon (lucide)    |

**Star icon:**

- `size={CELL_SIZE * STAR_ICON_SIZE_RATIO}` = 22.8px
- `color` and `fill` = `starColor` (or `starErrorColor` if `hasError`)
- `strokeWidth={0}` — fully filled, no outline stroke
- Light mode: dark gray `#1A1A1A` (error: red `#B7404E`)
- Dark mode: gold `#FFD54F` (error: red `#F87171`)

**X (mark) icon:**

- `size={16}` (hardcoded, not using `MARK_ICON_SIZE_RATIO`)
- `color={theme.markColor}`
- `strokeWidth={2.5}`
- Light mode: red `#B7404E`
- Dark mode: gray `#757575`

### Press Handler

```ts
const handlePress = useCallback(() => onPress(row, col), [onPress, row, col]);
```

Memoized per cell. `onPress` is `tapCell` from the Zustand store.

### Base Cell Style

```js
{ alignItems: 'center', justifyContent: 'center' }
```

Centers the star/X icon within the cell. Background color is `theme.cellBg` (light: `#eeece7`, dark: `#2A2A2A`).

---

## Theme Colors (Board-Related)

| Property         | Light     | Dark      | Used For                       |
| ---------------- | --------- | --------- | ------------------------------ |
| `cellBg`         | `#eeece7` | `#2A2A2A` | Cell background                |
| `regionBorder`   | `#000000` | `#CCCCCC` | Thick region boundary lines    |
| `innerBorder`    | `#000000` | `#444444` | Thin same-region cell dividers |
| `starColor`      | `#1A1A1A` | `#FFD54F` | Star fill (normal)             |
| `starErrorColor` | `#B7404E` | `#F87171` | Star fill (error state)        |
| `markColor`      | `#B7404E` | `#757575` | X mark color                   |
| `bg`             | `#eeece7` | `#121212` | Screen background behind board |

---

## Pinch/Pan Zoom (`useZoom.ts`)

Uses `react-native-gesture-handler`'s `Gesture` API with RN's built-in `Animated`.

### State

Three `Animated.Value` refs: `scale`, `translateX`, `translateY`. Three plain refs track the "saved" (committed) values between gestures.

### Pinch Gesture

- `onUpdate`: `scale.setValue(savedScale * event.scale)` — live tracking, no clamping during gesture.
- `onEnd`: clamps to `[MIN_ZOOM (0.5), MAX_ZOOM (5)]`, saves the clamped value, springs to it. Updates `isZoomed` boolean.

### Pan Gesture

- `onUpdate`: `translateX.setValue(savedX + event.translationX)` — live tracking, no bounds clamping.
- `onEnd`: saves the final position. No spring-back to bounds.

### Composition

`Gesture.Simultaneous(pinchGesture, panGesture)` — both fire at the same time.

### Reset

`handleZoomReset` springs all three values to `(scale: MIN_ZOOM, x: 0, y: 0)`. Resets `isZoomed` to `false`.

**Note:** The reset target is `MIN_ZOOM` (0.5), not 1.0. So "reset" means "zoom all the way out" rather than "return to actual size."

---

## Board Coordinate System

### Regions Array

`puzzle.regions` is a 2D `number[][]` where `regions[row][col]` is the region index (0-based integer). Parsed from the SBN format where letters A-Z map to region indices.

### Cell Indexing

The store uses a flat `CellValue[]` array. Index = `row * boardSize + col`. This matches the flat rendering order in `BoardView`.

### Cell Cycle

Tapping cycles: `0 (empty) → 2 (mark/X) → 1 (star) → 0 (empty)`. This is counterintuitive — mark comes before star.

---

## PuzzleScreen Orchestration

### Mounting

1. `PuzzleScreen` gets `packId` and `puzzleIndex` from route params.
2. Loads the raw puzzle from `getPack(packId).puzzles[puzzleIndex]`.
3. Parses SBN string into a `Puzzle` object via `parsePuzzle`.
4. Calls `loadPuzzle(parsed)` on the Zustand store, which either restores saved progress or creates a blank cell array.

### Layout Hierarchy

```
View (container, flex: 1, bg: theme.bg)
  └─ GestureDetector (wraps the board area)
      └─ View (boardArea, flex: 1, centered, overflow: hidden)
          └─ BoardView (Animated.View with transforms)
              └─ CellView × (size * size)
  └─ Toolbar (absolute positioned, bottom: 48)
  └─ WinBanner (shown on completion)
```

The `overflow: 'hidden'` on `boardArea` clips the board when zoomed out below its natural size or panned beyond view bounds.

---

## Performance Characteristics

1. **Memo on CellView** — `React.memo` prevents re-renders unless props change. Since `row`, `col`, `borders`, `theme`, and `onPress` are stable across taps, re-renders come only from the Zustand subscription.

2. **Shallow Zustand selector** — `useShallow` ensures a cell only re-renders when its specific `value` or `hasError` changes, not on any store update.

3. **Flat array iteration** — no nested `.map()` calls. Single flat iteration over `cellBorders.map()`.

4. **`useMemo` on borders** — `cellBorders` recomputes only when `puzzle` object changes (new puzzle loaded).

5. **Integer keys** — `key={i}` works because the grid size is fixed per puzzle and cells never reorder.

6. **No virtualization** — all cells render at once. For the typical grid sizes (5x5 to 10x10 = 25 to 100 cells), this is fine. Would not scale to very large grids.

---

## Potential Issues / Quirks

1. **No pan bounds** — panning is unrestricted. The user can pan the board entirely off-screen with no spring-back.

2. **Light mode visual distinction** — region and inner borders are both `#000000` in light mode. The only visual distinction is the weight difference (1.5 vs 0.5). In dark mode, there's also a color difference.

3. **No region coloring** — all cells have the same `cellBg` regardless of region. Regions are communicated purely through border weight/color.

4. **Transform order** — `[translateX, translateY, scale]` means translation happens before scaling. Panning 100px and then scaling 2x will show a 200px visual offset from center, which can feel unintuitive during simultaneous gestures.
