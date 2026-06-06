import { Skia } from '@shopify/react-native-skia';

export function buildRegionFillPaths(
  regions: number[][],
  size: number,
  cs: number,
  offset = 0,
  numColors = 9,
) {
  const builders = new Map<number, ReturnType<typeof Skia.PathBuilder.Make>>();
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const colorIdx = regions[row][col] % numColors;
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
