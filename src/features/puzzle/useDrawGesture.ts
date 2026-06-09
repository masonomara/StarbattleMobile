// NOTE: markCell uses usePuzzleStore.getState() imperatively rather than through
// a hook selector to avoid stale closures inside gesture event handlers.
// The gesture callbacks fire outside React's render cycle, so the store must
// be read imperatively at invocation time.
//
// NOTE: Draw strokes only ever write value 2 (mark/X). Stars (value 1) can only
// be placed via tapCell. This constraint is enforced here — applyDrawStroke in
// the store trusts that all changes contain only value 0 or 2. If violated,
// stars placed via applyDrawStroke would bypass win detection (the store's
// applyDrawStroke has no checkWin call; see store.ts for the explicit comment).
import { useCallback, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import { usePuzzleStore } from './puzzleStore';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { Haptics } from 'react-native-nitro-haptics';
import type { CellChange, DrawLayerHandle } from '../../types';

export function useDrawGesture(
  puzzleSize: number,
  cellSize: number,
  savedScale: SharedValue<number>,
  savedTranslateX: SharedValue<number>,
  savedTranslateY: SharedValue<number>,
  boardLayout: React.RefObject<{ width: number; height: number; centerY: number } | null>,
  drawLayerRef: React.RefObject<DrawLayerHandle | null>,
  lastGestureEndRef: React.RefObject<number>,
  onOffCanvasTap?: () => void,
) {
  const strokeChanges = useRef<CellChange[]>([]);
  // Deduplicates cells visited within a single drag stroke so a slow drag that
  // re-enters a cell doesn't toggle it a second time.
  const visitedCells = useRef(new Set<number>());
  // True once the stroke has been committed or aborted — set by onEnd on a clean
  // finish, or by onUpdate when a second pointer arrives (multi-pointer abort).
  // Checked in onUpdate to block stale events after either path. onFinalize
  // resets previewMap unconditionally and then clears this flag.
  const committed = useRef(false);

  const viewToCell = useCallback(
    (x: number, y: number): { row: number; col: number } | null => {
      const layout = boardLayout.current;
      if (!layout || layout.width === 0 || layout.height === 0) return null;

      const sc = savedScale.value;
      const tx = savedTranslateX.value;
      const ty = savedTranslateY.value;
      const boardPixels = cellSize * puzzleSize;

      const relX = x - layout.width / 2;
      const relY = y - layout.centerY;

      const bx = (relX - tx) / sc + boardPixels / 2;
      const by = (relY - ty) / sc + boardPixels / 2;

      const col = Math.floor(bx / cellSize);
      const row = Math.floor(by / cellSize);

      if (row < 0 || row >= puzzleSize || col < 0 || col >= puzzleSize) {
        return null;
      }
      return { row, col };
    },
    [puzzleSize, savedScale, savedTranslateX, savedTranslateY, boardLayout, cellSize],
  );

  // Records a single cell hit during a drag stroke. Only writes a preview to the
  // draw layer (the canvas overlay); the actual store mutation happens in onEnd
  // via applyDrawStroke. Draw mode always writes value 2 (mark), never 1 (star)
  // — stars can only be placed by tapping (tapCell in store.ts).
  const markCell = useCallback((row: number, col: number) => {
    const state = usePuzzleStore.getState();
    const idx = row * state.puzzle!.size + col;

    if (visitedCells.current.has(idx)) return;
    visitedCells.current.add(idx);

    const isErase = state.tapMode === 'erase';

    if (isErase) {
      if (state.cells[idx] === 0) return;
      strokeChanges.current.push({ index: idx, prev: state.cells[idx], next: 0 });
      drawLayerRef.current?.addCell(idx, 0);
    } else {
      if (state.cells[idx] !== 0) return;
      strokeChanges.current.push({ index: idx, prev: 0, next: 2 });
      drawLayerRef.current?.addCell(idx, 2);
    }

    const settings = useSettingsStore.getState().settings;
    if (settings.haptics) Haptics.impact('light');
  }, [drawLayerRef]);

  const drawGesture = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(150)
    .minDistance(0)
    .onStart(e => {
      strokeChanges.current = [];
      visitedCells.current = new Set();
      committed.current = false;

      if (usePuzzleStore.getState().completed || e.numberOfPointers > 1) return;

      // If the user just finished a pinch/pan, their finger is still leaving the
      // screen. Without this guard, the lift-off registers as a draw stroke.
      if (Date.now() - lastGestureEndRef.current < 300) return;

      const cell = viewToCell(e.x, e.y);
      if (cell) markCell(cell.row, cell.col);
    })
    .onUpdate(e => {
      if (committed.current) return;
      if (e.numberOfPointers > 1) {
        drawLayerRef.current?.reset();
        strokeChanges.current = [];
        committed.current = true;
        return;
      }
      if (usePuzzleStore.getState().completed) return;

      const cell = viewToCell(e.x, e.y);
      if (cell) markCell(cell.row, cell.col);
    })
    .onEnd(() => {
      committed.current = true;
      const changes = strokeChanges.current;
      drawLayerRef.current?.reset();
      if (changes.length > 0) {
        usePuzzleStore.getState().applyDrawStroke(changes);
      }
    })
    .onFinalize(() => {
      drawLayerRef.current?.reset();
      strokeChanges.current = [];
      visitedCells.current = new Set();
      committed.current = false;
    });

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .maxDuration(300)
    .onEnd(e => {
      const state = usePuzzleStore.getState();
      if (state.completed) return;
      const cell = viewToCell(e.x, e.y);
      if (cell) {
        state.tapCell(cell.row, cell.col);
      } else {
        onOffCanvasTap?.();
      }
    });

  return { drawGesture, tapGesture };
}
