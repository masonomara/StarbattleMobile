import React, { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
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
    const builders = new Map<
      number,
      ReturnType<typeof Skia.PathBuilder.Make>
    >();
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const colorIdx = regions[row][col] % theme.regionColors.length;
        if (!builders.has(colorIdx)) {
          builders.set(colorIdx, Skia.PathBuilder.Make());
        }
        builders
          .get(colorIdx)!
          .addRect(Skia.XYWHRect(col * cs, row * cs, cs, cs));
      }
    }
    return [...builders.entries()].map(([colorIdx, b]) => ({
      colorIdx,
      path: b.detach(),
    }));
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

  const regionBorderPath = useMemo(() => {
    const rb = Skia.PathBuilder.Make();
    for (let row = 1; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        if (regions[row - 1][col] !== regions[row][col]) {
          rb.moveTo(col * cs, row * cs);
          rb.lineTo((col + 1) * cs, row * cs);
        }
      }
    }
    for (let row = 0; row < gridSize; row++) {
      for (let col = 1; col < gridSize; col++) {
        if (regions[row][col - 1] !== regions[row][col]) {
          rb.moveTo(col * cs, row * cs);
          rb.lineTo(col * cs, (row + 1) * cs);
        }
      }
    }
    return rb.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, size]);

  const outerBorderPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    b.addRect(
      Skia.XYWHRect(borderW / 2, borderW / 2, size - borderW, size - borderW),
    );
    return b.detach();
  }, [size, borderW]);

  const ink = theme.text;
  const bg = theme.bg;
  const innerInk = theme.textSecondary;

  return (
    // pointerEvents="none" prevents the canvas from intercepting taps on its parent list item.
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Path path={outerBorderPath} color={bg} style="fill" />
      {coloredRegions &&
        regionFillPaths?.map(({ colorIdx, path }) => (
          <Path
            key={colorIdx}
            path={path}
            color={theme.regionColors[colorIdx]}
            style="fill"
          />
        ))}
      <Path
        path={innerGridPath}
        color={innerInk}
        style="stroke"
        strokeWidth={gridW}
        strokeCap="square"
        strokeJoin="miter"
      />
      <Path
        path={regionBorderPath}
        color={ink}
        style="stroke"
        strokeWidth={borderW}
        strokeCap="square"
        strokeJoin="miter"
      />
      <Path
        path={outerBorderPath}
        color={ink}
        style="stroke"
        strokeWidth={borderW}
        strokeCap="square"
        strokeJoin="miter"
      />
    </Canvas>
  );
});
