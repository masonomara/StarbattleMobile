import React, { useImperativeHandle, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import type { Puzzle } from '../types/puzzle';
import type { CellValue, DrawLayerHandle } from '../types/state';
import type { Theme } from '../types/theme';
import type { PuzzleCanvasProps } from '../types/components';

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

const NUM_COLORS = REGION_COLORS_LIGHT.length;

type BackgroundCanvasProps = {
  puzzle: Puzzle;
  theme: Theme;
  canvasSize: number;
  borderWidth: number;
  coloredRegions: boolean;
};

// Memoized so it never re-renders during gameplay — only when puzzle or theme changes.
const BackgroundCanvas = React.memo(function BackgroundCanvas({
  puzzle,
  theme,
  canvasSize,
  borderWidth,
  coloredRegions,
}: BackgroundCanvasProps) {
  const { size, regions } = puzzle;
  const cs = canvasSize / size;
  const bw = borderWidth;
  const totalSize = canvasSize + bw * 2;
  const regionColors = theme.isDark ? REGION_COLORS_DARK : REGION_COLORS_LIGHT;

  const regionFillPaths = useMemo(() => {
    const builders = new Map<
      number,
      ReturnType<typeof Skia.PathBuilder.Make>
    >();
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const colorIdx = regions[row][col] % NUM_COLORS;
        if (!builders.has(colorIdx)) {
          builders.set(colorIdx, Skia.PathBuilder.Make());
        }
        builders
          .get(colorIdx)!
          .addRect(Skia.XYWHRect(bw + col * cs, bw + row * cs, cs, cs));
      }
    }
    return [...builders.entries()].map(([colorIdx, b]) => ({
      colorIdx,
      path: b.detach(),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, canvasSize, bw]);

  const regionBorderPath = useMemo(() => {
    const rb = Skia.PathBuilder.Make();
    for (let row = 0; row <= size; row++) {
      for (let col = 0; col < size; col++) {
        const isOuter = row === 0 || row === size;
        const isRegionBoundary =
          !isOuter && regions[row - 1][col] !== regions[row][col];
        if (isOuter || isRegionBoundary) {
          rb.moveTo(bw + col * cs, bw + row * cs);
          rb.lineTo(bw + (col + 1) * cs, bw + row * cs);
        }
      }
    }
    for (let row = 0; row < size; row++) {
      for (let col = 0; col <= size; col++) {
        const isOuter = col === 0 || col === size;
        const isRegionBoundary =
          !isOuter && regions[row][col - 1] !== regions[row][col];
        if (isOuter || isRegionBoundary) {
          rb.moveTo(bw + col * cs, bw + row * cs);
          rb.lineTo(bw + col * cs, bw + (row + 1) * cs);
        }
      }
    }
    return rb.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, canvasSize, bw]);

  const innerGridPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (let i = 1; i < size; i++) {
      b.moveTo(bw + i * cs, bw);
      b.lineTo(bw + i * cs, bw + canvasSize);
      b.moveTo(bw, bw + i * cs);
      b.lineTo(bw + canvasSize, bw + i * cs);
    }
    return b.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, canvasSize, bw]);

  return (
    <Canvas style={{ width: totalSize, height: totalSize }}>
      {regionFillPaths.map(({ colorIdx, path }) => (
        <Path
          key={`region-${colorIdx}`}
          path={path}
          color={coloredRegions ? regionColors[colorIdx] : theme.bg}
        />
      ))}
      <Path
        path={innerGridPath}
        color={theme.innerBorder}
        style="stroke"
        strokeWidth={1}
      />
      <Path
        path={regionBorderPath}
        color={theme.regionBorder}
        style="stroke"
        strokeWidth={3}
        strokeCap="square"
        strokeJoin="miter"
      />
    </Canvas>
  );
});

const BORDER = 3;

// forwardRef exposes DrawLayerHandle so the gesture responder can write preview
// strokes in real time without committing them to the Zustand store mid-drag.
export const PuzzleCanvas = React.forwardRef<
  DrawLayerHandle,
  PuzzleCanvasProps
>(function PuzzleCanvas(
  { puzzle, cells, errorCells, hintGhosts, theme, canvasSize },
  drawLayerRef,
) {
  const { size } = puzzle;
  const cs = canvasSize / size;
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const totalSize = canvasSize + BORDER * 2;

  const [previewMap, setPreviewMap] = useState<Map<number, CellValue>>(
    new Map(),
  );

  useImperativeHandle(drawLayerRef, () => ({
    addCell(idx, value) {
      setPreviewMap(prev => new Map(prev).set(idx, value));
    },
    reset() {
      setPreviewMap(new Map());
    },
  }));

  // Rebuilt on stroke end or preview update — O(n) over all cells, 4 paths total.
  const dynamicPaths = useMemo(() => {
    const outerR = cs * 0.34;
    const innerR = outerR * 0.46;
    const half = cs * 0.12;

    const starNormal = Skia.PathBuilder.Make();
    const starError = Skia.PathBuilder.Make();
    const starGhost = Skia.PathBuilder.Make();
    const marks = Skia.PathBuilder.Make();

    for (let idx = 0; idx < cells.length; idx++) {
      const value = previewMap.has(idx) ? previewMap.get(idx)! : cells[idx];
      const ghost = hintGhosts.get(idx);
      if (value === 0 && !ghost) continue;

      const row = Math.floor(idx / size);
      const col = idx % size;
      const cx = col * cs + cs / 2;
      const cy = row * cs + cs / 2;

      if (value === 1 || ghost === 'star') {
        const isGhost = ghost === 'star' && value !== 1;
        const b = isGhost
          ? starGhost
          : errorCells.has(idx)
          ? starError
          : starNormal;
        const cyAdj = cy + outerR * 0.02;
        for (let p = 0; p < 10; p++) {
          const angle = (p * Math.PI) / 5 - Math.PI / 2;
          const rad = p % 2 === 0 ? outerR : innerR;
          const x = cx + Math.cos(angle) * rad;
          const y = cyAdj + Math.sin(angle) * rad;
          if (p === 0) b.moveTo(x, y);
          else b.lineTo(x, y);
        }
        b.close();
      } else if (value === 2 || ghost === 'mark') {
        marks.moveTo(cx - half, cy - half);
        marks.lineTo(cx + half, cy + half);
        marks.moveTo(cx + half, cy - half);
        marks.lineTo(cx - half, cy + half);
      }
    }

    return {
      starNormal: starNormal.detach(),
      starError: starError.detach(),
      starGhost: starGhost.detach(),
      marks: marks.detach(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, errorCells, hintGhosts, previewMap, canvasSize]);

  return (
    <View style={{ width: totalSize, height: totalSize }}>
      <BackgroundCanvas
        puzzle={puzzle}
        theme={theme}
        canvasSize={canvasSize}
        borderWidth={BORDER}
        coloredRegions={coloredRegions}
      />
      <Canvas
        style={{
          position: 'absolute',
          top: BORDER,
          left: BORDER,
          width: canvasSize,
          height: canvasSize,
        }}
      >
        <Path path={dynamicPaths.starNormal} color={theme.regionBorder} />
        <Path path={dynamicPaths.starError} color="#E53935" />
        <Path path={dynamicPaths.starGhost} color={theme.regionBorder + '55'} />
        <Path
          path={dynamicPaths.marks}
          color={theme.markColor}
          style="stroke"
          strokeWidth={2}
          strokeCap="round"
        />
      </Canvas>
    </View>
  );
});
