import React, { useImperativeHandle, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { rgba } from '../themes/ansi';
import {
  buildRegionFillPaths,
  buildRegionBorderPath,
} from '../utils/skiaHelpers';
import type {
  Puzzle,
  CellValue,
  DrawLayerHandle,
  Theme,
  PuzzleCanvasProps,
} from '../types';

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

  // regionColors.length is intentionally omitted from deps: buildTheme always
  // constructs regionColors from a fixed set of color slots, so its length is
  // invariant across palettes and theme switches. Paths encode geometry only.
  const regionFillPaths = useMemo(
    () => buildRegionFillPaths(regions, size, cs, bw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puzzle.id, canvasSize, bw],
  );

  const regionBorderPath = useMemo(
    () => buildRegionBorderPath(regions, size, cs, bw, true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puzzle.id, canvasSize, bw],
  );

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
          color={
            coloredRegions
              ? rgba(regionColors[colorIdx], theme.regionColorAlpha)
              : theme.background
          }
        />
      ))}
      <Path
        path={innerGridPath}
        color={theme.textSecondary}
        style="stroke"
        strokeWidth={1.125}
      />
      <Path
        path={regionBorderPath}
        color={theme.text}
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
// NOTE: BORDER = 3.375 matches the strokeWidth used for regionBorderPath below.
// If either value changes, both must change together. Consider a single constant
// (e.g. REGION_BORDER_WIDTH) shared between the two canvas layers.
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
  // coloredRegions is read from the store rather than passed as a prop because
  // it only affects BackgroundCanvas (static layer) and doesn't influence
  // gesture handling or cell logic in the parent. Keeping it internal reduces
  // prop drilling through PuzzleScreen → PuzzleCanvas → BackgroundCanvas.
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
    // Star polygon geometry — tuned to look balanced at all grid sizes.
    // outerR: distance from center to spike tip (33% of cell width).
    // innerR: distance from center to inner concave vertex (44% of outerR).
    //         Lower ratio = sharper points; 0.44 matches classic 5-point star proportions.
    // half:   half-width of the elimination-mark cross arms.
    const outerR = cs * 0.33;
    const innerR = outerR * 0.44;
    const half = cs * 0.12;

    const starNormal = Skia.PathBuilder.Make();
    const starError = Skia.PathBuilder.Make();
    const starGhost = Skia.PathBuilder.Make();
    const marks = Skia.PathBuilder.Make();
    const marksGhost = Skia.PathBuilder.Make();

    for (let idx = 0; idx < cells.length; idx++) {
      const value = previewMap.has(idx) ? previewMap.get(idx)! : cells[idx];
      const ghost = hintGhosts.get(idx);
      if (value === 0 && !ghost) continue;

      const row = Math.floor(idx / size);
      const col = idx % size;
      const cx = col * cs + cs / 2;
      const cy = row * cs + cs / 2;

      if (value === 1 || ghost === 'star') {
        // Route to the correct path builder:
        //   ghost  → hint overlay (rendered in border color, low contrast)
        //   error  → placed star that violates a constraint (rendered in red)
        //   normal → valid placed star
        const isGhost = ghost === 'star' && value !== 1;
        const b = isGhost
          ? starGhost
          : errorCells.has(idx)
          ? starError
          : starNormal;
        // Tiny downward nudge: stars look optically high without this because
        // the top spike is visually heavier than the flat base of the polygon.
        const cyAdj = cy + outerR * 0.02;
        // Draw a 10-vertex polygon alternating between outerR and innerR to
        // form a 5-pointed star. Starting angle (-π/2) puts the top spike up.
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
        // Elimination mark: two crossed lines (×). Ghost variant uses same
        // low-contrast color as ghost stars so hint overlays look consistent.
        const isGhostMark = ghost === 'mark' && value !== 2;
        const m = isGhostMark ? marksGhost : marks;
        m.moveTo(cx - half, cy - half);
        m.lineTo(cx + half, cy + half);
        m.moveTo(cx + half, cy - half);
        m.lineTo(cx - half, cy + half);
      }
    }

    return {
      starNormal: starNormal.detach(),
      starError: starError.detach(),
      starGhost: starGhost.detach(),
      marks: marks.detach(),
      marksGhost: marksGhost.detach(),
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
        <Path path={dynamicPaths.starNormal} color={theme.text} />
        <Path path={dynamicPaths.starError} color={theme.red} />
        <Path path={dynamicPaths.starGhost} color={theme.border} />
        <Path
          path={dynamicPaths.marks}
          color={theme.red}
          style="stroke"
          strokeWidth={2.25}
          strokeCap="square"
        />
        <Path
          path={dynamicPaths.marksGhost}
          color={theme.border}
          style="stroke"
          strokeWidth={2.25}
          strokeCap="square"
        />
      </Canvas>
    </View>
  );
});
