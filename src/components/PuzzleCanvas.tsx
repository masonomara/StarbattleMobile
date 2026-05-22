import React, { useImperativeHandle, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import {
  Canvas,
  Path,
  Skia,
} from '@shopify/react-native-skia';
import type { Puzzle } from '../types/puzzle';
import type { CellValue, DrawLayerHandle } from '../types/state';
import type { Theme } from '../hooks/useTheme';

const REGION_COLORS_LIGHT = [
  '#E8EAF6', '#E3F2FD', '#E8F5E9', '#FFF8E1', '#FCE4EC', '#F3E5F5',
  '#E0F7FA', '#FBE9E7', '#F9FBE7', '#EDE7F6', '#E0F2F1', '#FFF3E0',
];
const REGION_COLORS_DARK = [
  '#283593', '#1565C0', '#2E7D32', '#F9A825', '#AD1457', '#6A1B9A',
  '#00838F', '#BF360C', '#827717', '#4527A0', '#00695C', '#E65100',
];

const NUM_COLORS = REGION_COLORS_LIGHT.length;

// Static background — region fills, grid lines, region borders.
// Wrapped in React.memo so it never re-renders during gameplay;
// only rebuilds when the puzzle or theme changes.
const BackgroundCanvas = React.memo(function BackgroundCanvas({
  puzzle,
  theme,
  canvasSize,
  coloredRegions,
}: {
  puzzle: Puzzle;
  theme: Theme;
  canvasSize: number;
  coloredRegions: boolean;
}) {
  const { size, regions } = puzzle;
  const cs = canvasSize / size;
  const regionColors = theme.isDark ? REGION_COLORS_DARK : REGION_COLORS_LIGHT;

  const regionFillPaths = useMemo(() => {
    const builders = new Map<number, ReturnType<typeof Skia.PathBuilder.Make>>();
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const colorIdx = regions[row][col] % NUM_COLORS;
        if (!builders.has(colorIdx)) {
          builders.set(colorIdx, Skia.PathBuilder.Make());
        }
        builders.get(colorIdx)!.addRect(Skia.XYWHRect(col * cs, row * cs, cs, cs));
      }
    }
    return [...builders.entries()].map(([colorIdx, b]) => ({
      colorIdx,
      path: b.detach(),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, canvasSize]);

  const regionBorderPath = useMemo(() => {
    const rb = Skia.PathBuilder.Make();
    for (let row = 0; row <= size; row++) {
      for (let col = 0; col < size; col++) {
        const isBoundary = row > 0 && row < size && regions[row - 1][col] !== regions[row][col];
        if (isBoundary) {
          rb.moveTo(col * cs, row * cs);
          rb.lineTo((col + 1) * cs, row * cs);
        }
      }
    }
    for (let row = 0; row < size; row++) {
      for (let col = 0; col <= size; col++) {
        const isBoundary = col > 0 && col < size && regions[row][col - 1] !== regions[row][col];
        if (isBoundary) {
          rb.moveTo(col * cs, row * cs);
          rb.lineTo(col * cs, (row + 1) * cs);
        }
      }
    }
    return rb.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, canvasSize]);

  const innerGridPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (let i = 1; i < size; i++) {
      b.moveTo(i * cs, 0);
      b.lineTo(i * cs, canvasSize);
      b.moveTo(0, i * cs);
      b.lineTo(canvasSize, i * cs);
    }
    return b.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, canvasSize]);

  return (
    <Canvas style={{ width: canvasSize, height: canvasSize }}>
      {regionFillPaths.map(({ colorIdx, path }) => (
        <Path
          key={`region-${colorIdx}`}
          path={path}
          color={coloredRegions ? regionColors[colorIdx] : theme.bg}
        />
      ))}
      <Path path={innerGridPath} color={theme.innerBorder} style="stroke" strokeWidth={1} />
      <Path path={regionBorderPath} color={theme.regionBorder} style="stroke" strokeWidth={3} strokeCap="square" strokeJoin="miter" />
    </Canvas>
  );
});

type PuzzleCanvasProps = {
  puzzle: Puzzle;
  cells: CellValue[];
  errorCells: Set<number>;
  hintGhosts: Map<number, 'star' | 'mark'>;
  theme: Theme;
  canvasSize: number;
};

const BORDER = 3;

export const PuzzleCanvas = React.forwardRef<DrawLayerHandle, PuzzleCanvasProps>(
  function PuzzleCanvas({
    puzzle,
    cells,
    errorCells,
    hintGhosts,
    theme,
    canvasSize,
  }, drawLayerRef) {
    const { size } = puzzle;
    const cs = canvasSize / size;
    const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
    const totalSize = canvasSize + BORDER * 2;

    const [previewMap, setPreviewMap] = useState<Map<number, CellValue>>(new Map());

    useImperativeHandle(drawLayerRef, () => ({
      addCell(idx, value) {
        setPreviewMap(prev => new Map(prev).set(idx, value));
      },
      reset() {
        setPreviewMap(new Map());
      },
    }));

    const outerBorderPath = useMemo(() => {
      const b = Skia.PathBuilder.Make();
      const hw = BORDER / 2;
      b.moveTo(0, hw); b.lineTo(totalSize, hw);
      b.moveTo(0, totalSize - hw); b.lineTo(totalSize, totalSize - hw);
      b.moveTo(hw, 0); b.lineTo(hw, totalSize);
      b.moveTo(totalSize - hw, 0); b.lineTo(totalSize - hw, totalSize);
      return b.detach();
    }, [totalSize]);

    // Rebuilt on stroke end (cells changes) or preview update — only 4 paths, O(n) loop
    const dynamicPaths = useMemo(() => {
      const r = cs * 0.3;
      const half = cs * 0.22;

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
          const b = isGhost ? starGhost : errorCells.has(idx) ? starError : starNormal;
          b.addOval(Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2));
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
        <Canvas style={{ position: 'absolute', top: 0, left: 0, width: totalSize, height: totalSize }}>
          <Path path={outerBorderPath} color={theme.regionBorder} style="stroke" strokeWidth={BORDER} strokeCap="square" strokeJoin="miter" />
        </Canvas>
        <View style={{ position: 'absolute', top: BORDER, left: BORDER, width: canvasSize, height: canvasSize }}>
          <BackgroundCanvas puzzle={puzzle} theme={theme} canvasSize={canvasSize} coloredRegions={coloredRegions} />
          <Canvas style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Path path={dynamicPaths.starNormal} color={theme.regionBorder} />
            <Path path={dynamicPaths.starError} color="#E53935" />
            <Path path={dynamicPaths.starGhost} color={theme.regionBorder + '55'} />
            <Path path={dynamicPaths.marks} color={theme.markColor} style="stroke" strokeWidth={2} strokeCap="round" />
          </Canvas>
        </View>
      </View>
    );
  },
);
