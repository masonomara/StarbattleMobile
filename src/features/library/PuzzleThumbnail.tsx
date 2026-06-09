import React, { useMemo } from 'react';
import { PixelRatio } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { rgba } from '../../shared/theme/color';
import {
  buildRegionFillPaths,
  buildRegionBorderPath,
} from '../../shared/lib/skiaHelpers';
import type { PuzzleThumbnailProps } from '../../types';

// Each line renders at a fixed TARGET width so previews match at any size — an
// 80px and a 200px preview (and most grid sizes) show identical line weights.
// The TARGET is then clamped per preview:
//   • capped at CAP_FRAC of the cell size, so a fixed width can't overwhelm the
//     tiny cells of a dense grid in a small thumbnail;
//   • floored at MIN, so a thinned-down line never disappears.
// Tune TARGET to change overall weight. Raise CAP_FRAC to let dense grids keep
// more of the full width. Raise MIN if thin lines vanish on small dense tiles.
// Set CAP_FRAC high (e.g. 1) and MIN low to make TARGET purely fixed everywhere.
const REGION_BORDER_TARGET = 2.4; // px — heavy lines between regions + perimeter
const REGION_BORDER_CAP_FRAC = 0.15; // ≤ 18% of a cell
const REGION_BORDER_MIN = 1.5; // px floor

const GRID_LINE_TARGET = 0.8; // px — light lines between cells inside a region
const GRID_LINE_CAP_FRAC = 0.05; // ≤ 6% of a cell
const GRID_LINE_MIN = 0.5; // px floor

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(v, hi));

export const PuzzleThumbnail = React.memo(function PuzzleThumbnail({
  puzzle,
  size,
  theme,
  coloredRegions,
}: PuzzleThumbnailProps) {
  const { size: gridSize, regions } = puzzle;
  // Previews are sized from fractional widths (streak cards = windowWidth * 0.75,
  // Library cells from a division), so an un-snapped canvas ends at a fractional
  // coordinate. The rasterizer truncates that far edge, clipping the last row /
  // column of cells and the outer border on the bottom and right. Floor the
  // surface down to a whole physical pixel so the entire grid stays inside it;
  // px ≤ size, so the ≤1-physical-pixel slack is an invisible transparent margin.
  const dpr = PixelRatio.get();
  const px = Math.floor(size * dpr) / dpr;
  const cs = px / gridSize;
  const borderW = clamp(
    REGION_BORDER_TARGET,
    REGION_BORDER_MIN,
    cs * REGION_BORDER_CAP_FRAC,
  );
  const gridW = clamp(GRID_LINE_TARGET, GRID_LINE_MIN, cs * GRID_LINE_CAP_FRAC);

  const regionFillPaths = useMemo(() => {
    if (!coloredRegions) return null;
    return buildRegionFillPaths(
      regions,
      gridSize,
      cs,
      theme.regionColors.length,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, px, coloredRegions]);

  const innerGridPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (let i = 1; i < gridSize; i++) {
      b.moveTo(i * cs, 0);
      b.lineTo(i * cs, px);
      b.moveTo(0, i * cs);
      b.lineTo(px, i * cs);
    }
    return b.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, px]);

  const regionBorderPath = useMemo(
    () => buildRegionBorderPath(regions, gridSize, cs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puzzle.id, px],
  );

  const outerBorderPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    b.addRect(
      Skia.XYWHRect(borderW / 2, borderW / 2, px - borderW, px - borderW),
    );
    return b.detach();
  }, [px, borderW]);

  return (
    // pointerEvents="none" prevents the canvas from intercepting taps on its parent list item.
    <Canvas style={{ width: px, height: px }} pointerEvents="none">
      <Path path={outerBorderPath} color={theme.background} style="fill" />
      {coloredRegions &&
        regionFillPaths?.map(({ colorIdx, path }) => (
          <Path
            key={colorIdx}
            path={path}
            color={rgba(theme.regionColors[colorIdx], theme.regionColorAlpha)}
            style="fill"
          />
        ))}
      <Path
        path={innerGridPath}
        color={theme.textSecondary}
        style="stroke"
        strokeWidth={gridW}
        strokeCap="square"
        strokeJoin="miter"
      />
      <Path
        path={regionBorderPath}
        color={theme.text}
        style="stroke"
        strokeWidth={borderW}
        strokeCap="square"
        strokeJoin="miter"
      />
      <Path
        path={outerBorderPath}
        color={theme.text}
        style="stroke"
        strokeWidth={borderW}
        strokeCap="square"
        strokeJoin="miter"
      />
    </Canvas>
  );
});
