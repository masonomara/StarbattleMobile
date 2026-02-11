# Rules Restructure Guide

Reorganize rules into a 3x3 grid: Observations (Direct, Tiling, Confinement) x Techniques (Inference, Enumeration, Hypothetical).

---

## The Grid

```
              Inference     Enumeration     Hypothetical
Direct           1              4               7
Tiling           2              5               8
Confinement      3              6               9
```

Difficulty flows left-to-right (technique complexity) then top-to-bottom (observation complexity). All inferences run before any enumeration. All enumerations run before any hypothetical.

---

## Classification

### Level 1: Direct Inferences

See the raw container state, deduce immediately.

| Current Name | Deduction | What It Does |
|---|---|---|
| Star Neighbors | Mark | Star placed → mark 8 neighbors |
| Trivial Rows | Mark | Row has all stars → mark remaining unknowns |
| Trivial Columns | Mark | Column has all stars → mark remaining unknowns |
| Trivial Regions | Mark | Region has all stars → mark remaining unknowns |
| Forced Rows | Place | Row unknowns = stars needed → place all |
| Forced Columns | Place | Column unknowns = stars needed → place all |
| Forced Regions | Place | Region unknowns = stars needed → place all |

No rename needed. These are clear.

---

### Level 2: Tiling Inferences

Use tiling-derived capacity to make direct deductions. No arrangement listing, no assumptions. Just arithmetic on tiling bounds.

| Current Name | Deduction | What It Does |
|---|---|---|
| Reserved Area Exclusions | Mark | Compute each region's minimum contribution to a line via tiling capacity. If minimums exhaust the line's quota, mark cells from non-contributing regions |

**Currently at level 12.** Misleveled. The technique is pure inference: compute bounds, do arithmetic, check if tight. The tiling observation is used as a capacity oracle, not enumerated over.

The logic: `minContribution = max(0, region.starsNeeded - capacity(region cells outside line))`. Sum the minimums. If sum = line quota, the forced regions account for everything. Mark the rest.

This is the tiling analog of Excluded Areas (which does the same thing but with confinement-detected bounds instead of tiling-computed bounds).

---

### Level 3: Confinement Inferences

Use region-line quota linkage to make direct deductions. A region locked into a line (or overflowing a line) constrains what goes where.

Two sub-patterns: **overcounting** (confined regions claim all the quota) and **undercounting** (a line can't provide all a region needs).

#### Overcounting (confined regions saturate the line)

| Current Name | Rename | Deduction | What It Does |
|---|---|---|---|
| Excluded Rows | **Confinement Saturation (Row)** | Mark | Regions confined to a row account for all its stars → mark cells outside those regions |
| Excluded Columns | **Confinement Saturation (Column)** | Mark | Same for columns |
| Region Confinement (Row) | Keep | Mark | N regions confined to N rows, needing all their stars → mark cells in those rows outside those regions. Generalized overcounting. |
| Region Confinement (Column) | Keep | Mark | Same for columns |
| Line Confinement (Row) | Keep | Mark | N rows touch only N regions, needing all their stars → mark cells in those regions outside those rows. Dual of region confinement. |
| Line Confinement (Column) | Keep | Mark | Same for columns |

#### Undercounting (region overflows the line)

| Current Name | Rename | Deduction | What It Does |
|---|---|---|---|
| Pressured Rows | **Confinement Overflow (Row)** | Place | Row can't provide all of a region's quota → overflow must go outside. If outside capacity = overflow, force those cells. |
| Pressured Columns | **Confinement Overflow (Column)** | Place | Same for columns |

**Rename rationale:**
- "Excluded" and "Pressured" describe the *feel*, not the *mechanism*. "Confinement Saturation" says what's happening (the confinement fills the quota). "Confinement Overflow" says what's happening (the region spills out of the line).
- "Region Confinement" and "Line Confinement" are already well-named.

**All 8 rules are inferences.** They do arithmetic on counts and quotas. None enumerate arrangements. None assume placements. The subset-checking in Region/Line Confinement iterates region combinations but checks a counting condition, not star arrangements.

**Note on Pressured Rows/Columns:** These use `computeTiling` for capacity, but tiling is a measurement tool here, not the driving observation. The insight is confinement overflow. Without the confinement framing (region-line interaction), the rule wouldn't exist. Tiling just makes the capacity estimate tighter.

---

### Level 4: Direct Enumerations

Enumerate all valid star arrangements using direct constraints (adjacency, row/col/region quotas). Deduce from universals (in all → forced) and impossibles (in none → marked).

| Current Name | Deduction | What It Does |
|---|---|---|
| Adjacent Line Analysis | Mark + Place | Combine 2-4 adjacent rows or columns. Enumerate all valid placements respecting per-line quotas, adjacency, and region quotas. Force cells in all placements, mark cells in none. |

**Currently at level 12.** Misleveled. The technique is enumeration. The observation is direct (line quotas, adjacency). The only thing complex about it is the multi-line scope.

---

### Level 5: Tiling Enumerations

Enumerate all minimal 2x2 tilings. Deduce from what holds across all tilings.

| Current Name | Deduction | What It Does |
|---|---|---|
| Tiling Forced Rows | Place | Row's tiling capacity = stars needed → cells with single-coverage in ALL tilings must be stars |
| Tiling Forced Columns | Place | Same for columns |
| Tiling Forced Regions | Place | Same for regions |
| Tiling Adjacency Marks | Mark | Capacity = needed → cells that force adjacent stars in ALL tilings can't be stars |
| Tiling Overhang Marks | Mark | Capacity = needed → non-region cells covered in ALL tilings can't have stars |

No rename needed. The "Tiling" prefix already signals the observation.

---

### Level 6: Confinement Enumerations

Enumerate valid arrangements under confinement constraints.

**Currently empty.** No rules exist here. This is a gap in the solver.

Possible future rule: enumerate all ways confined regions can distribute stars across their lines, find universals. This would be the confinement analog of tiling enumeration.

---

### Level 7: Direct Hypotheticals

Assume a star, check direct container constraints (row/column counts), mark if broken.

| Current Name | Deduction | What It Does |
|---|---|---|
| Hypothetical Row Capacity | Mark | Assume star → check if rows r-1, r, r+1 still have enough cells/capacity for quotas. Uses tiling for capacity but the constraint checked is row quota. |
| Hypothetical Column Capacity | Mark | Same for columns c-1, c, c+1 |

---

### Level 8: Tiling Hypotheticals

Assume a star, check tiling-derived constraints, mark if broken.

| Current Name | Deduction | What It Does |
|---|---|---|
| Hypothetical Region Capacity | Mark | Assume star → check if own region can still fit stars via tiling capacity |
| Adjacent Region Capacity | Mark | Assume star → check if adjacent regions can still fit stars via tiling capacity |
| Hypothetical 2x2 Break | Mark | Assume star → check if star-containing 2x2 tiles still have room |

**Adjacent Region Capacity is currently at level 12.** Misleveled. It's a hypothetical (assume star, check for contradiction). Belongs with the other hypotheticals.

**Note:** Hypothetical Row/Column Capacity (Level 7) also call `computeTiling` internally, but their primary question is "can this row/column fit its quota?" which is a direct container check. Hypothetical Region Capacity's primary question is "can this irregular region fit its stars?" where tiling is essential to the answer (not just a refinement). The distinction: row capacity without tiling still mostly works (just count cells). Region capacity without tiling is much weaker.

---

### Level 9: Confinement Hypotheticals

Assume a star, check confinement-derived constraints, mark if broken.

| Current Name | Deduction | What It Does |
|---|---|---|
| Hypothetical 1xN Break | Mark | Assume star → check if confined-region constraints still have enough cells |
| Hypothetical Free Overflow | Mark | Assume star → check if "free" cells (not in any 1xN or 2x2 constraint) can absorb remaining quota. Uses both confinement and tiling observations. |

---

## Summary of Changes

### Misleveled Rules (currently wrong level)

| Rule | Current Level | Correct Level | Why |
|---|---|---|---|
| Reserved Area Exclusions | 12 | 2 (Tiling Inference) | Pure arithmetic on tiling-derived bounds. No enumeration. |
| Adjacent Line Analysis | 12 | 4 (Direct Enumeration) | Enumerates valid placements. Not a hypothetical. |
| Adjacent Region Capacity | 12 | 8 (Tiling Hypothetical) | Assumes star, checks for contradiction. |

### Rules to Rename

| Current Name | New Name | Why |
|---|---|---|
| Excluded Rows | Confinement Saturation (Row) | Describes mechanism, not feeling |
| Excluded Columns | Confinement Saturation (Column) | Same |
| Pressured Rows | Confinement Overflow (Row) | Describes mechanism: region overflows line |
| Pressured Columns | Confinement Overflow (Column) | Same |

### Level Mapping (old → new)

| Old Level | Old Contents | New Level | New Contents |
|---|---|---|---|
| 0 | Star Neighbors | 1 | Direct Inferences (all 7 rules) |
| 1 | Trivial Marks | 1 | (merged into Direct Inferences) |
| 2 | Forced Placements | 1 | (merged into Direct Inferences) |
| 3 | Excluded Areas | 3 | Confinement Inferences (saturation) |
| 4 | Tiling + Pressured | 3, 5 | Split: Pressured → Confinement Inferences, Tiling → Tiling Enumerations |
| 5 | Region/Line Confinement | 3 | Confinement Inferences (generalized saturation) |
| 12 | Reserved Area, Adjacent Line, Adjacent Region | 2, 4, 8 | Split across three levels |
| 20 | All hypotheticals | 7, 8, 9 | Split by observation type |

### Directory Structure

```
rules/
  01-direct-inferences/
    starNeighbors.ts
    trivialRow.ts
    trivialColumn.ts
    trivialRegion.ts
    forcedRow.ts
    forcedColumn.ts
    forcedRegion.ts

  02-tiling-inferences/
    reservedAreaExclusions.ts

  03-confinement-inferences/
    confinementSaturationRow.ts       (was: excludedRow)
    confinementSaturationColumn.ts    (was: excludedColumn)
    confinementOverflowRow.ts         (was: pressuredRow)
    confinementOverflowColumn.ts      (was: pressuredColumn)
    regionConfinementRow.ts
    regionConfinementColumn.ts
    lineConfinementRow.ts
    lineConfinementColumn.ts

  04-direct-enumerations/
    adjacentLineAnalysis.ts

  05-tiling-enumerations/
    tilingForcedRow.ts
    tilingForcedColumn.ts
    tilingForcedRegion.ts
    tilingAdjacencyMarks.ts
    tilingOverhangMarks.ts

  06-confinement-enumerations/
    (empty - future growth)

  07-direct-hypotheticals/
    hypotheticalRowCapacity.ts
    hypotheticalColumnCapacity.ts

  08-tiling-hypotheticals/
    hypotheticalRegionCapacity.ts
    adjacentRegionCapacity.ts
    hypotheticalTwoByTwoBreak.ts

  09-confinement-hypotheticals/
    hypotheticalOneByNBreak.ts
    hypotheticalFreeOverflow.ts
```

### Gaps Identified

1. **Level 2 (Tiling Inferences)** has only 1 rule. This is the least populated category.
2. **Level 6 (Confinement Enumerations)** is empty. No rule enumerates confinement arrangements for universals.
3. **No hypothetical produces placements.** Every hypothetical tests "assume star → contradiction → mark." The dual ("assume mark → contradiction → place") is never tried.
4. **Level 4 (Direct Enumerations)** has only 1 rule. Most enumeration effort went into tiling.
