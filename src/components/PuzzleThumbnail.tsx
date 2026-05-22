import React, { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import type { PuzzleThumbnailProps } from '../types/components';

export const PuzzleThumbnail = React.memo(function PuzzleThumbnail({
  puzzle,
  size,
  theme,
}: PuzzleThumbnailProps) {
  const { size: gridSize, regions } = puzzle;
  const cs = size / gridSize;
  const borderW = Math.max(1.5, cs * 0.15);
  const gridW = Math.max(0.5, cs * 0.04);

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
      Skia.XYWHRect(borderW, borderW, size - 2 * borderW, size - 2 * borderW),
    );
    return b.detach();
  }, [size, borderW]);

  const ink = theme.isDark ? '#ffffff' : '#000000';
  const bg = theme.isDark ? '#000000' : '#ffffff';

  return (
    // pointerEvents="none" prevents the canvas from intercepting taps on its parent list item.
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Path path={outerBorderPath} color={bg} style="fill" />
      <Path
        path={innerGridPath}
        color={ink}
        style="stroke"
        strokeWidth={gridW}
        strokeCap="square"
        strokeJoin="miter"
        opacity={0.15}
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
