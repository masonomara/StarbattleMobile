# Board Rendering Refactor — SVG Borders & Icons

## Problems Being Solved

1. **Border doubling** — adjacent cells each draw their shared border, so a region boundary renders at 3px (1.5 + 1.5) instead of 1.5. Inner borders double to 1px (0.5 + 0.5). This creates awkward intersections where region and inner lines meet.
2. **Blurry on zoom** — RN's `Animated.View` transform rasterizes children at their original pixel size, then bitmap-scales. Cell borders get jagged/fuzzy. Lucide icons (even though they use react-native-svg internally) are rendered at fixed dimensions then stretched.
3. **No separation of concerns** — region boundaries and cell grid lines are both implemented as per-cell RN border styles, making it impossible to style them independently.

## Architecture

Replace per-cell RN border styles with three SVG layers, all children of the same `Animated.View` that receives transforms:

```
Animated.View (board container, transforms: translate + scale)
  ├── CellGridSvg        ← SVG underlay: thin inner grid lines
  ├── Pressable cells[]   ← no borders, just bg color + icon content
  │   └── StarIcon / MarkIcon   ← custom SVG components
  └── RegionBordersSvg   ← SVG overlay: thick region boundary paths
```

All three layers share the same coordinate space and scale together. SVG paths remain crisper than RN border rasterization under transform because the anti-aliased vector edges degrade more gracefully than sub-pixel border rendering.

For the icons, we render them at 3x their display size with a matching viewBox, then size the `<Svg>` element to fit the cell. This gives zoom headroom up to 3x before any visible degradation, which covers the practical zoom range (max is 5x but users rarely go past 2–3x on these grid sizes).

---

## Step 1 — `CellGridSvg` component

A single `<Svg>` that draws the thin inner grid lines for the entire board.

**File:** `src/components/CellGridSvg.tsx`

```tsx
import React, { memo } from 'react';
import Svg, { Line } from 'react-native-svg';
import { CELL_SIZE } from '../utils/constants';
import type { Theme } from '../utils/useTheme';

type Props = {
  size: number;
  theme: Theme;
};

export const CellGridSvg = memo(function CellGridSvg({ size, theme }: Props) {
  const boardPx = CELL_SIZE * size;
  const lines: React.ReactElement[] = [];

  // Horizontal lines (skip top edge at y=0 and bottom edge at y=boardPx)
  for (let row = 1; row < size; row++) {
    const y = row * CELL_SIZE;
    lines.push(
      <Line
        key={`h${row}`}
        x1={0}
        y1={y}
        x2={boardPx}
        y2={y}
        stroke={theme.innerBorder}
        strokeWidth={1}
      />,
    );
  }

  // Vertical lines (skip left edge at x=0 and right edge at x=boardPx)
  for (let col = 1; col < size; col++) {
    const x = col * CELL_SIZE;
    lines.push(
      <Line
        key={`v${col}`}
        x1={x}
        y1={0}
        x2={x}
        y2={boardPx}
        stroke={theme.innerBorder}
        strokeWidth={1}
      />,
    );
  }

  return (
    <Svg
      width={boardPx}
      height={boardPx}
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {lines}
    </Svg>
  );
});
```

This draws exactly `(size - 1) * 2` lines — one horizontal and one vertical per inner division. No doubling.

---

## Step 2 — `RegionBordersSvg` component

A single `<Svg>` overlay that traces region boundaries as `<Line>` segments.

**File:** `src/components/RegionBordersSvg.tsx`

The approach: walk every cell edge. For each edge shared between two different regions (or at the board perimeter), draw a single line segment. Each segment is exactly `CELL_SIZE` long.

```tsx
import React, { memo } from 'react';
import Svg, { Line } from 'react-native-svg';
import { CELL_SIZE } from '../utils/constants';
import type { Theme } from '../utils/useTheme';

type Props = {
  size: number;
  regions: number[][];
  theme: Theme;
};

type Segment = { x1: number; y1: number; x2: number; y2: number };

function buildSegments(size: number, regions: number[][]): Segment[] {
  const segs: Segment[] = [];

  // Horizontal edges: between row and row+1 (plus top/bottom board edges)
  for (let row = 0; row <= size; row++) {
    for (let col = 0; col < size; col++) {
      const isEdge = row === 0 || row === size;
      const isBoundary = !isEdge && regions[row - 1][col] !== regions[row][col];

      if (isEdge || isBoundary) {
        segs.push({
          x1: col * CELL_SIZE,
          y1: row * CELL_SIZE,
          x2: (col + 1) * CELL_SIZE,
          y2: row * CELL_SIZE,
        });
      }
    }
  }

  // Vertical edges: between col and col+1 (plus left/right board edges)
  for (let row = 0; row < size; row++) {
    for (let col = 0; col <= size; col++) {
      const isEdge = col === 0 || col === size;
      const isBoundary = !isEdge && regions[row][col - 1] !== regions[row][col];

      if (isEdge || isBoundary) {
        segs.push({
          x1: col * CELL_SIZE,
          y1: row * CELL_SIZE,
          x2: col * CELL_SIZE,
          y2: (row + 1) * CELL_SIZE,
        });
      }
    }
  }

  return segs;
}

export const RegionBordersSvg = memo(function RegionBordersSvg({
  size,
  regions,
  theme,
}: Props) {
  const boardPx = CELL_SIZE * size;
  const segments = buildSegments(size, regions);

  return (
    <Svg
      width={boardPx}
      height={boardPx}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      {segments.map((seg, i) => (
        <Line
          key={i}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke={theme.regionBorder}
          strokeWidth={3}
          strokeLinecap="square"
        />
      ))}
    </Svg>
  );
});
```

Key details:

- `pointerEvents="none"` — the overlay doesn't intercept taps; touches pass through to the `Pressable` cells beneath.
- `strokeLinecap="square"` — line ends extend by half the stroke width, ensuring clean 90-degree corners where segments meet. Without this, there are tiny gaps at intersections.
- Board perimeter is included, replacing the current `outlineWidth` on the board container.

---

## Step 3 — Custom SVG icons

Replace lucide `<Star>` and `<X>` with custom `<Svg>` components that render at higher internal resolution.

**File:** `src/components/icons/StarIcon.tsx`

```tsx
import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
  size: number;
  color: string;
};

// 5-pointed star path at 72x72 viewBox
const STAR_PATH =
  'M36 2.18L44.47 25.1H68.76L49.14 39.9L57.62 62.82L36 48.02L14.38 62.82L22.86 39.9L3.24 25.1H27.53Z';

export const StarIcon = memo(function StarIcon({ size, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72">
      <Path d={STAR_PATH} fill={color} />
    </Svg>
  );
});
```

**File:** `src/components/icons/MarkIcon.tsx`

```tsx
import React, { memo } from 'react';
import Svg, { Line } from 'react-native-svg';

type Props = {
  size: number;
  color: string;
};

export const MarkIcon = memo(function MarkIcon({ size, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line
        x1={6}
        y1={6}
        x2={18}
        y2={18}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <Line
        x1={18}
        y1={6}
        x2={6}
        y2={18}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </Svg>
  );
});
```

The `viewBox` is what makes these scale-clean. The `viewBox="0 0 72 72"` star path is drawn at 72 virtual units regardless of the actual pixel `size`. When the parent scales up via pinch zoom, the SVG re-rasterizes from the path data rather than stretching a bitmap. The higher viewBox resolution gives more path detail for the renderer to work with.

---

## Step 4 — Refactor `CellView`

Strip all border styling. Replace lucide imports with custom icons.

```tsx
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { StarIcon } from './icons/StarIcon';
import { MarkIcon } from './icons/MarkIcon';
import { usePuzzleStore } from '../store';
import { CELL_SIZE, STAR_ICON_SIZE, MARK_ICON_SIZE } from '../utils/constants';
import type { Theme } from '../utils/useTheme';

type Props = {
  row: number;
  col: number;
  theme: Theme;
  onPress: (row: number, col: number) => void;
};

export const CellView = memo(function CellView({
  row,
  col,
  theme,
  onPress,
}: Props) {
  const { value, hasError } = usePuzzleStore(
    useShallow(s => ({
      value: s.cells[row * s.boardSize + col],
      hasError: s.errorCells.has(`${row},${col}`),
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
      {value === 1 && <StarIcon size={STAR_ICON_SIZE} color={starColor} />}
      {value === 2 && (
        <MarkIcon size={MARK_ICON_SIZE} color={theme.markColor} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

Changes from current:

- `borders` prop removed entirely.
- No border width, color, or style properties.
- `StarIcon` replaces lucide `Star`.
- `MarkIcon` replaces lucide `X`.
- `Borders` type import removed.

---

## Step 5 — Refactor `BoardView`

Wire up the SVG layers and remove border computation.

```tsx
import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { CellView } from './CellView';
import { CellGridSvg } from './CellGridSvg';
import { RegionBordersSvg } from './RegionBordersSvg';
import { usePuzzleStore } from '../store';
import type { Puzzle } from '../types/puzzle';
import { CELL_SIZE } from '../utils/constants';
import { useTheme } from '../utils/useTheme';

type Props = {
  puzzle: Puzzle;
  scale: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
};

export function BoardView({ puzzle, scale, translateX, translateY }: Props) {
  const theme = useTheme();
  const tapCell = usePuzzleStore(s => s.tapCell);
  const boardSize = CELL_SIZE * puzzle.size;

  // Build flat array of cell indices (no border data needed)
  const cells: number[] = [];
  for (let i = 0; i < puzzle.size * puzzle.size; i++) {
    cells.push(i);
  }

  return (
    <Animated.View
      style={[
        styles.board,
        {
          width: boardSize,
          height: boardSize,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    >
      <CellGridSvg size={puzzle.size} theme={theme} />

      {cells.map(i => {
        const row = Math.floor(i / puzzle.size);
        const col = i % puzzle.size;
        return (
          <CellView
            key={i}
            row={row}
            col={col}
            theme={theme}
            onPress={tapCell}
          />
        );
      })}

      <RegionBordersSvg
        size={puzzle.size}
        regions={puzzle.regions}
        theme={theme}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    // outlineWidth removed — region borders SVG handles the perimeter
  },
});
```

Changes from current:

- `cellBorders` useMemo deleted entirely.
- `outlineWidth` removed from board style.
- `CellGridSvg` rendered as first child (underlay).
- `RegionBordersSvg` rendered as last child (overlay).
- `CellView` no longer receives `borders` prop.
- `Borders` type import removed.

---

## Step 6 — Update constants & clean up dead code

Add derived icon size constants and remove dead code in `src/utils/constants.ts`:

```ts
// Add (derived from existing ratios)
export const STAR_ICON_SIZE = 24;
export const MARK_ICON_SIZE = 16;

// Remove
export const BORDER_STYLE; // dead — SVGs don't use it
```

Remove `Borders` type from `src/types/puzzle.ts`.

---

## Render Order & Z-Index

```
CellGridSvg    (position: absolute, z behind cells)
Pressable[]    (flow layout via flexWrap, z middle)
RegionBordersSvg (position: absolute, pointerEvents: none, z on top)
```

The SVGs use `position: 'absolute'` so they don't participate in the flex-wrap flow. The cells still flow normally. Region borders render on top of everything so they're never obscured by cell backgrounds.

---

## Files Changed

| File                                  | Action                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `src/components/CellGridSvg.tsx`      | **New**                                                                     |
| `src/components/RegionBordersSvg.tsx` | **New**                                                                     |
| `src/components/icons/StarIcon.tsx`   | **New**                                                                     |
| `src/components/icons/MarkIcon.tsx`   | **New**                                                                     |
| `src/components/BoardView.tsx`        | **Modified** — remove border computation, add SVG layers                    |
| `src/components/CellView.tsx`         | **Modified** — strip border styling, swap icon imports                      |
| `src/utils/constants.ts`              | **Modified** — add `STAR_ICON_SIZE`/`MARK_ICON_SIZE`, remove `BORDER_STYLE` |
| `src/types/puzzle.ts`                 | **Modified** — remove `Borders` type                                        |

---

## Implementation Checklist

### Phase 1 — New SVG components (no existing code touched yet)

These can all be created independently. Nothing breaks because nothing imports them yet.

- [x] **1.1** Create `src/components/icons/StarIcon.tsx`
- [x] **1.2** Create `src/components/icons/MarkIcon.tsx`
- [x] **1.3** Create `src/components/CellGridSvg.tsx`
- [x] **1.4** Create `src/components/RegionBordersSvg.tsx`

### Phase 2 — Update constants

- [x] **2.1** Add `STAR_ICON_SIZE = 24` to `src/utils/constants.ts` (already done by user)
- [x] **2.2** Add `MARK_ICON_SIZE = 16` to `src/utils/constants.ts` (already done by user)
- [x] **2.3** Remove `BORDER_STYLE` from `src/utils/constants.ts`
- [x] **2.4** Remove `STAR_ICON_SIZE_RATIO` from `src/utils/constants.ts` (already done by user)
- [x] **2.5** Remove `MARK_ICON_SIZE_RATIO` from `src/utils/constants.ts` (already done by user)

### Phase 3 — Refactor CellView

- [x] **3.1** Replace `Star`/`X` imports from `lucide-react-native` with `StarIcon`/`MarkIcon` from `./icons/`
- [x] **3.2** Replace ratio imports with `STAR_ICON_SIZE`/`MARK_ICON_SIZE`
- [x] **3.3** Remove `REGION_BORDER_WIDTH`, `INNER_BORDER_WIDTH`, `BORDER_STYLE` imports
- [x] **3.4** Remove `Borders` import from `../types/puzzle`
- [x] **3.5** Remove `borders` from Props type
- [x] **3.6** Strip all border style properties from the Pressable
- [x] **3.7** Update star rendering: `<StarIcon size={STAR_ICON_SIZE} color={starColor} />`
- [x] **3.8** Update mark rendering: `<MarkIcon size={MARK_ICON_SIZE} color={theme.markColor} />`

### Phase 4 — Refactor BoardView

- [x] **4.1** Remove `useMemo` import
- [x] **4.2** Remove `Borders` import from `../types/puzzle`
- [x] **4.3** Remove `REGION_BORDER_WIDTH` import from `../utils/constants`
- [x] **4.4** Add imports for `CellGridSvg` and `RegionBordersSvg`
- [x] **4.5** Delete the entire `cellBorders` useMemo block
- [x] **4.6** Remove `outlineWidth` from board StyleSheet
- [x] **4.7** Add `<CellGridSvg>` as first child of `Animated.View`
- [x] **4.8** Add `<RegionBordersSvg>` as last child of `Animated.View`
- [x] **4.9** Update cell map: remove `borders` prop, iterate over plain indices

### Phase 5 — Clean up types

- [x] **5.1** Remove `Borders` type from `src/types/puzzle.ts`
- [x] **5.2** Verified no other file imports `Borders`

### Phase 6 — Verify

- [x] **6.1** TypeScript compiles with no errors
- [ ] **6.2** iOS build succeeds (manual)
- [ ] **6.3** Visual check: inner grid lines render as thin uniform lines, no doubling (manual)
- [ ] **6.4** Visual check: region borders render as thick lines on top, no gaps at corners (manual)
- [ ] **6.5** Visual check: star and X icons render at correct size and color (manual)
- [ ] **6.6** Tap interaction: cells cycle correctly (manual)
- [ ] **6.7** Zoom test: borders and icons stay crisp (manual)
- [ ] **6.8** Region border overlay doesn't block taps (manual)
- [ ] **6.9** Dark mode: colors match theme (manual)
- [ ] **6.10** Error state: stars with errors show `starErrorColor` (manual)
