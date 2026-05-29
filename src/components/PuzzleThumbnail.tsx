import React, { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { rgba } from '../themes/ansi';
import {
  buildRegionFillPaths,
  buildRegionBorderPath,
} from '../utils/skiaHelpers';
import type { PuzzleThumbnailProps } from '../types';

export const PuzzleThumbnail = React.memo(function PuzzleThumbnail({
  puzzle,
  size,
  theme,
  coloredRegions,
}: PuzzleThumbnailProps) {
  const { size: gridSize, regions } = puzzle;
  const cs = size / gridSize;
  const borderW = Math.min(cs * 0.18, 3);
  const gridW = Math.min(cs * 0.06, 1);

  const regionFillPaths = useMemo(() => {
    if (!coloredRegions) return null;
    return buildRegionFillPaths(regions, gridSize, cs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, size, coloredRegions]);

  const innerGridPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (let i = 1; i < gridSize; i++) {
      b.moveTo(i * cs, 0);
      b.lineTo(i * cs, size);
      b.moveTo(0, i * cs);
      b.lineTo(size, i * cs);
    }
    return b.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, size]);

  const regionBorderPath = useMemo(
    () => buildRegionBorderPath(regions, gridSize, cs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puzzle.id, size],
  );

  const outerBorderPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    b.addRect(
      Skia.XYWHRect(borderW / 2, borderW / 2, size - borderW, size - borderW),
    );
    return b.detach();
  }, [size, borderW]);

  return (
    // pointerEvents="none" prevents the canvas from intercepting taps on its parent list item.
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
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
