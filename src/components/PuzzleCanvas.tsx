import React, { useMemo } from 'react';
import {
  Canvas,
  Rect,
  Path,
  Skia,
  Group,
  Circle,
  Line,
} from '@shopify/react-native-skia';
import type { Puzzle } from '../types/puzzle';
import type { CellValue } from '../types/state';
import type { Theme } from '../hooks/useTheme';

const REGION_COLORS_LIGHT = [
  '#E8EAF6',
  '#E3F2FD',
  '#E8F5E9',
  '#FFF8E1',
  '#FCE4EC',
  '#F3E5F5',
  '#E0F7FA',
  '#FBE9E7',
  '#F9FBE7',
  '#EDE7F6',
  '#E0F2F1',
  '#FFF3E0',
];

const REGION_COLORS_DARK = [
  '#283593',
  '#1565C0',
  '#2E7D32',
  '#F9A825',
  '#AD1457',
  '#6A1B9A',
  '#00838F',
  '#BF360C',
  '#827717',
  '#4527A0',
  '#00695C',
  '#E65100',
];

type PuzzleCanvasProps = {
  puzzle: Puzzle;
  cells: CellValue[];
  autoMarks: Set<number>;
  errorCells: Set<number>;
  hintGhosts: Map<number, 'star' | 'mark'>;
  theme: Theme;
  canvasSize: number;
};

export function PuzzleCanvas({
  puzzle,
  cells,
  autoMarks,
  errorCells,
  hintGhosts,
  theme,
  canvasSize,
}: PuzzleCanvasProps) {
  const { size, regions } = puzzle;
  const cellSize = canvasSize / size;
  const regionColors = theme.isDark ? REGION_COLORS_DARK : REGION_COLORS_LIGHT;

  const regionBorderPath = useMemo(() => {
    const path = Skia.Path.Make();
    const inset = 1.5;

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const x = col * cellSize;
        const y = row * cellSize;

        if (col + 1 < size && regions[row][col] !== regions[row][col + 1]) {
          path.moveTo(x + cellSize, y);
          path.lineTo(x + cellSize, y + cellSize);
        }
        if (row + 1 < size && regions[row][col] !== regions[row + 1][col]) {
          path.moveTo(x, y + cellSize);
          path.lineTo(x + cellSize, y + cellSize);
        }
      }
    }
    path.addRect(
      Skia.XYWHRect(inset, inset, canvasSize - inset * 2, canvasSize - inset * 2),
    );
    return path;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, canvasSize]);

  const innerGridPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (let i = 1; i < size; i++) {
      path.moveTo(i * cellSize, 0);
      path.lineTo(i * cellSize, canvasSize);
      path.moveTo(0, i * cellSize);
      path.lineTo(canvasSize, i * cellSize);
    }
    return path;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, canvasSize]);

  return (
    <Canvas style={{ width: canvasSize, height: canvasSize }}>
      {Array.from({ length: size }, (_row, row) =>
        Array.from({ length: size }, (_col, col) => {
          const idx = row * size + col;
          const region = regions[row][col];
          const isError = errorCells.has(idx);
          return (
            <Rect
              key={`bg-${idx}`}
              x={col * cellSize}
              y={row * cellSize}
              width={cellSize}
              height={cellSize}
              color={
                isError
                  ? '#FFE0E0'
                  : regionColors[region % regionColors.length]
              }
            />
          );
        }),
      )}

      <Path
        path={innerGridPath}
        color={theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}
        style="stroke"
        strokeWidth={0.5}
      />

      <Path
        path={regionBorderPath}
        color={theme.isDark ? '#EBEDEF' : '#060607'}
        style="stroke"
        strokeWidth={3}
        strokeJoin="miter"
        strokeCap="square"
      />

      {cells.map((value, idx) => {
        const row = Math.floor(idx / size);
        const col = idx % size;
        const cx = col * cellSize + cellSize / 2;
        const cy = row * cellSize + cellSize / 2;
        const ghost = hintGhosts.get(idx);
        const isAutoMark = autoMarks.has(idx);

        if (value === 1 || ghost === 'star') {
          const r = cellSize * 0.28;
          const isGhost = ghost === 'star';
          return (
            <Circle
              key={idx}
              cx={cx}
              cy={cy}
              r={r}
              color={isGhost ? theme.text + '55' : theme.text}
            />
          );
        }

        if (value === 2 || ghost === 'mark') {
          const half = cellSize * 0.22;
          const isGhost = ghost === 'mark';
          const opacitySuffix = isGhost ? '55' : isAutoMark ? 'AA' : 'FF';
          const c = theme.markColor + opacitySuffix;
          return (
            <Group key={idx}>
              <Line
                p1={{ x: cx - half, y: cy - half }}
                p2={{ x: cx + half, y: cy + half }}
                color={c}
                strokeWidth={2}
                strokeCap="round"
              />
              <Line
                p1={{ x: cx + half, y: cy - half }}
                p2={{ x: cx - half, y: cy + half }}
                color={c}
                strokeWidth={2}
                strokeCap="round"
              />
            </Group>
          );
        }

        return null;
      })}
    </Canvas>
  );
}
