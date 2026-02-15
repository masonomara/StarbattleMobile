import React, { memo } from 'react';
import Svg, { Line } from 'react-native-svg';
import { CELL_SIZE } from '../utils/constants';
import type { Theme } from '../utils/useTheme';

type Props = {
  size: number;
  theme: Theme;
};

export const CellGridSvg = memo(function CellGridSvg({ size, theme }: Props) {
  const boardPx = CELL_SIZE * size;
  const lines: React.ReactElement[] = [];

  for (let row = 1; row < size; row++) {
    const y = row * CELL_SIZE;
    lines.push(
      <Line
        key={`h${row}`}
        x1={0}
        y1={y}
        x2={boardPx}
        y2={y}
        stroke={theme.innerBorder}
        strokeWidth={1}
      />,
    );
  }

  for (let col = 1; col < size; col++) {
    const x = col * CELL_SIZE;
    lines.push(
      <Line
        key={`v${col}`}
        x1={x}
        y1={0}
        x2={x}
        y2={boardPx}
        stroke={theme.innerBorder}
        strokeWidth={1}
      />,
    );
  }

  return (
    <Svg
      width={boardPx}
      height={boardPx}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      {lines}
    </Svg>
  );
});
