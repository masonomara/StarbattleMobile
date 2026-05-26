import React, { useImperativeHandle, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { rgba } from '../themes/ansi';
import type { Puzzle, CellValue, DrawLayerHandle, Theme, PuzzleCanvasProps } from '../types';


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
  const regionColors = theme.regionColors;

  const regionFillPaths = useMemo(() => {
    const builders = new Map<
      number,
      ReturnType<typeof Skia.PathBuilder.Make>
    >();
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const colorIdx = regions[row][col] % regionColors.length;
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
    // regionColors.length is intentionally omitted: buildTheme always constructs
    // regionColors from exactly 6 fixed color slots, so its length is invariant
    // across palettes and theme switches. Paths encode geometry only; colors are
    // applied in JSX below.
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
          color={coloredRegions ? rgba(regionColors[colorIdx], theme.regionColorAlpha) : rgba(theme.isDark ? theme.black : theme.white, 1)}
        />
      ))}
      <Path
        path={innerGridPath}
        color={rgba(theme.isDark ? theme.gray : theme.gray, 1)}
        style="stroke"
        strokeWidth={1.125}
      />
      <Path
        path={regionBorderPath}
        color={rgba(theme.isDark ? theme.white : theme.black, 1)}
        style="stroke"
        strokeWidth={3.375}
        strokeCap="square"
        strokeJoin="miter"
      />
    </Canvas>
  );
});

// Border width shared between BackgroundCanvas (which pads its canvas by BORDER)
// and the draw-layer Canvas (which is inset by BORDER via absolute positioning).
// Both must agree on this value so stars and grid lines align exactly.
const BORDER = 3.375;

// DrawLayerHandle is an imperative ref API (see types.ts) that lets the gesture
// handler push cell preview updates straight to React state inside PuzzleCanvas,
// bypassing the Zustand store. This keeps mid-stroke previews off the global
// state and ensures the canvas re-renders synchronously with each pointer event.
// When the gesture ends, applyDrawStroke() commits the final changes to Zustand,
// and the store update triggers a normal re-render via the `cells` prop.
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

  // Transient in-flight preview cells accumulated during a drag stroke.
  // Merged with `cells` in dynamicPaths so the stroke is visible immediately.
  // Cleared on stroke commit (DrawLayerHandle.reset) to hand control back to
  // the store-driven `cells` prop.
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
        <Path path={dynamicPaths.starNormal} color={rgba(theme.isDark ? theme.white : theme.black, 1)} />
        <Path path={dynamicPaths.starError} color={rgba(theme.red, 1)} />
        <Path path={dynamicPaths.starGhost} color={rgba(theme.isDark ? theme.white : theme.black, 0.33)} />
        <Path
          path={dynamicPaths.marks}
          color={rgba(theme.red, 1)}
          style="stroke"
          strokeWidth={2.25}
          strokeCap="square"
        />
      </Canvas>
    </View>
  );
});
