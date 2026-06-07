import { Skia } from '@shopify/react-native-skia';

// Assign a palette slot (0..numColors-1) to every region so that edge-adjacent
// regions get different colors and palette usage stays balanced. This replaces
// the old `regionId % numColors` mapping, which ignored adjacency and so let the
// same color butt up against itself constantly (and wrapped to repeats whenever
// a grid had more than numColors regions).
//
// It's a greedy graph coloring with Welsh–Powell ordering (color the highest-
// degree regions first, since they're the hardest to place). Region maps are
// planar, so the four-color theorem guarantees 4 colors always suffice — with 9
// slots a conflict-free assignment effectively always exists. Among the colors
// not already taken by a neighbor we pick the least-used one, which spreads the
// nine hues evenly across the board instead of leaning on the first few.
//
// Pure and deterministic (no randomness), so the same puzzle always renders the
// same colors and the callers' memoization stays valid.
export function assignRegionColors(
  regions: number[][],
  size: number,
  numColors: number,
): number[] {
  // Region count = highest region id + 1 (ids are dense, 0-based from parsing).
  let maxId = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (regions[row][col] > maxId) maxId = regions[row][col];
    }
  }
  const regionCount = maxId + 1;

  // Build edge-adjacency (4-neighbor). Diagonal regions touch only at a corner,
  // which reads fine even in the same color, so we don't constrain on it —
  // over-constraining could force needless repeats on dense small grids.
  const adj: Set<number>[] = Array.from(
    { length: regionCount },
    () => new Set<number>(),
  );
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const r = regions[row][col];
      if (col + 1 < size) {
        const right = regions[row][col + 1];
        if (right !== r) {
          adj[r].add(right);
          adj[right].add(r);
        }
      }
      if (row + 1 < size) {
        const down = regions[row + 1][col];
        if (down !== r) {
          adj[r].add(down);
          adj[down].add(r);
        }
      }
    }
  }

  // Welsh–Powell ordering: most-constrained (highest-degree) regions first.
  // Stable id tie-break keeps the assignment deterministic across renders.
  const order = Array.from({ length: regionCount }, (_, i) => i).sort(
    (a, b) => adj[b].size - adj[a].size || a - b,
  );

  const colorOf = new Array<number>(regionCount).fill(-1);
  const usage = new Array<number>(numColors).fill(0);

  for (const region of order) {
    const blocked = new Set<number>();
    for (const nb of adj[region]) {
      if (colorOf[nb] !== -1) blocked.add(colorOf[nb]);
    }
    // Least-used color that no neighbor is using → even spread + no clash.
    let best = -1;
    for (let c = 0; c < numColors; c++) {
      if (blocked.has(c)) continue;
      if (best === -1 || usage[c] < usage[best]) best = c;
    }
    // Fallback (shouldn't trigger with 9 slots on a planar map): every slot is
    // blocked, so accept a clash but pick the globally least-used color.
    if (best === -1) {
      for (let c = 0; c < numColors; c++) {
        if (best === -1 || usage[c] < usage[best]) best = c;
      }
    }
    colorOf[region] = best;
    usage[best]++;
  }

  return colorOf;
}

export function buildRegionFillPaths(
  regions: number[][],
  size: number,
  cs: number,
  // numColors comes from the theme's regionColors array (its single source of
  // truth) rather than a hardcoded default, so the two can't drift out of sync.
  numColors: number,
  offset = 0,
) {
  const colorOf = assignRegionColors(regions, size, numColors);
  const builders = new Map<number, ReturnType<typeof Skia.PathBuilder.Make>>();
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const colorIdx = colorOf[regions[row][col]];
      if (!builders.has(colorIdx)) {
        builders.set(colorIdx, Skia.PathBuilder.Make());
      }
      builders
        .get(colorIdx)!
        .addRect(Skia.XYWHRect(offset + col * cs, offset + row * cs, cs, cs));
    }
  }
  return [...builders.entries()].map(([colorIdx, b]) => ({
    colorIdx,
    path: b.detach(),
  }));
}

// includeOuterBorder: BackgroundCanvas draws outer boundary segments as part of
// the region border stroke; PuzzleThumbnail draws the outer rect separately.
export function buildRegionBorderPath(
  regions: number[][],
  size: number,
  cs: number,
  offset = 0,
  includeOuterBorder = false,
) {
  const rb = Skia.PathBuilder.Make();
  for (let row = 0; row <= size; row++) {
    for (let col = 0; col < size; col++) {
      const isOuter = row === 0 || row === size;
      const isRegionBoundary =
        !isOuter && regions[row - 1][col] !== regions[row][col];
      if ((includeOuterBorder && isOuter) || isRegionBoundary) {
        rb.moveTo(offset + col * cs, offset + row * cs);
        rb.lineTo(offset + (col + 1) * cs, offset + row * cs);
      }
    }
  }
  for (let row = 0; row < size; row++) {
    for (let col = 0; col <= size; col++) {
      const isOuter = col === 0 || col === size;
      const isRegionBoundary =
        !isOuter && regions[row][col - 1] !== regions[row][col];
      if ((includeOuterBorder && isOuter) || isRegionBoundary) {
        rb.moveTo(offset + col * cs, offset + row * cs);
        rb.lineTo(offset + col * cs, offset + (row + 1) * cs);
      }
    }
  }
  return rb.detach();
}
