# Helpers Restructure Guide

Reorganize helpers around the three framework dimensions: Observations, Techniques, and Deductions.

---

## Current State

### Observations (how you see the board)

| Observation | Current Helper | What It Does |
|---|---|---|
| Direct | `boardAnalysis.ts` | Row/col star counts, region metadata, unknowns, quotas |
| Direct | `regions.ts` | Raw region coordinate building |
| Direct | `board.ts` | Board validation (region count, min sizes) |
| Direct | `neighbors.ts` | 8-neighbor iteration (adjacency primitive) |
| Tiling | `tiling.ts` | Compute all minimal 2x2 tilings via DLX |
| Tiling | `dlx.ts` | Dancing Links algorithm (internal to tiling) |
| Tiling | `starContaining2x2.ts` | Find guaranteed star-containing 2x2 tiles |
| Confinement | `confinement.ts` | Detect regions confined to single rows/columns |
| Confinement | `oneByN.ts` | Build marked cell sets for hypothetical impact |

### Techniques (how you apply observations)

| Technique | Current Helper | What It Does |
|---|---|---|
| Inference | *nothing* | Every rule does inline if/then logic |
| Enumeration | `compositeAnalysis.ts` (partial) | `enumerateValidPlacements`, `analyzeComposite`, `findExternalForcedCells` |
| Hypothetical | *nothing* | Every hypothetical rule reimplements "assume star -> check -> mark" |

### Deductions (what you output)

| Deduction | Current Helper | What It Does |
|---|---|---|
| Mark | *nothing* | Every rule does `cells[r][c] = "marked"` inline |
| Placement | *nothing* | Every rule does `cells[r][c] = "star"` inline |

---

## Proposed Structure

```
helpers/
  observations/
    direct.ts
    tiling.ts
    confinement.ts
  techniques/
    inference.ts
    enumeration.ts
    hypothetical.ts
  deductions/
    mark.ts
    place.ts
  types.ts
  board.ts
  neighbors.ts
  parsePuzzle.ts
  notation.ts
```

---

## Observations

### `observations/direct.ts`

Container queries. Extracted from `boardAnalysis.ts`.

**Provides:**
- Region metadata (coords, unknowns, stars placed/needed)
- Row/col star counts and available cells
- Row-to-region and col-to-region mappings
- Board progress status (solved/valid/invalid)

**Absorbs:** `boardAnalysis.ts`, `regions.ts`

**Consumed by:** Every rule (this is the base observation layer)

### `observations/tiling.ts`

2x2 tiling computation. Stars occupy 2x2 tiles (derived from no-adjacent-stars rule).

**Provides:**
- `computeTiling(cells, gridSize)` - all minimal tilings, capacity, forced cells
- Tiling cache (keyed by cell set)
- Star-containing 2x2 detection from row/col pair squeezes

**Absorbs:** `tiling.ts`, `dlx.ts`, `starContaining2x2.ts`

**Consumed by:** Tiling rules (level 4), hypothetical 2x2 break (level 20)

### `observations/confinement.ts`

1xN confinement detection. A region locked into a line (or line locked into regions) links quotas.

**Provides:**
- `computeConfinement(analysis)` - regions confined to single rows/columns
- Marked cell set building for hypothetical impact testing

**Absorbs:** `confinement.ts`, `oneByN.ts`

**Consumed by:** Excluded areas (level 3), confinement rules (level 5), pressured placements (level 4), hypothetical 1xN break (level 20)

---

## Techniques

### `techniques/inference.ts`

Container iteration patterns for direct constraint propagation. No guessing involved.

**Provides:**
- `scanContainers(analysis, containerType, condition)` - iterate rows/cols/regions where a condition holds, yield targets
- Standard container checks: "full" (stars = quota), "forced" (unknowns = needed), "overflow" (region can't fit in line)

**Why it matters:** Levels 1-5 all repeat the same pattern: scan containers, check condition, act on targets. The only things that vary are which container type, what condition, and what action. This helper standardizes the scan-check-yield loop so rules only define the condition and action.

**Consumed by:** Trivial marks, forced placements, excluded areas, pressured placements, confinement rules

### `techniques/enumeration.ts`

List all valid arrangements, deduce from universals and impossibles.

**Provides:**
- `enumerateValidPlacements(unknowns, starsNeeded, board, analysis)` - all valid star subsets respecting adjacency and quotas
- `findUniversals(placements)` - cells that appear in ALL valid arrangements (forced stars)
- `findImpossibles(unknowns, placements)` - cells that appear in NO valid arrangement (forced marks)
- `findExternalForcedCells(tilings, compositeSet)` - overhang cells in all tilings

**Absorbs:** Core enumeration logic from `compositeAnalysis.ts`

**Why it matters:** Enumeration is a reusable technique. Currently `compositeAnalysis.ts` mixes enumeration mechanics with composite-specific logic (adjacency graphs, connected components). Splitting them means enumeration can be applied to any cell set, not just composites.

**Consumed by:** Tiling rules, adjacent line analysis, reserved area exclusions, composite analysis

### `techniques/hypothetical.ts`

Single-depth bifurcation. Assume one thing, check for contradiction, deduce if broken.

**Provides:**
```
hypotheticalScan(
  board, cells, analysis,
  check: (row, col, markedSet) => boolean  // returns true if broken
): boolean
```

The runner handles the shared loop:
1. For each unknown cell
2. Build the marked cell set (star + neighbors)
3. Call `check(row, col, markedSet)`
4. If check returns true (broken), mark the cell

Each hypothetical rule becomes just a `check` function.

**Why it matters:** Six rules currently reimplement this loop. The only variation is what constraint they check after assuming a star:
- Row capacity (do adjacent rows still have room?)
- Column capacity (do adjacent columns still have room?)
- Region capacity (does the region still have room?)
- 1xN break (do confinement constraints still hold?)
- 2x2 break (do tiling constraints still hold?)
- Free overflow (can remaining free cells absorb the quota?)

**Consumed by:** All `99-hypothetical*` rules, `adjacentRegionCapacity`

---

## Deductions

### `deductions/mark.ts`

Mark cells as not-a-star.

**Provides:**
- `markCell(cells, row, col)` - mark single cell, return whether it changed
- `markCells(cells, coords)` - mark multiple cells, return whether any changed

**Why it matters:** Centralizes the mutation + change-tracking pattern. Every rule currently does:
```ts
if (cells[r][c] === "unknown") {
  cells[r][c] = "marked";
  changed = true;
}
```
This becomes `changed |= markCell(cells, r, c)`.

### `deductions/place.ts`

Place a star.

**Provides:**
- `placeStar(cells, row, col, size)` - place star + mark all 8 neighbors, return whether it changed

**Why it matters:** Placement currently doesn't auto-mark neighbors. That's handled by `starNeighbors` as a separate level-0 rule that reruns every cycle. If `placeStar()` marks neighbors atomically, `starNeighbors` becomes a redundant pass. Rules that place stars get immediate neighbor-marking for free.

**Design decision:** Whether `starNeighbors` stays as a rule or gets absorbed into `placeStar()` is a separate choice. Even if kept as a rule, having `placeStar()` as a helper standardizes the placement pattern.

---

## Migration Path

### Phase 1: Deductions (lowest risk, highest consistency win)
1. Create `deductions/mark.ts` and `deductions/place.ts`
2. Update all rules to use them instead of inline mutation
3. No behavioral change, just centralized mutation

### Phase 2: Techniques (biggest deduplication win)
1. Create `techniques/hypothetical.ts` with the shared scan loop
2. Refactor all 6 hypothetical rules to pass check functions
3. Create `techniques/enumeration.ts` by extracting from `compositeAnalysis.ts`
4. Create `techniques/inference.ts` for container scanning patterns

### Phase 3: Observations (organizational clarity)
1. Move `tiling.ts`, `dlx.ts`, `starContaining2x2.ts` into `observations/tiling.ts`
2. Move `confinement.ts`, `oneByN.ts` into `observations/confinement.ts`
3. Extract observation logic from `boardAnalysis.ts` into `observations/direct.ts`
4. Update all import paths

---

## What Stays Outside the Framework

These helpers are infrastructure, not framework concepts:

| File | Role |
|---|---|
| `types.ts` | Type definitions |
| `board.ts` | Board validation |
| `neighbors.ts` | Adjacency primitive (used by observations and techniques) |
| `parsePuzzle.ts` | Input parsing |
| `notation.ts` | Serialization format + display helpers |

`neighbors.ts` is a utility consumed by multiple layers. It's not an observation itself, it's a geometric primitive.

`compositeAnalysis.ts` partially survives: the composite-specific logic (adjacency graphs, connected components, `analyzeComposite`) stays as a composite helper or moves to the rules that use it. The generic enumeration logic moves to `techniques/enumeration.ts`.
