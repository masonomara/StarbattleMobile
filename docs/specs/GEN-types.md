# Types

All TypeScript types for the app. Single source of truth — other specs reference these, not the other way around.

---

## Puzzle & Pack Types

Output of the build pipeline. These define what puzzle files look like when bundled in the app.

### HintStep

One solver cycle's output, pre-computed at build time. The solver runs with `onStep` tracing; each step is diffed against the previous board state to produce a `HintStep`.

```typescript
type Coord = [number, number]; // [row, col]

type HintStep = {
  rule: string; // Rule name from solver, e.g. "Forced Rows"
  level: number; // Rule difficulty level (1-11)
  placements: Coord[]; // Cells that became stars (from "unknown")
  marks: Coord[]; // Cells that became marks (from "unknown")
};
```

Explanation text is NOT stored here. Client-side templates generate explanations from the rule name + changed cells + board structure (decoded from SBN). This keeps data compact (~50 bytes per step) while making client logic trivial — no solver, just string interpolation.

### BundledPuzzle

A single puzzle as stored in a pack file. Everything the app needs to play, validate, and hint.

```typescript
type BundledPuzzle = {
  sbn: string; // SBN string: "{size}x{stars}.{regions}.{metadata}"
  solution: Coord[]; // Star positions for win detection
  hints: HintStep[]; // Pre-computed hint sequence, one per solver cycle
};
```

**Solution format:** Star coordinates only, not the full cell grid. For a 10x10 2-star puzzle, that's 20 `[row, col]` pairs. Win detection checks that the player's star placements match this set exactly.

**Hint ordering:** `hints[0]` is the first deduction the solver makes from a blank board. When the user taps "hint," the app finds the first `HintStep` whose changed cells haven't been filled in yet and shows it.

### PackFile

A puzzle pack as stored in R2 and cached in MMKV.

```typescript
type PackFile = {
  id: string; // "1star-5x5", "intro"
  name: string; // "1-Star 5×5", "Intro Pack"
  version: number; // Incremented when pack is updated; client re-fetches if stale
  free: boolean; // True for free packs, false for paid (post-v1)
  gridSize: number; // Grid dimensions (5, 6, 8, 10, 14)
  stars: number; // Stars per container (1, 2, 3)
  puzzles: BundledPuzzle[]; // The puzzles, ordered by intended play sequence
};
```

`gridSize` and `stars` are redundant with each puzzle's SBN header but included here so the app can display pack info (grid badge, star count) without parsing SBN.

### DailyPuzzle

Daily/weekly/monthly puzzles served individually from R2.

```typescript
type DailyPuzzle = BundledPuzzle; // Same shape, just served as a single puzzle
```

Stored at `daily/{YYYY-MM-DD}.json`, `weekly/{YYYY-WW}.json`, `monthly/{YYYY-MM}.json`.

---

## SBN Format

Existing format, documented here for completeness. Parsing lives in `sieve/src/helpers/notation.ts`.

```text
Format: {size}x{stars}.{regions}.{metadata}
Example: 10x2.AABBCCDDEE...s42d7l4c12

Region encoding: A-Z, one char per cell, row-major order (size² chars total)

Metadata keys:
  s{int} — seed
  d{int} — difficulty (1-100)
  l{int} — maxLevel (highest rule level used, 1-11)
  c{int} — cycles (solver iterations)
  v{int} — version (default: 1)
```

```typescript
type PuzzleStringMetadata = {
  seed?: number;
  difficulty?: number;
  maxLevel?: number;
  cycles?: number;
  version?: number;
};
```

---

## Hint Display Types

Client-side types for rendering hints. The app does NOT run the solver — it reads pre-computed `HintStep` data and formats an explanation string using templates.

### HintContext

Built client-side from a `HintStep` + the decoded board.

```typescript
type HintContext = {
  // From HintStep
  rule: string;
  level: number;
  placements: Coord[];
  marks: Coord[];

  // Derived from board + changed cells
  board: Board; // Decoded from SBN
  size: number;
  stars: number;

  // Container that triggered the deduction (derived from rule name + affected cells)
  containerType?: 'row' | 'col' | 'region';
  containerIndex?: number; // Row/col number (0-indexed) or region ID
  regionName?: string; // Letter label: "A", "B", etc.

  // Counts (derived from board state at hint time)
  unknownsRemaining?: number;
  starsNeeded?: number;
};
```

### ExplanationTemplate

```typescript
type ExplanationTemplate = (ctx: HintContext) => string;

type ExplanationTemplateMap = Record<string, ExplanationTemplate>;
```

### Rule Reference

All 42 rules from `sieve/src/rules/index.ts`. Each rule name is the key into the explanation template map.

#### Level 1: Star Neighbors (1 rule)

| Rule           | Template                                                          |
| -------------- | ----------------------------------------------------------------- |
| Star Neighbors | "Stars can't touch — cells next to a placed star must be marked." |

#### Level 2: Forced Placements (3 rules)

| Rule           | Template                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Forced Rows    | "Row {row} has exactly {starsNeeded} empty cells left for {starsNeeded} stars — they must all be stars."           |
| Forced Columns | "Column {col} has exactly {starsNeeded} empty cells left for {starsNeeded} stars — they must all be stars."        |
| Forced Regions | "Region {regionName} has exactly {starsNeeded} empty cells left for {starsNeeded} stars — they must all be stars." |

#### Level 3: Trivial Marks (3 rules)

| Rule            | Template                                                                                |
| --------------- | --------------------------------------------------------------------------------------- |
| Trivial Rows    | "Row {row} already has all its stars — remaining empty cells must be marked."           |
| Trivial Columns | "Column {col} already has all its stars — remaining empty cells must be marked."        |
| Trivial Regions | "Region {regionName} already has all its stars — remaining empty cells must be marked." |

#### Level 4: Tiling Enumeration (5 rules)

| Rule                   | Template                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Tiling Forced Rows     | "Looking at all possible star arrangements in row {row}, these cells must always be stars."           |
| Tiling Forced Columns  | "Looking at all possible star arrangements in column {col}, these cells must always be stars."        |
| Tiling Forced Regions  | "Looking at all possible star arrangements in region {regionName}, these cells must always be stars." |
| Tiling Adjacency Marks | "No valid star arrangement can use these cells — they'd force two stars to touch."                    |
| Tiling Overhang Marks  | "These cells aren't part of any valid star arrangement in their container."                           |

#### Level 5: Counting Enumeration (2 rules)

| Rule                  | Template                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Counting Mark Rows    | "Counting how stars distribute across regions in row {row} — these cells can't hold stars."    |
| Counting Mark Columns | "Counting how stars distribute across regions in column {col} — these cells can't hold stars." |

#### Level 6: Tiling Pairs (6 rules)

| Rule                          | Template                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Tiling Pair Forced Rows       | "Combining tiling constraints from two containers in row {row} — these cells must be stars."    |
| Tiling Pair Forced Columns    | "Combining tiling constraints from two containers in column {col} — these cells must be stars." |
| Tiling Pair Adjacency Rows    | "Pair analysis in row {row} — these cells would force adjacency violations."                    |
| Tiling Pair Adjacency Columns | "Pair analysis in column {col} — these cells would force adjacency violations."                 |
| Tiling Pair Overhang Rows     | "Pair analysis in row {row} — these cells aren't part of any valid paired arrangement."         |
| Tiling Pair Overhang Columns  | "Pair analysis in column {col} — these cells aren't part of any valid paired arrangement."      |

#### Level 7: Tiling Counting (6 rules)

| Rule                               | Template                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Tiling Counting Mark Rows          | "Combining tiling and counting in row {row} — these cells can't hold stars."             |
| Tiling Counting Mark Columns       | "Combining tiling and counting in column {col} — these cells can't hold stars."          |
| Tiling Counting Forced Rows        | "Combining tiling and counting in row {row} — these cells must be stars."                |
| Tiling Counting Forced Columns     | "Combining tiling and counting in column {col} — these cells must be stars."             |
| Group Tiling Counting Mark Rows    | "Group analysis across multiple regions in row {row} — these cells can't hold stars."    |
| Group Tiling Counting Mark Columns | "Group analysis across multiple regions in column {col} — these cells can't hold stars." |

#### Level 8: Direct Hypotheticals (3 rules)

| Rule                      | Template                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Hypothetical Row Count    | "If a star were here, row {row} couldn't have enough stars — so this cell must be marked."           |
| Hypothetical Column Count | "If a star were here, column {col} couldn't have enough stars — so this cell must be marked."        |
| Hypothetical Region Count | "If a star were here, region {regionName} couldn't have enough stars — so this cell must be marked." |

#### Level 9: Tiling Hypotheticals (3 rules)

| Rule                         | Template                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Hypothetical Row Capacity    | "Trying a star here breaks the tiling in row {row} — this cell must be marked."           |
| Hypothetical Column Capacity | "Trying a star here breaks the tiling in column {col} — this cell must be marked."        |
| Hypothetical Region Capacity | "Trying a star here breaks the tiling in region {regionName} — this cell must be marked." |

#### Level 10: Counting Hypotheticals (2 rules)

| Rule                         | Template                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Hypothetical Counting Row    | "Trying a star here creates an impossible count in row {row} — this cell must be marked."    |
| Hypothetical Counting Column | "Trying a star here creates an impossible count in column {col} — this cell must be marked." |

#### Level 11: Propagated Hypotheticals (8 rules)

| Rule                                    | Template                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Propagated Hypothetical Row Count       | "Assuming a star here and following the chain: row {row} runs out of room. This cell must be marked."           |
| Propagated Hypothetical Column Count    | "Assuming a star here and following the chain: column {col} runs out of room. This cell must be marked."        |
| Propagated Hypothetical Region Count    | "Assuming a star here and following the chain: region {regionName} runs out of room. This cell must be marked." |
| Propagated Hypothetical Row Capacity    | "Assuming a star here and following the chain: row {row} tiling breaks. This cell must be marked."              |
| Propagated Hypothetical Column Capacity | "Assuming a star here and following the chain: column {col} tiling breaks. This cell must be marked."           |
| Propagated Hypothetical Region Capacity | "Assuming a star here and following the chain: region {regionName} tiling breaks. This cell must be marked."    |
| Propagated Hypothetical Counting Row    | "Assuming a star here and following the chain: row {row} counting fails. This cell must be marked."             |
| Propagated Hypothetical Counting Column | "Assuming a star here and following the chain: column {col} counting fails. This cell must be marked."          |

---

## App State Types

Used by MMKV (client), D1 (server), and the sync layer.

### CellStateValue

Compact encoding for storage. Maps to `CellState` from the solver.

```typescript
type CellStateValue = 0 | 1 | 2; // 0 = unknown, 1 = star, 2 = marked

// Encoding/decoding
const CELL_MAP: Record<CellState, CellStateValue> = {
  unknown: 0,
  star: 1,
  marked: 2,
};
const CELL_REVERSE: Record<CellStateValue, CellState> = {
  0: 'unknown',
  1: 'star',
  2: 'marked',
};

// Stored as JSON string: "[0,0,1,2,0,0,2,1,...]"
// For 10x10 grid: 100 values, ~200 bytes
type EncodedCells = string;
```

### PuzzleProgress

One row per user per puzzle.

```typescript
type PuzzleProgress = {
  puzzle_id: string; // "1star-5x5:12", "daily:2025-01-30"
  cells: EncodedCells; // Flattened cell states as JSON string
  time_ms: number; // Elapsed time in milliseconds
  completed: boolean;
  completed_at?: number; // Unix timestamp ms
  hints_used: number; // Total hint taps
  current_hint_index: number; // Index into BundledPuzzle.hints — next hint to show
  updated_at: number; // Unix timestamp ms (for sync conflict resolution)
};
```

`current_hint_index` tracks where the user is in the hint sequence. On each hint tap, the app scans from `current_hint_index` forward to find the first `HintStep` with cells the user hasn't already filled, shows it, and updates the index.

### UserSettings

```typescript
type UserSettings = {
  // Gameplay
  auto_x: boolean;
  highlight_errors: boolean;
  show_timer: boolean;
  show_coordinates: boolean;
  thick_borders: boolean;
  colored_regions: boolean;
  pin_toolbar: boolean;

  // App
  theme: 'light' | 'dark';
  sound: boolean;
  haptics: boolean;

  // Streaks (UTC-based)
  streak_daily: number;
  streak_weekly: number;
  streak_monthly: number;
  last_daily?: string; // "2025-01-30"
  last_weekly?: string; // "2025-05"
  last_monthly?: string; // "2025-01"

  updated_at: number; // Unix timestamp ms
};
```

### SyncPayload

Pushed/pulled between client and server. All fields optional — client sends only what changed.

```typescript
type SyncPayload = {
  settings?: Partial<UserSettings>;
  progress?: Record<string, PuzzleProgress>; // keyed by puzzle_id
  packProgress?: Record<string, number>; // packId -> highest unlocked puzzle index
};
```

### Puzzle ID Format

Stable, human-readable IDs used in both API requests and progress storage.

| Type    | Format               | Example              |
| ------- | -------------------- | -------------------- |
| Library | `{packId}:{index}`   | `"1star-5x5:12"`     |
| Daily   | `daily:{YYYY-MM-DD}` | `"daily:2025-01-30"` |
| Weekly  | `weekly:{YYYY-WW}`   | `"weekly:2025-05"`   |
| Monthly | `monthly:{YYYY-MM}`  | `"monthly:2025-01"`  |

---

## Size Estimates

### Per Puzzle (10x10, 2-star, ~20 solver cycles)

| Component  | Bytes      | Notes                           |
| ---------- | ---------- | ------------------------------- |
| SBN string | ~115       | Board layout + metadata         |
| Solution   | ~120       | 20 star coords as `[[r,c],...]` |
| Hints      | ~1,000     | ~20 steps × ~50 bytes each      |
| **Total**  | **~1,235** |                                 |

### Per Pack (60 puzzles)

| Format                          | Size   | Notes                 |
| ------------------------------- | ------ | --------------------- |
| SBN-only (current spec)         | ~9 KB  | No hints, no solution |
| Bundled (with hints + solution) | ~74 KB | Full app-ready format |

74 KB per pack × 6 free packs = **~444 KB total**. Trivially bundleable in the app binary. Still well under 1 MB even with JSON formatting overhead.

### Smaller Grid Sizes

| Grid  | Stars | Steps | Per Puzzle | 60-Puzzle Pack |
| ----- | ----- | ----- | ---------- | -------------- |
| 5×5   | 1     | ~5    | ~250 B     | ~15 KB         |
| 6×6   | 1     | ~8    | ~400 B     | ~24 KB         |
| 8×8   | 1     | ~12   | ~650 B     | ~39 KB         |
| 10×10 | 2     | ~20   | ~1.2 KB    | ~74 KB         |
| 14×14 | 3     | ~30   | ~2.5 KB    | ~150 KB        |

---

## Example: Bundled Puzzle JSON

A complete 5×5 puzzle as it would appear in a pack file:

```json
{
  "sbn": "5x1.AABBBACBBBACCCDADCCDDADDED.s17d12l3c5",
  "solution": [
    [0, 2],
    [1, 0],
    [2, 4],
    [3, 1],
    [4, 3]
  ],
  "hints": [
    {
      "rule": "Star Neighbors",
      "level": 1,
      "placements": [],
      "marks": [
        [0, 3],
        [0, 4]
      ]
    },
    {
      "rule": "Forced Regions",
      "level": 2,
      "placements": [[0, 2]],
      "marks": []
    },
    {
      "rule": "Star Neighbors",
      "level": 1,
      "placements": [],
      "marks": [
        [0, 1],
        [1, 1],
        [1, 2],
        [1, 3]
      ]
    },
    {
      "rule": "Trivial Rows",
      "level": 3,
      "placements": [],
      "marks": [[0, 0]]
    },
    {
      "rule": "Forced Columns",
      "level": 2,
      "placements": [[1, 0]],
      "marks": []
    }
  ]
}
```
