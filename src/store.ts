import { create } from 'zustand';
import { triggerHaptic } from './utils/haptics';
import { getProgress, saveProgress, getSettings } from './storage';
import type {
  CellValue, GamePuzzle, PuzzleProgress, UserSettings, Move, CellChange, HintStep,
} from './types';

const MOVE_LOG_CAP = 100;

type PuzzleState = {
  puzzle: GamePuzzle | null;
  boardSize: number;
  cells: CellValue[];
  errorCells: Set<number>;
  completed: boolean;
  timeMs: number;
  hintsUsed: number;
  currentHintIndex: number;
  moveLog: Move[];
  activeHint: HintStep | null;
  settings: UserSettings;

  loadPuzzle: (puzzle: GamePuzzle) => void;
  tapCell: (row: number, col: number) => void;
  undo: () => void;
  requestHint: () => void;
  tick: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedPersist(state: PuzzleState): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistProgress(state);
    persistTimer = null;
  }, 500);
}

function persistProgress(state: PuzzleState): void {
  if (!state.puzzle) return;
  const progress: PuzzleProgress = {
    puzzleId: state.puzzle.id,
    cells: state.cells,
    timeMs: state.timeMs,
    completed: state.completed,
    completedAt: state.completed ? Date.now() : undefined,
    hintsUsed: state.hintsUsed,
    currentHintIndex: state.currentHintIndex,
    updatedAt: Date.now(),
  };
  saveProgress(progress);
}

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzle: null,
  boardSize: 0,
  cells: [],
  errorCells: new Set(),
  completed: false,
  timeMs: 0,
  hintsUsed: 0,
  currentHintIndex: 0,
  moveLog: [],
  activeHint: null,
  settings: getSettings(),

  loadPuzzle: (puzzle) => {
    const total = puzzle.size * puzzle.size;
    const saved = getProgress(puzzle.id);
    set({
      puzzle,
      boardSize: puzzle.size,
      cells: saved ? saved.cells : new Array<CellValue>(total).fill(0),
      errorCells: new Set(),
      completed: saved?.completed ?? false,
      timeMs: saved?.timeMs ?? 0,
      hintsUsed: saved?.hintsUsed ?? 0,
      currentHintIndex: saved?.currentHintIndex ?? 0,
      moveLog: [],
      activeHint: null,
    });
  },

  tapCell: (row, col) => {
    const { cells, boardSize, completed, puzzle, settings, moveLog } = get();
    if (completed || !puzzle) return;

    const idx = row * boardSize + col;
    const current = cells[idx];
    const changes: CellChange[] = [];
    const newCells = [...cells];

    // Cycle: empty(0) → mark(2) → star(1) → empty(0)
    const next: CellValue = current === 0 ? 2 : current === 2 ? 1 : 0;
    changes.push({ index: idx, previousValue: current });
    newCells[idx] = next;

    // Auto-X neighbors when placing a star
    if (next === 1 && settings.autoX) {
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

    // Remove auto-X marks when removing a star
    // Search moveLog for the move that placed this star. changes[0] is
    // always the tapped cell; changes[1..n] are the auto-X side effects.
    // Only revert auto-X cells that are still marks (user hasn't touched them).
    if (current === 1 && next === 0 && settings.autoX) {
      for (let m = moveLog.length - 1; m >= 0; m--) {
        const move = moveLog[m];
        const primary = move.changes[0];
        // In cycle 0→2→1→0, placing a star means previousValue was 2 (mark)
        if (primary.index === idx && primary.previousValue === 2) {
          for (let c = 1; c < move.changes.length; c++) {
            const autoX = move.changes[c];
            if (newCells[autoX.index] === 2) {
              changes.push({ index: autoX.index, previousValue: 2 });
              newCells[autoX.index] = 0;
            }
          }
          break;
        }
      }
    }

    if (settings.haptics) triggerHaptic('impactLight');

    let isCompleted = false;
    if (next === 1) {
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
        if (settings.haptics) triggerHaptic('notificationSuccess');
        isCompleted = true;
      }
    }

    set(state => {
      const newLog = [...state.moveLog, { changes }];
      if (newLog.length > MOVE_LOG_CAP) {
        newLog.splice(0, newLog.length - MOVE_LOG_CAP);
      }
      return {
        cells: newCells,
        moveLog: newLog,
        completed: isCompleted || state.completed,
      };
    });

    debouncedPersist(get());
  },

  undo: () => {
    const { moveLog, cells, settings } = get();
    if (moveLog.length === 0) return;

    const lastMove = moveLog[moveLog.length - 1];
    const newCells = [...cells];

    for (let i = lastMove.changes.length - 1; i >= 0; i--) {
      const { index, previousValue } = lastMove.changes[i];
      newCells[index] = previousValue;
    }

    if (settings.haptics) triggerHaptic('impactLight');

    set({
      cells: newCells,
      moveLog: moveLog.slice(0, -1),
    });
    debouncedPersist(get());
  },

  requestHint: () => {
    const { completed, puzzle, currentHintIndex, cells, boardSize } = get();
    if (completed || !puzzle) return;

    for (let i = currentHintIndex; i < puzzle.hints.length; i++) {
      const hint = puzzle.hints[i];
      const allApplied = [...hint.placements, ...hint.marks].every(
        ([r, c]) => cells[r * boardSize + c] !== 0,
      );
      if (!allApplied) {
        set(state => ({
          currentHintIndex: i,
          hintsUsed: state.hintsUsed + 1,
          activeHint: hint,
        }));
        return;
      }
    }
    set({ activeHint: null });
  },

  tick: () => {
    const { completed } = get();
    if (completed) return;
    set(state => ({ timeMs: state.timeMs + 1000 }));
  },

  updateSettings: (update) => {
    set(state => ({ settings: { ...state.settings, ...update } }));
  },
}));
