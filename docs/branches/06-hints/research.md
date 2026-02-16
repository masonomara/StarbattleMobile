# Hints System — Deep Research

## Overview

The hint system is a byproduct of the solver engine (`/sieve/`). The solver doesn't just find solutions — it solves puzzles step-by-step using human-like logical rules, ordered from simple to advanced. Each step is recorded as a "hint" that captures what rule was applied, what it deduced, and where on the board those deductions landed. The entire ordered sequence forms a logical proof that the puzzle has exactly one solution.

---

## How Hints Are Generated

### Pipeline

1. **Generator** (`generator.ts`) creates a random board layout from a seed
2. **Sieve** (`sieve.ts`) filters layouts by passing them through the solver — only boards the solver can fully resolve with its rules become puzzles
3. **Pack-gen** (`pack-gen.ts`) calls `tracePuzzle()`, which re-solves each puzzle with an `onStep` callback that records every rule application
4. Each step is diffed against the previous board state to extract exactly which cells changed

### The trace function (`pack-gen.ts:96-116`)

```
tracePuzzle(puzzle) → BundledPuzzle | null
```

- Starts with a blank board (all cells `"unknown"`)
- Solves via `solve(board, { onStep })`
- On every step, diffs `prevCells` vs `step.cells` to find:
  - **placements**: cells that went from `unknown` → `star`
  - **marks**: cells that went from `unknown` → `marked` (eliminated)
- Packages each step as a `HintStep`

### HintStep shape (what's stored in pack JSON)

```ts
{
  rule: string;        // Human-readable rule name, e.g. "Forced Regions"
  level: number;       // Difficulty tier (1-11)
  placements: Coord[]; // Stars placed by this step
  marks: Coord[];      // Cells eliminated (X'd) by this step
}
```

A puzzle's `hints` array is an ordered list of these steps. Executing them in sequence from an empty board reproduces the full solve.

---

## The Solver Loop

The solver (`solver.ts:109-166`) is a simple priority cascade:

1. Build board analysis (region metadata, star counts, unknown counts, tiling cache, counting flow cache)
2. Check progress — if solved, return; if invalid (contradiction), return null
3. Try rules **in order** from simplest (level 1) to hardest (level 11)
4. The **first** rule that fires (returns `true`, meaning it changed the board) is recorded
5. Loop back to step 1

Key design choice: **only one rule fires per cycle**. The solver always restarts from the simplest rule after any change. This means hints always show the easiest applicable deduction at each step.

### Board states

Each cell is one of three states:

- `"unknown"` — no determination yet (blank)
- `"star"` — star placed here
- `"marked"` — eliminated, cannot be a star (X)

---

## Rule Catalog

38 rules across 11 difficulty levels. Every rule takes `(board, cells, analysis)` and returns `boolean` (whether it changed the board). Rules mutate `cells` directly.

### Level 1: Star Neighbors

**1 rule.** The most basic deduction.

| Rule           | Action                                                                         |
| -------------- | ------------------------------------------------------------------------------ |
| Star Neighbors | Mark all 8 neighbors of every placed star (stars can't touch, even diagonally) |

This fires after every star placement. It's the cleanup step.

### Level 2: Forced Placements

**3 rules.** When a row/column/region needs N more stars and has exactly N unknown cells remaining — those cells must all be stars.

| Rule           | Scope                           |
| -------------- | ------------------------------- |
| Forced Rows    | Row has `unknowns == needed`    |
| Forced Columns | Column has `unknowns == needed` |
| Forced Regions | Region has `unknowns == needed` |

### Level 3: Trivial Marks

**3 rules.** When a row/column/region already has all its required stars — mark every remaining unknown cell in that container.

| Rule            | Scope                             |
| --------------- | --------------------------------- |
| Trivial Rows    | Row has `starsPlaced == stars`    |
| Trivial Columns | Column has `starsPlaced == stars` |
| Trivial Regions | Region has `starsPlaced == stars` |

### Level 4: Tiling Enumeration

**5 rules.** Uses a **tiling** system based on 2x2 blocks. The idea: stars can't be adjacent, so every valid star placement must be "separated" by tiles. The solver enumerates all possible 2x2 tile coverings of a region's unknown cells using DLX (Dancing Links exact cover), then:

- **Tiling Forced** (3 rules): If a cell must contain a star in _every_ valid tiling, place it. Applied to rows, columns, and regions.
- **Tiling Adjacency Marks**: If a cell can _never_ hold a star in any valid tiling+star-assignment, mark it.
- **Tiling Overhang Marks**: If every valid tiling of a region's unknowns forces a 2x2 tile to extend outside the region into the same cell, that outside cell gets marked (the "overhang" is always blocked).

**How tiling works** (`tiling.ts`):

- Takes a set of coordinates (unknown cells in a container)
- Enumerates all possible 2x2 blocks that overlap those cells
- Uses DLX to find all minimal exact covers (each cell covered by exactly one 2x2 block)
- `capacity` = minimum number of tiles needed = maximum stars that can fit
- `forcedCells` = cells that are alone in their tile across all minimal covers (must be stars)

### Level 5: Counting Enumeration

**2 rules.** Uses **max-flow** (Dinic's algorithm) to find tight constraints between rows/columns and regions.

| Rule                  | Scope                   |
| --------------------- | ----------------------- |
| Counting Mark Rows    | Row-based tight sets    |
| Counting Mark Columns | Column-based tight sets |

**How counting works** (`counting.ts`):

- Builds a flow network: Source → Lines (capacity = stars needed) → Regions (capacity = unknowns in that line) → Sink (capacity = region's stars needed)
- Runs max-flow, then extracts **tight sets** via Dulmage-Mendelsohn / Tarjan SCC decomposition
- A tight set is a group of lines whose total star demand exactly equals the supply from their touching regions
- When a region's full contribution is consumed by a tight set, its cells _outside_ that set can be marked

### Level 6: Tiling Pairs

**6 rules.** Applies tiling analysis to **pairs of adjacent rows or columns** (combined into one strip). The same three operations as level 4 (forced, adjacency, overhang) but on 2-line strips instead of single containers.

| Rule                             | Action                                      |
| -------------------------------- | ------------------------------------------- |
| Tiling Pair Forced Row/Column    | Place stars forced in paired-line tiling    |
| Tiling Pair Adjacency Row/Column | Mark cells impossible in paired-line tiling |
| Tiling Pair Overhang Row/Column  | Mark overhang cells from paired-line tiling |

### Level 7: Tiling Counting

**6 rules.** Combines tiling capacity with counting constraints. For a group of lines, computes the **minimum contribution** each region must make to that group (based on tiling capacity of the region's cells _outside_ the group). When the sum of minimums equals the group's total need, the constraint is tight.

| Rule                                  | Action                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| Tiling Counting Mark Row/Column       | Mark region cells inside a tight group when the region's minimum contribution is 0 |
| Tiling Counting Forced Row/Column     | Force-place when a region's minimum contribution fills the group                   |
| Group Tiling Counting Mark Row/Column | Same but considers multi-line groups (bitmask enumeration up to board size)        |

### Level 8: Direct Hypotheticals

**3 rules.** "What-if" reasoning. For each unknown cell, hypothetically place a star there, apply its neighbor marks, then check if any nearby row/column/region is immediately violated (too few remaining unknowns to meet its quota). If violated, the hypothesis was wrong — mark the cell.

| Rule                      | Scope                                          |
| ------------------------- | ---------------------------------------------- |
| Hypothetical Row Count    | Check rows near the hypothetical star          |
| Hypothetical Column Count | Check columns near the hypothetical star       |
| Hypothetical Region Count | Check regions touched by the hypothetical star |

**No propagation** — these only check the immediate one-step consequence of placing a star and marking its neighbors.

### Level 9: Tiling Hypotheticals

**3 rules.** Same hypothetical framework as level 8, but after marking neighbors, checks whether the **tiling capacity** of remaining cells in nearby rows/columns/regions drops below the needed star count. More powerful than simple counting because tiling can detect adjacency-based impossibilities.

| Rule                         | Scope                   |
| ---------------------------- | ----------------------- |
| Hypothetical Row Capacity    | Tiling check on rows    |
| Hypothetical Column Capacity | Tiling check on columns |
| Hypothetical Region Capacity | Tiling check on regions |

### Level 10: Counting Hypotheticals

**2 rules.** Hypothetically place a star, mark neighbors, then check if the resulting board has a **counting violation** (max-flow on the row-region or column-region network falls short). Detects contradictions invisible to simple local checks.

| Rule                         | Scope                             |
| ---------------------------- | --------------------------------- |
| Hypothetical Counting Row    | Max-flow violation on row axis    |
| Hypothetical Counting Column | Max-flow violation on column axis |

### Level 11: Propagated Hypotheticals

**8 rules.** The deepest reasoning. Hypothetically place a star, then **propagate deterministically** — cascade forced placements and trivial marks until stable. Then check for violations using the same detectors as levels 8-10 (row/column/region counts, tiling capacity, counting flow). Catches contradictions that only emerge after chains of forced deductions.

| Rule                                  | Violation Check                                          |
| ------------------------------------- | -------------------------------------------------------- |
| Propagated Row/Column/Region Count    | Row/col/region overflows or underflows after propagation |
| Propagated Row/Column/Region Capacity | Tiling capacity violation after propagation              |
| Propagated Counting Row/Column        | Max-flow violation after propagation                     |

The propagation loop (`hypotheticals.ts:31-57`):

1. Place hypothetical star + mark its 8 neighbors
2. Scan all rows, columns, regions for forced placements (unknowns == needed) and trivial marks (quota met)
3. For each forced placement, add it as a star and mark _its_ neighbors
4. Repeat until stable or a violation is found
5. If violation → the original hypothesis was wrong → mark the cell

---

## How Hints Map to Difficulty

### SBN metadata

Each puzzle's SBN encodes difficulty metrics in the suffix: `s{seed}d{difficulty}l{maxLevel}c{cycles}`

- **maxLevel**: Highest rule level that was needed (1-11). A puzzle needing only levels 1-3 is easy. Needing level 8+ is hard.
- **cycles**: Total solver iterations. More cycles = more steps = longer logical chain.
- **difficulty**: Normalized 1-100 score. Formula: `raw = maxLevel * 4 + cycles / 4`, then linearly scaled from observed range [20, 60] to [1, 100].

### Practical distribution

- Levels 1-3 only: Beginner puzzles. Straightforward forced placements and eliminations.
- Level 4 (tiling): Intermediate. Requires spatial reasoning about how stars fit in constrained spaces.
- Level 5 (counting): Advanced. Requires understanding cross-container constraints.
- Levels 6-7: Expert. Combines tiling with multi-line reasoning.
- Levels 8-11: Master. Requires hypothetical "what-if" chains of reasoning.

---

## Key Algorithms Under the Hood

### DLX (Dancing Links)

Used by tiling to find all exact covers of a set of cells by 2x2 blocks. Knuth's Algorithm X with doubly-linked list optimization. Explores all possibilities efficiently by covering/uncovering columns.

### Dinic's Max-Flow

Used by counting rules to find tight constraints. Polynomial-time algorithm that finds maximum flow in a bipartite network of lines ↔ regions. The residual graph after max-flow reveals which constraints are tight (via SCC decomposition).

### Tarjan's SCC

Used after max-flow to decompose the residual graph and extract tight sets (Dulmage-Mendelsohn decomposition). Identifies groups of lines and regions with perfectly matched demand and supply.

---

## What a Hint Provides to the Player

Each hint step tells the player:

1. **What rule to apply** — the `rule` name (e.g. "Forced Regions", "Tiling Overhang Marks")
2. **What level of reasoning** — the `level` (1 = trivial, 11 = very hard)
3. **Where to place stars** — the `placements` array (coordinates)
4. **Where to eliminate** — the `marks` array (coordinates)

A hint system could present these progressively:

- **Nudge**: "Try looking at the regions" (just the rule category)
- **Hint**: "Region B has only 1 unknown cell left" (rule + scope)
- **Reveal**: "Place a star at row 2, col 1" (full placement)

---

## Current State in the App

- Hints exist in every pack JSON file as the `hints` array on each `RawPuzzle`
- The `RawPuzzle` type declares `hints?: unknown` — intentionally opaque
- No hint UI exists yet (deferred to Phase 2)
- The data is complete and ready to consume — the solver trace is deterministic and verified

---

## Step Count by Pack (typical ranges)

| Pack         | Grid  | Steps per puzzle |
| ------------ | ----- | ---------------- |
| Intro (5x5)  | 5x5   | 10-19            |
| 1-Star 5x5   | 5x5   | 10-17            |
| 1-Star 6x6   | 6x6   | 13-20            |
| 1-Star 8x8   | 8x8   | 21-28            |
| 2-Star 10x10 | 10x10 | 25-40+           |

Each step produces either placements, marks, or both. A single hint reveals one logical deduction — the smallest atomic step the solver found.

---

## Relevant Files

| File                                     | Role                                                      |
| ---------------------------------------- | --------------------------------------------------------- |
| `sieve/src/solver.ts`                    | Core solver loop, rule cascade, onStep callback           |
| `sieve/src/pack-gen.ts`                  | tracePuzzle(), diffBoards(), encodeSbn(), hint extraction |
| `sieve/src/rules/index.ts`               | All 38 rules registered with names and levels             |
| `sieve/src/rules/01-*/` through `11-*/`  | Individual rule implementations                           |
| `sieve/src/helpers/tiling.ts`            | 2x2 tile exact cover via DLX                              |
| `sieve/src/helpers/counting.ts`          | Max-flow counting, tight set extraction                   |
| `sieve/src/helpers/hypotheticals.ts`     | Hypothetical star placement + propagation                 |
| `sieve/src/helpers/tilingEnumeration.ts` | Star assignment enumeration within tilings                |
| `sieve/src/helpers/tilingPairs.ts`       | Paired-line tiling squeeze loop                           |
| `sieve/src/helpers/tilingCounting.ts`    | Combined tiling + counting tight-set loop                 |
| `sieve/src/helpers/boardAnalysis.ts`     | Board state, region metadata, caches                      |
| `sieve/src/helpers/dlx.ts`               | Dancing Links exact cover solver                          |
| `sieve/src/helpers/neighbors.ts`         | 8-neighbor adjacency, cell key helpers                    |
| `sieve/src/helpers/difficulty.ts`        | Difficulty scoring formula                                |
| `src/types/puzzle.ts`                    | RawPuzzle type (hints?: unknown)                          |
| `packs/*.json`                           | Stored puzzle data with hint arrays                       |
