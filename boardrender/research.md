# Board Renderer: Research Report

What this document covers: everything learned from reading every file in `docs/` and `src/`. Written to inform the board renderer implementation (Phase 1, Step 5 of BUILD_ORDER.md).

---

## Where We Are

**Branch:** `feature-boardRender`
**Build phase:** Phase 1, Step 5 — Board Renderer
**What exists:** Solver engine (separate repo), pack generation script, 5 bundled packs, React Native scaffold with placeholder screens.
**What doesn't exist yet:** The board. `PuzzleScreen.tsx` has a dashed border placeholder that says "Board renderer goes here."

The board renderer is the core visual of the entire app. BUILD*ORDER.md says: *"This is the core visual and will take the most iteration. Get it right."\_

---

## The Game: Star Battle

Place stars on a grid so that:

- Each **row** has exactly N stars
- Each **column** has exactly N stars
- Each **region** (irregular shape, color-coded) has exactly N stars
- **No two stars touch** — not even diagonally (the "Two Not Touch" rule)

N varies by puzzle: 1-star puzzles (5x5, 6x6, 8x8) and 2-star puzzles (10x10) are in the current packs. The grid size and star count come from the SBN string.

---

## Data the Renderer Receives

### From navigation params

```typescript
{
  packId: string;
  puzzleIndex: number;
}
```

The screen resolves these to a `PackFile` and `BundledPuzzle`.

<!-- MASON: Why do we have packId and puzzleIndex transposing to PackFile and BundledPuzzle? Isnt that kind of confusing and unneccesary? -->

### PackFile

```typescript
{
  id: string;          // e.g. "intro", "1star-5x5"
  name: string;        // display name
  version: number;
  free: boolean;
  gridSize: number;    // 5, 6, 8, or 10
  stars: number;       // 1 or 2
  puzzles: BundledPuzzle[];
}
```

<!-- MASON: why do ID string rather than somethign useful like a number? -->

### BundledPuzzle

```typescript
{
  sbn: string;             // full SBN string
  solution: Coord[];       // star positions, e.g. [[0,2],[1,4],...]
  hints: HintStep[];       // pre-computed hint chain
}
```

<!-- MASON: as i understand it, every puzzle will be a bundledPuzzle, so can we jsut name it puzzle? -->

### SBN Format

`{size}x{stars}.{regions}.{metadata}`

Example: `5x1.AABBBACCBDDCEEDDEE.s1234.d3.l2.c5`

- **Regions:** One uppercase letter per cell, row-major order. `A` through however many regions exist. For a 5x5 grid, the region string is 25 chars. For 10x10, it's 100 chars.
- **Metadata keys:** `s`=seed, `d`=difficulty, `l`=maxLevel, `c`=cycles. Not needed for rendering — only `size`, `stars`, and `regions` matter.

### Parsing regions from SBN

```
sbn = "5x1.AABBBACCBDDCEEDDEE.s1234.d3.l2.c5"
parts = sbn.split(".")
size = parseInt(parts[0])       // 5
stars = parseInt(parts[0]...)   // 1
regionString = parts[1]         // "AABBBACCBDDCEEDDEE"
```

For cell at `[row, col]`, its region letter is `regionString[row * size + col]`.

### HintStep

```typescript
{
  rule: string;          // rule name, e.g. "region-has-one-placement"
  level: number;         // difficulty level 1-11
  placements: Coord[];   // cells that get stars in this step
  marks: Coord[];        // cells that get X marks in this step
}
```

<!-- MASON: ok, right now the board puzzle is holding the sbn, but i imagined the board being an object that trasnposes and hold all the sbn data - the sn is like a shortcut, the but puzzle ectually exists in the SBN-->

### Coord

```typescript
type Coord = number[]; // [row, col], 0-indexed
```

---

## Cell States

```typescript
type CellState = 'unknown' | 'marked' | 'star';
```

Three states, cycled by tap: `unknown` → `star` → `marked` → `unknown`.

For persistence, cells are encoded as a flat JSON string: `0`=unknown, `1`=star, `2`=marked. Row-major, length = gridSize^2.

---

## What the Board Must Render

### Grid structure

- Square grid, `gridSize x gridSize`
- Thin lines between all cells (gridLine color)
- **Thick borders between cells of different regions** (regionBorder color). This is the visual that defines the puzzle — players identify regions by these borders.
- Outer border around the entire grid

### Cell contents

- **Empty (unknown):** Nothing
- **Star:** A star icon/shape (star color from theme)
- **Mark (X):** An X mark (mark color from theme)

### Regions

- Each cell belongs to a region (letter from SBN)
- Adjacent cells in different regions get a thick border between them
- Regions may optionally have background tinting, but the primary identifier is thick borders

### Theme colors available

From `src/constants/theme.ts`:

```
background, surface, text, textSecondary, border,
gridLine, regionBorder, star, mark,
accent, success, error
```

Both light and dark variants exist. The `useTheme` hook provides the current set.

---

## Grid Sizes to Support

From the bundled packs:
| Pack | Grid | Stars | Puzzles |
|------|------|-------|---------|
| intro | mixed 5/6/8 | 1 | 20 |
| 1star-5x5 | 5 | 1 | 60 |
| 1star-6x6 | 6 | 1 | 60 |
| 1star-8x8 | 8 | 1 | 60 |
| 2star-10x10 | 10 | 2 | 60 |

The intro pack mixes sizes — the renderer must handle variable grid sizes, not assume a fixed one.

---

## Interactions the Board Must Support (Now and Soon)

### Step 6 — Tap-to-cycle (next step after board)

- Tap a cell to cycle: empty → star → X → empty
- Haptic feedback on each state change
- The board renderer needs to be built with tap targets in mind — each cell must be individually tappable

### Step 9 — Win detection

- Compare board state against `solution` coords
- All solution coords have stars, all non-solution coords don't
- Visual/haptic celebration on win

### Step 10 — Undo

- Undo last action. Board state is a stack of cell changes.

### Step 11 — Hints

- Highlight specific cells from `HintStep.placements` and `HintStep.marks`
- May need a visual mode for "hinted" cells vs player-placed cells

### Step 12 — Auto-X

- When a star is placed, automatically X out all orthogonally and diagonally adjacent cells, plus cells that would violate row/column/region constraints
- Board needs to support programmatic cell state changes, not just tap

### Step 19 — Error highlighting

- Show when placed stars violate constraints (touching, too many in row/col/region)
- Board needs constraint-checking capability

### Feature list additions (from 00-feature-list.md)

- **Gesture handling via RNGH** — React Native Gesture Handler
- **Colored regions** — optional region background colors
- **Show coordinates** — row/column labels
- **Thicker borders** setting
- **Toolbar** — floating action button with mode toggles

---

## Architectural Constraints

### From CONTEXT.md

- Types are expected to change — don't over-couple
- Screens are scaffolding — focus is on game UI, not screen UI
- Pack structure is impermanent test data, but puzzles are valid

### From BUILD_ORDER.md

- No server, no auth, no sync, no purchases, no ads in Phase 1
- Works offline on first launch
- Ship bundled JSON assets (~9KB per pack)

### From feature list

- **Local-first state management** — all game state is local
- **MMKV** for persistence (Step 15)
- Board renderer should be a pure visual component that receives state and emits events, not manage its own persistence

---

## Region Border Logic

The critical rendering challenge. For each cell `[r, c]`:

- **Right border thick** if `region[r][c] !== region[r][c+1]` (and `c+1` is in bounds)
- **Bottom border thick** if `region[r][c] !== region[r+1][c]` (and `r+1` is in bounds)
- **Left border thick** if `c === 0` or `region[r][c] !== region[r][c-1]`
- **Top border thick** if `r === 0` or `region[r][c] !== region[r-1][c]`

Outer edges always get thick borders.

To build the region grid from SBN:

```
regionString = sbn.split(".")[1]
for row 0..size-1:
  for col 0..size-1:
    regionGrid[row][col] = regionString[row * size + col]
```

---

## Solver & Hint Architecture (Context Only)

The solver is NOT on device. It runs at build time during pack generation. What ships:

- 42 production rules across 11 difficulty levels
- Rules mimic human logic — no backtracking, no guessing
- Each puzzle's `hints` array is the solver's step-by-step solution
- 999/1000 solve rate; the 1 failure is a known edge case

The renderer doesn't need to know about rules, but it needs to render hint highlighting when hints are shown.

---

## Current Screen Code

`PuzzleScreen.tsx` currently:

1. Gets `packId` and `puzzleIndex` from route params
2. Looks up the pack via `getPackById()`
3. Gets the puzzle at `puzzleIndex`
4. Parses the SBN header for display
5. Shows a dashed-border placeholder where the board goes
6. Shows hint count

The board renderer will replace the placeholder.

---

## What the Board Renderer Component Needs

**Props (minimum):**

- `gridSize: number`
- `regions: string` (the region string from SBN)
- `cellStates: CellState[][]` (current board state, gridSize x gridSize)

**Events:**

- `onCellPress(row: number, col: number)` — tap handler

**Derived internally:**

- Region grid (parsed from region string)
- Border thickness per cell edge
- Cell dimensions (from available width)

**Styling:**

- Theme-aware via `useTheme`
- Responsive to screen width
- Square cells, square grid

---

## Key Decisions for Implementation

1. **Rendering approach:** React Native Views vs Canvas vs SVG. Views are simplest for tap handling and theming. SVG gives more drawing control. Canvas is most performant for large grids but hardest for interaction. Given max grid is 10x10 (100 cells), Views should be sufficient.

2. **Cell sizing:** Grid should fill available width. Cell size = `availableWidth / gridSize`. Grid is always square.

3. **Border rendering:** Two approaches:

   - Per-cell: each cell renders its own borders (some thick, some thin). Simpler logic but doubled borders between adjacent cells.
   - Grid-level: render horizontal and vertical lines as separate elements, varying thickness based on region boundaries. Cleaner visual but more complex layout.

4. **State management:** Board component should be controlled — receives cell states as props, emits tap events. Parent manages state, undo stack, auto-X logic, persistence.

5. **Accessibility:** Cells should have accessibility labels (e.g., "Row 1, Column 2, Region A, empty").

---

## Summary

The board renderer is a grid of tappable cells with:

- Variable sizes (5x5 through 10x10)
- Region borders (thick lines between different regions)
- Three cell states rendered as empty/star/X
- Theme support (light/dark, 12 color tokens)
- Controlled component pattern (props in, events out)

It doesn't manage game logic, persistence, or hints — those come from the parent. It draws the grid, shows cell contents, and reports taps.
