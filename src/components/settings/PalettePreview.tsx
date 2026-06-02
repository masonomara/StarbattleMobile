import React from 'react';
import Svg, { Rect, Line, Path } from 'react-native-svg';
import { rgba } from '../../themes/ansi';
import type { Theme } from '../../types';

const PREVIEW_GRID = [
  [0, 0, 1, 1],
  [0, 2, 2, 1],
  [3, 2, 2, 1],
  [3, 3, 3, 1],
] as const;

const S = 80;
const N = 4;
const bw = 1.5;
const cs = (S - bw * 2) / N;

type Seg = { x1: number; y1: number; x2: number; y2: number };
const THICK_H: Seg[] = [];
const THICK_V: Seg[] = [];
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    if (r < N - 1 && PREVIEW_GRID[r][c] !== PREVIEW_GRID[r + 1][c]) {
      const y = bw + (r + 1) * cs;
      THICK_H.push({ x1: bw + c * cs, y1: y, x2: bw + (c + 1) * cs, y2: y });
    }
    if (c < N - 1 && PREVIEW_GRID[r][c] !== PREVIEW_GRID[r][c + 1]) {
      const x = bw + (c + 1) * cs;
      THICK_V.push({ x1: x, y1: bw + r * cs, x2: x, y2: bw + (r + 1) * cs });
    }
  }
}

function starPath(cx: number, cy: number, r: number): string {
  const ir = r * 0.38;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : ir;
    pts.push(
      `${i === 0 ? 'M' : 'L'}${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`,
    );
  }
  return pts.join(' ') + 'Z';
}

const STAR = { cx: bw + 2.5 * cs, cy: bw + 0.5 * cs };
const MARK1 = { cx: bw + 3.5 * cs, cy: bw + 1.5 * cs };
const MARK2 = { cx: bw + 0.5 * cs, cy: bw + 3.5 * cs };
const MR = cs * 0.24;

export function PalettePreview({
  paletteTheme,
  coloredRegions,
}: {
  paletteTheme: Theme;
  coloredRegions: boolean;
}) {
  return (
    <Svg width={S} height={S}>
      <Rect x={0} y={0} width={S} height={S} fill={paletteTheme.background} />
      {PREVIEW_GRID.map((row, r) =>
        row.map((regionIdx, c) => (
          <Rect
            key={`${r}-${c}`}
            x={bw + c * cs}
            y={bw + r * cs}
            width={cs}
            height={cs}
            fill={
              coloredRegions
                ? rgba(paletteTheme.regionColors[regionIdx], paletteTheme.regionColorAlpha)
                : paletteTheme.background
            }
          />
        )),
      )}
      {[1, 2, 3].map(i => (
        <React.Fragment key={i}>
          <Line x1={bw} y1={bw + i * cs} x2={S - bw} y2={bw + i * cs} stroke={paletteTheme.textSecondary} strokeWidth={0.5} />
          <Line x1={bw + i * cs} y1={bw} x2={bw + i * cs} y2={S - bw} stroke={paletteTheme.textSecondary} strokeWidth={0.5} />
        </React.Fragment>
      ))}
      {THICK_H.map((l, i) => (
        <Line key={`th${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={paletteTheme.text} strokeWidth={1.5} />
      ))}
      {THICK_V.map((l, i) => (
        <Line key={`tv${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={paletteTheme.text} strokeWidth={1.5} />
      ))}
      <Rect x={bw / 2} y={bw / 2} width={S - bw} height={S - bw} fill="none" stroke={paletteTheme.text} strokeWidth={bw} />
      <Path d={starPath(STAR.cx, STAR.cy, cs * 0.33)} fill={paletteTheme.text} />
      <Line x1={MARK1.cx - MR} y1={MARK1.cy - MR} x2={MARK1.cx + MR} y2={MARK1.cy + MR} stroke={paletteTheme.red} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={MARK1.cx + MR} y1={MARK1.cy - MR} x2={MARK1.cx - MR} y2={MARK1.cy + MR} stroke={paletteTheme.red} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={MARK2.cx - MR} y1={MARK2.cy - MR} x2={MARK2.cx + MR} y2={MARK2.cy + MR} stroke={paletteTheme.red} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={MARK2.cx + MR} y1={MARK2.cy - MR} x2={MARK2.cx - MR} y2={MARK2.cy + MR} stroke={paletteTheme.red} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
