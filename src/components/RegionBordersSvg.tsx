import React, { memo } from 'react';
import Svg, { Line } from 'react-native-svg';
import { CELL_SIZE, REGION_BORDER_WIDTH } from '../utils/constants';
import type { Theme } from '../utils/useTheme';

type Props = {
  size: number;
  regions: number[][];
  theme: Theme;
};

type Segment = { x1: number; y1: number; x2: number; y2: number };

function buildSegments(size: number, regions: number[][]): Segment[] {
  const segs: Segment[] = [];

  for (let row = 0; row <= size; row++) {
    for (let col = 0; col < size; col++) {
      const isEdge = row === 0 || row === size;
      const isBoundary = !isEdge && regions[row - 1][col] !== regions[row][col];

      if (isEdge || isBoundary) {
        segs.push({
          x1: col * CELL_SIZE,
          y1: row * CELL_SIZE,
          x2: (col + 1) * CELL_SIZE,
          y2: row * CELL_SIZE,
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
          x1: col * CELL_SIZE,
          y1: row * CELL_SIZE,
          x2: col * CELL_SIZE,
          y2: (row + 1) * CELL_SIZE,
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
  const boardPx = CELL_SIZE * size;
  const segments = buildSegments(size, regions);

  return (
    <Svg
      width={boardPx}
      height={boardPx}
      style={{ position: 'absolute', top: 0, left: 0 }}
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
