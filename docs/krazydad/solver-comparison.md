# Solver Comparison: Ours vs. Krazydad

Comparison of our Star Battle solver against Krazydad's solver on the same 1,000 10x10 2-star puzzle set from Krazydad's collection.

## Solve Rates

| | Solved | Stuck | Rate |
|---|:-:|:-:|:-:|
| **Krazydad** | 1,000 | 0 | **100%** |
| **Ours** | 811 | 189 | **81.1%** |

## Technique Comparison

Our solver is organized into 9 levels (Observations x Techniques). Krazydad's solver uses a flat set of named techniques. The table below maps between the two.

### Techniques We Have (Shared)

| Our Rule | Level | Krazydad Equivalent |
|---|:-:|---|
| Forced Row/Column/Region | L1 | "Row/Col/Cage is otherwise cleared" |
| Star Neighbors | L1 | "adjacent to star" |
| Trivial Row/Column/Region | L1 | "Row/Col/Cage is already full of stars" |
| Undercounting Row/Column | L3 | "not in a reserved area formed by (...)" |
| Overcounting Row/Column | L3 | "not in a reserved area formed by (...)" |
| Consumed Line Row/Column | L3 | _(no direct equivalent — implicit in krazydad's confinement logic)_ |
| Consumed Region Row/Column | L3 | _(no direct equivalent)_ |
| Tiling Forced Row/Column/Region | L5 | "Cage contains a trivial shape", "singleton subclump in Cage/Row/Col" |
| Tiling Adjacency Marks | L5 | "it crowds Cage-X (None/subclump)" |
| Tiling Overhang Marks | L5 | "it crowds Cage-X (None/subclump)" |
| Squeeze Forced/Adjacency/Overhang | L5 | "it crowds Row/Col-X (None/subclump)" |
| Hypothetical Row/Column/Region Count | L7 | _(krazydad doesn't use hypotheticals — solves without them)_ |
| Hypothetical Row/Column/Region Capacity | L8 | _(same — not needed by krazydad)_ |
| Hypothetical Undercounting/Overcounting | L9 | _(same — not needed by krazydad)_ |

### Techniques Krazydad Has That We Don't

Identified by fetching all 189 stuck puzzles from Krazydad's solver and classifying every step's reason string. For each stuck puzzle, we found the **first step** that uses a technique we lack — the "unlock" technique.

| Krazydad Technique | Unlock Count | % of Stuck | Description |
|---|:-:|:-:|---|
| **Container cabal** | 89 | 47.1% | N rows/cols fit entirely within N regions (or vice versa). All stars for those regions must be within those rows. Clear region cells outside the rows. |
| **Multi-line crowding** | 68 | 36.0% | Generalized squeeze: take N rows (not just pairs), compute subclump structure of remaining cells, eliminate cells that crowd subclumps below required star count. |
| **Subclump-occupies-line** | 15 | 7.9% | A region's subclump is the only contributor to a line's remaining cells. The line's stars must come from that subclump, so clear other cells in the line. |
| **Subclump-occupies-line (multi)** | 6 | 3.2% | Same as above but across multiple regions forming the subclump. |
| **At-most-N tuplet** | 2 | 1.1% | A line/cage's remaining cells form a tuplet that can hold at most N stars, forcing placement. |
| **Multi-container singleton** | 2 | 1.1% | Singleton subclump detection across multiple containers. |

**7 puzzles** (3.7%) use only techniques we claim to have, suggesting implementation bugs in existing rules.

## Architecture Differences

### How we solve differently

Our solver uses **hypotheticals** (L7-L9) as a general-purpose fallback: assume a cell is a star/mark, propagate, check for contradiction. Krazydad doesn't use hypotheticals at all. Instead, krazydad has a richer set of direct deduction rules.

This matters because:
- Hypotheticals are **slow** — our L8-L9 rules account for ~13s of the 22s total solve time
- Hypotheticals are **shallow** — they only check one assumption deep, so they can't catch deductions that require chaining two novel techniques
- The 6 missing techniques above are all **direct deductions** that krazydad applies without guessing

### What this means

Krazydad solves every puzzle through pure deduction (no bifurcation). We rely on hypotheticals to cover gaps in our deduction rules, but the gaps are too wide for hypotheticals to bridge in 189 cases.

Adding the missing deduction rules would:
1. Increase solve rate from 81% to ~100%
2. Likely reduce solve time (direct rules are faster than hypotheticals)
3. Make the solver more "human-like" in its reasoning

## Implementation Roadmap

### Phase 1: Container Cabal → ~92% solve rate (estimated)

Maps to our empty **Level 6 (Confinement Enumeration)**. Enumerate subsets of N lines, check if they're fully covered by N regions. If so, clear region cells outside those lines.

Krazydad calls this: _"The remaining open squares in N rows fit within the N highlighted regions. These form a container-cabal that must contain all the stars for those regions."_

### Phase 2: Multi-Line Crowding → ~96% solve rate (estimated)

Generalize squeeze rules from pairs to arbitrary N-line groups. Take N rows/cols, compute combined subclump structure, eliminate cells that crowd subclumps.

Krazydad calls this: _"The green cells must contain a star, otherwise the highlighted rows can't hold enough stars."_

### Phase 3: Subclump-Occupies-Line → ~98% solve rate (estimated)

A region's subclump is the only source for a line's remaining stars. Confinement at the subclump level rather than whole-region level.

Krazydad calls this: _"A subclump of Cage-X occupies the rest of Col-Y."_

### Phase 4: Bug Investigation + Long Tail → 100%

- Investigate the 7 puzzles that should be solvable with existing techniques
- Implement at-most-N-tuplet, multi-container-singleton, and subclump-occupies-line-multi if still needed after phases 1-3

## Raw Data

### Our Rule Usage (1,000 puzzles)

| Rule | Level | Fires | Hit Rate | Time |
|---|:-:|:-:|:-:|:-:|
| Star Neighbors | L1 | 9,604 | 98% | 0.10s |
| Forced Columns | L1 | 4,005 | 85% | 0.05s |
| Forced Rows | L1 | 3,955 | 86% | 0.06s |
| Forced Regions | L1 | 2,174 | 85% | 0.02s |
| Tiling Adjacency Marks | L5 | 1,848 | 95% | 0.23s |
| Tiling Overhang Marks | L5 | 1,725 | 89% | 0.15s |
| Tiling Forced Regions | L5 | 1,679 | 84% | 0.91s |
| Undercounted Rows | L3 | 1,503 | 82% | 0.13s |
| Trivial Rows | L1 | 1,484 | 75% | 0.01s |
| Undercounted Columns | L3 | 1,441 | 82% | 0.12s |
| Trivial Columns | L1 | 1,315 | 72% | 0.01s |
| Tiling Forced Columns | L5 | 616 | 46% | 1.33s |
| Tiling Forced Rows | L5 | 583 | 43% | 1.48s |
| Hypothetical Region Count | L7 | 461 | 41% | 0.54s |
| Hypothetical Region Capacity | L8 | 468 | 38% | 2.59s |
| Consumed Line Row | L3 | 399 | 33% | 0.03s |
| Squeeze Forced Rows | L5 | 378 | 28% | 1.06s |
| Squeeze Forced Columns | L5 | 360 | 27% | 1.01s |
| Hypothetical Row Count | L7 | 353 | 29% | 0.46s |
| Consumed Line Column | L3 | 338 | 28% | 0.03s |
| Hypothetical Column Count | L7 | 288 | 25% | 0.41s |
| Hypothetical Undercounting Row | L9 | 285 | 24% | 3.65s |
| Overcounted Rows | L3 | 283 | 26% | 0.11s |
| Overcounted Columns | L3 | 256 | 23% | 0.11s |
| Squeeze Overhang Rows | L5 | 237 | 21% | 0.12s |
| Squeeze Overhang Columns | L5 | 214 | 19% | 0.10s |
| Hypothetical Column Capacity | L8 | 212 | 19% | 1.95s |
| Squeeze Adjacency Rows | L5 | 201 | 19% | 0.20s |
| Hypothetical Undercounting Column | L9 | 197 | 18% | 2.31s |
| Hypothetical Row Capacity | L8 | 197 | 17% | 2.03s |
| Squeeze Adjacency Columns | L5 | 183 | 18% | 0.23s |
| Trivial Regions | L1 | 137 | 12% | 0.01s |
| Consumed Region Row | L3 | 133 | 12% | 0.03s |
| Consumed Region Column | L3 | 111 | 10% | 0.03s |
| Hypothetical Overcounting Row | L9 | 69 | 7% | 0.33s |
| Hypothetical Overcounting Column | L9 | 50 | 5% | 0.25s |

**Total rule time: 22.19s for 1,000 puzzles (24.54s wall clock)**

### Krazydad Technique Usage (189 stuck puzzles only)

| Technique | Have It? | Total Uses |
|---|:-:|:-:|
| adjacent-to-star | Yes | 5,651 |
| line-full | Yes | 2,032 |
| line-forced | Yes | 1,789 |
| crowds-cage-subclump | Yes | 1,599 |
| reserved-area | Yes | 1,234 |
| crowds-single-line-none | Yes | 1,010 |
| crowds-cage-none | Yes | 934 |
| **container-cabal** | **No** | **819** |
| crowds-single-line-subclump | Yes | 771 |
| trivial-shape | Yes | 690 |
| **crowds-multi-line** | **No** | **653** |
| region-forced | Yes | 647 |
| singleton-cage | Yes | 302 |
| singleton-line | Yes | 244 |
| **subclump-occupies-line-multi** | **No** | **178** |
| region-full | Yes | 132 |
| **subclump-occupies-line** | **No** | **107** |
| **at-most-n-tuplet** | **No** | **55** |
| **multi-container-singleton** | **No** | **53** |
