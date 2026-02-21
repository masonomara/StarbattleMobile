import React, { memo } from 'react';
import Svg, { Line } from 'react-native-svg';
const REGION_BORDER_WIDTH = 3;
import type { Theme } from '../types/theme';

type Props = {
  size: number;
  regions: number[][];
  theme: Theme;
};

type Segment = { x1: number; y1: number; x2: number; y2: number };

function buildSegments(size: number, regions: number[][], cellSize: number): Segment[] {
  const segs: Segment[] = [];

  for (let row = 0; row <= size; row++) {
    for (let col = 0; col < size; col++) {
      const isEdge = row === 0 || row === size;
      const isBoundary = !isEdge && regions[row - 1][col] !== regions[row][col];

      if (isEdge || isBoundary) {
        segs.push({
          x1: col * cellSize,
          y1: row * cellSize,
          x2: (col + 1) * cellSize,
          y2: row * cellSize,
        });
      }
    }
  }

  for (let row = 0; row < size; row++) {
    for (let col = 0; col <= size; col++) {
      const isEdge = col === 0 || col === size;
      const isBoundary = !isEdge && regions[row][col - 1] !== regions[row][col];

      if (isEdge || isBoundary) {
        segs.push({
          x1: col * cellSize,
          y1: row * cellSize,
          x2: col * cellSize,
          y2: (row + 1) * cellSize,
        });
      }
    }
  }

  return segs;
}

export const RegionBordersSvg = memo(function RegionBordersSvg({
  size,
  regions,
  theme,
}: Props) {
  const boardPx = theme.cellSize * size;
  const half = REGION_BORDER_WIDTH / 2;
  const segments = buildSegments(size, regions, theme.cellSize);

  return (
    <Svg
      width={boardPx + REGION_BORDER_WIDTH}
      height={boardPx + REGION_BORDER_WIDTH}
      viewBox={`${-half} ${-half} ${boardPx + REGION_BORDER_WIDTH} ${boardPx + REGION_BORDER_WIDTH}`}
      style={{ position: 'absolute', top: -half, left: -half }}
      pointerEvents="none"
    >
      {segments.map((seg, i) => (
        <Line
          key={i}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke={theme.regionBorder}
          strokeWidth={REGION_BORDER_WIDTH}
          strokeLinecap="square"
        />
      ))}
    </Svg>
  );
});
