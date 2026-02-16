import { useCallback, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import { hapticLight } from '../haptics';
import { CELL_SIZE } from '../utils/constants';
import type { CellChange } from '../types/state';
import type { BoardLayout } from '../types/board';

export function useDrawGesture(
  puzzleSize: number,
  savedScale: React.RefObject<number>,
  savedTranslateX: React.RefObject<number>,
  savedTranslateY: React.RefObject<number>,
  boardLayout: React.RefObject<BoardLayout>,
) {
  const strokeChanges = useRef<CellChange[]>([]);
  const visitedCells = useRef(new Set<number>());
  const committed = useRef(false);

  const viewToCell = useCallback(
    (x: number, y: number): { row: number; col: number } | null => {
      const layout = boardLayout.current;
      if (!layout) return null;

      const sc = savedScale.current;
      const tx = savedTranslateX.current;
      const ty = savedTranslateY.current;
      const boardPixels = CELL_SIZE * puzzleSize;

      // Touch relative to board-area center (x,y are already view-relative)
      const relX = x - layout.width / 2;
      const relY = y - layout.height / 2;

      // Reverse transform: subtract translate, divide by scale, shift to top-left origin
      const bx = (relX - tx) / sc + boardPixels / 2;
      const by = (relY - ty) / sc + boardPixels / 2;

      const col = Math.floor(bx / CELL_SIZE);
      const row = Math.floor(by / CELL_SIZE);

      if (row < 0 || row >= puzzleSize || col < 0 || col >= puzzleSize) {
        return null;
      }
      return { row, col };
    },
    [puzzleSize, savedScale, savedTranslateX, savedTranslateY, boardLayout],
  );

  const markCell = useCallback((row: number, col: number) => {
    const state = usePuzzleStore.getState();
    const idx = row * state.puzzle!.size + col;

    if (visitedCells.current.has(idx)) return;
    visitedCells.current.add(idx);

    const isErase = state.tapMode === 'erase';

    if (isErase) {
      if (state.cells[idx] === 0) return;
      strokeChanges.current.push({ index: idx, prev: state.cells[idx], next: 0 });
      usePuzzleStore.setState(s => {
        const newCells = [...s.cells];
        newCells[idx] = 0;
        return { cells: newCells };
      });
    } else {
      if (state.cells[idx] !== 0) return;
      strokeChanges.current.push({ index: idx, prev: 0, next: 2 });
      usePuzzleStore.setState(s => {
        const newCells = [...s.cells];
        newCells[idx] = 2;
        return { cells: newCells };
      });
    }

    const settings = useUserStore.getState().settings;
    if (settings.haptics) hapticLight();
  }, []);

  const revertPreview = useCallback(() => {
    const changes = strokeChanges.current;
    if (changes.length === 0) return;
    usePuzzleStore.setState(prev => {
      const newCells = [...prev.cells];
      for (const change of changes) {
        newCells[change.index] = change.prev;
      }
      return { cells: newCells };
    });
  }, []);

  const drawGesture = Gesture.Pan()
    .maxPointers(1)
    .activateAfterLongPress(100)
    .minDistance(0)
    .onStart(e => {
      strokeChanges.current = [];
      visitedCells.current = new Set();
      committed.current = false;

      if (usePuzzleStore.getState().completed) return;

      const cell = viewToCell(e.x, e.y);
      if (cell) markCell(cell.row, cell.col);
    })
    .onUpdate(e => {
      if (usePuzzleStore.getState().completed) return;

      const cell = viewToCell(e.x, e.y);
      if (cell) markCell(cell.row, cell.col);
    })
    .onEnd(() => {
      committed.current = true;
      const changes = strokeChanges.current;
      if (changes.length > 0) {
        usePuzzleStore.getState().applyDrawStroke(changes);
      }
    })
    .onFinalize(() => {
      // If onEnd didn't fire (gesture cancelled), revert preview
      if (!committed.current) {
        revertPreview();
      }
      strokeChanges.current = [];
      visitedCells.current = new Set();
      committed.current = false;
    });

  return { drawGesture };
}
