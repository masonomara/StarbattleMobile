import { create } from 'zustand';
import { hapticLight, hapticSuccess } from './haptics';
import { getProgress, saveProgress, getSettings } from './storage';
import type { CellValue, Progress, Move, CellChange } from './types/state';
import type { Puzzle } from './types/puzzle';

type PuzzleState = {
  puzzle: Puzzle | null;
  boardSize: number;
  cells: CellValue[];
  errorCells: Set<string>;
  completed: boolean;
  timeMs: number;
  moveLog: Move[];
  loadPuzzle: (puzzle: Puzzle) => void;
  tapCell: (row: number, col: number) => void;
  undo: () => void;
  tick: () => void;
};

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzle: null,
  boardSize: 0,
  cells: [],
  errorCells: new Set<string>(),
  completed: false,
  timeMs: 0,
  moveLog: [],

  loadPuzzle: (puzzle: Puzzle) => {
    const total = puzzle.size * puzzle.size;
    const saved = getProgress(puzzle.id);
    set({
      puzzle,
      boardSize: puzzle.size,
      cells: saved ? saved.cells : new Array<CellValue>(total).fill(0),
      errorCells: new Set<string>(),
      completed: saved?.completed ?? false,
      timeMs: saved?.timeMs ?? 0,
      moveLog: [],
    });
  },

  tapCell: (row: number, col: number) => {
    const { cells, boardSize, completed, puzzle } = get();
    if (completed || !puzzle) return;

    const settings = getSettings();
    const idx = row * boardSize + col;
    const current = cells[idx];

    const changes: CellChange[] = [];
    const newCells = [...cells];

    // Cycle: 0 (empty) -> 2 (mark) -> 1 (star) -> 0 (empty)
    const next: CellValue = current === 0 ? 2 : current === 2 ? 1 : 0;
    changes.push({ index: idx, previousValue: current });
    newCells[idx] = next;

    // Auto-X neighbors when placing a star
    if (next === 1 && settings.autoXNeighbors) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize) {
            const nIdx = nr * boardSize + nc;
            if (newCells[nIdx] === 0) {
              changes.push({ index: nIdx, previousValue: newCells[nIdx] });
              newCells[nIdx] = 2;
            }
          }
        }
      }
    }

    // Auto-X completed rows/columns/regions when placing a star
    if (next === 1 && settings.autoXRowsCols) {
      let rowStars = 0;
      for (let c = 0; c < boardSize; c++) {
        if (newCells[row * boardSize + c] === 1) rowStars++;
      }
      if (rowStars === puzzle.stars) {
        for (let c = 0; c < boardSize; c++) {
          const rIdx = row * boardSize + c;
          if (newCells[rIdx] === 0) {
            changes.push({ index: rIdx, previousValue: newCells[rIdx] });
            newCells[rIdx] = 2;
          }
        }
      }

      let colStars = 0;
      for (let r = 0; r < boardSize; r++) {
        if (newCells[r * boardSize + col] === 1) colStars++;
      }
      if (colStars === puzzle.stars) {
        for (let r = 0; r < boardSize; r++) {
          const cIdx = r * boardSize + col;
          if (newCells[cIdx] === 0) {
            changes.push({ index: cIdx, previousValue: newCells[cIdx] });
            newCells[cIdx] = 2;
          }
        }
      }

      const placedRegion = puzzle.regions[row][col];
      let regionStars = 0;
      for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c < boardSize; c++) {
          if (
            puzzle.regions[r][c] === placedRegion &&
            newCells[r * boardSize + c] === 1
          ) {
            regionStars++;
          }
        }
      }
      if (regionStars === puzzle.stars) {
        for (let r = 0; r < boardSize; r++) {
          for (let c = 0; c < boardSize; c++) {
            if (puzzle.regions[r][c] === placedRegion) {
              const regIdx = r * boardSize + c;
              if (newCells[regIdx] === 0) {
                changes.push({
                  index: regIdx,
                  previousValue: newCells[regIdx],
                });
                newCells[regIdx] = 2;
              }
            }
          }
        }
      }
    }

    if (settings.haptics) hapticLight();

    set(state => ({
      cells: newCells,
      moveLog: [...state.moveLog, { changes }],
    }));

    // Check win
    const playerStars: string[] = [];
    for (let i = 0; i < newCells.length; i++) {
      if (newCells[i] === 1) {
        playerStars.push(`${Math.floor(i / boardSize)},${i % boardSize}`);
      }
    }
    const solutionSet = new Set(puzzle.solution.map(([r, c]) => `${r},${c}`));
    if (
      playerStars.length === solutionSet.size &&
      playerStars.every(s => solutionSet.has(s))
    ) {
      if (settings.haptics) hapticSuccess();
      set({ completed: true });
    }

    persistProgress(get());
  },

  undo: () => {
    const { moveLog, cells } = get();
    if (moveLog.length === 0) return;

    const lastMove = moveLog[moveLog.length - 1];
    const newCells = [...cells];

    for (let i = lastMove.changes.length - 1; i >= 0; i--) {
      const { index, previousValue } = lastMove.changes[i];
      newCells[index] = previousValue;
    }

    const settings = getSettings();
    if (settings.haptics) hapticLight();

    set({
      cells: newCells,
      moveLog: moveLog.slice(0, -1),
    });
    persistProgress(get());
  },

  tick: () => {
    const { completed } = get();
    if (completed) return;
    set(state => ({ timeMs: state.timeMs + 1000 }));
  },
}));

function persistProgress(state: PuzzleState): void {
  if (!state.puzzle) return;
  const progress: Progress = {
    puzzleId: state.puzzle.id,
    cells: state.cells,
    timeMs: state.timeMs,
    completed: state.completed,
    completedAt: state.completed ? Date.now() : undefined,
    updatedAt: Date.now(),
  };
  saveProgress(progress);
}
