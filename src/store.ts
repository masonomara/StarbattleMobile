import { create } from 'zustand';
import { hapticLight, hapticSuccess } from './haptics';
import { useUserStore } from './stores/userStore';
import {
  computeAutoXForStar,
  applyMarks,
  rebuildAutoMarks,
  computeErrors,
  checkWin,
} from './utils/puzzleLogic';
import { persistProgress } from './utils/persistProgress';
import type { CellValue, Move, CellChange, TapMode } from './types/state';
import type { Puzzle } from './types/puzzle';

type PuzzleState = {
  puzzle: Puzzle | null;
  cells: CellValue[];
  autoMarks: Set<number>;
  errorCells: Set<string>;
  completed: boolean;
  timeMs: number;
  moveLog: Move[];
  redoStack: Move[];
  tapMode: TapMode;
  loadPuzzle: (puzzle: Puzzle) => void;
  tapCell: (row: number, col: number) => void;
  cycleTapMode: () => void;
  recomputeAutoMarks: () => void;
  undo: () => void;
  redo: () => void;
  applyDrawStroke: (changes: CellChange[]) => void;
  clearBoard: () => void;
  tick: () => void;
};

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzle: null,
  cells: [],
  autoMarks: new Set<number>(),
  errorCells: new Set<string>(),
  completed: false,
  timeMs: 0,
  moveLog: [],
  redoStack: [],
  tapMode: 'cycle' as TapMode,

  loadPuzzle: (puzzle: Puzzle) => {
    const total = puzzle.size * puzzle.size;
    const saved = useUserStore.getState().getProgress(puzzle.id);
    set({
      puzzle,
      cells: saved ? saved.cells : new Array<CellValue>(total).fill(0),
      autoMarks: new Set(saved?.autoMarks ?? []),
      errorCells: new Set<string>(),
      completed: saved?.completed ?? false,
      timeMs: saved?.timeMs ?? 0,
      moveLog: [],
      redoStack: [],
    });
  },

  tapCell: (row: number, col: number) => {
    const { cells, completed, puzzle, tapMode, autoMarks } = get();
    if (completed || !puzzle) return;

    const size = puzzle.size;
    const settings = useUserStore.getState().settings;
    const idx = row * size + col;
    const current = cells[idx];

    const changes: CellChange[] = [];
    const newCells = [...cells];
    const savedAutoMarks = [...autoMarks];
    let newAutoMarks = new Set(autoMarks);

    let next: CellValue;
    switch (tapMode) {
      case 'mark':
        next = current === 2 ? 0 : 2;
        break;
      case 'star':
        next = current === 1 ? 0 : 1;
        break;
      case 'erase':
        if (current === 0) return;
        next = 0;
        break;
      default:
        next = current === 0 ? 2 : current === 2 ? 1 : 0;
        break;
    }
    changes.push({ index: idx, prev: current, next });
    newCells[idx] = next;

    newAutoMarks.delete(idx);

    if (next === 1) {
      const marks = computeAutoXForStar(newCells, size, puzzle, settings, row, col);
      applyMarks(newCells, changes, newAutoMarks, marks);
    } else if (current === 1 && next === 0) {
      newAutoMarks = rebuildAutoMarks(newCells, changes, newAutoMarks, size, puzzle, settings);
    }

    if (settings.haptics) hapticLight();

    const newErrors = settings.highlightErrors
      ? computeErrors(newCells, size, puzzle)
      : new Set<string>();

    set(state => ({
      cells: newCells,
      autoMarks: newAutoMarks,
      errorCells: newErrors,
      moveLog: [...state.moveLog, { changes, autoMarks: savedAutoMarks }],
      redoStack: [],
    }));

    const won = checkWin(newCells, size, puzzle);
    if (won) {
      if (settings.haptics) hapticSuccess();
      set({ completed: true });
    }

    const s = get();
    persistProgress(s.puzzle, s.cells, s.autoMarks, s.timeMs, s.completed, won);
  },

  cycleTapMode: () => {
    const order: TapMode[] = ['cycle', 'mark', 'star', 'erase'];
    const current = get().tapMode;
    const nextIdx = (order.indexOf(current) + 1) % order.length;
    set({ tapMode: order[nextIdx] });
  },

  recomputeAutoMarks: () => {
    const { cells, puzzle, completed, autoMarks } = get();
    if (!puzzle || completed) return;

    const size = puzzle.size;
    const settings = useUserStore.getState().settings;
    const changes: CellChange[] = [];
    const newCells = [...cells];
    const savedAutoMarks = [...autoMarks];

    const newAutoMarks = rebuildAutoMarks(newCells, changes, autoMarks, size, puzzle, settings);

    if (changes.length === 0) return;

    set(state => ({
      cells: newCells,
      autoMarks: newAutoMarks,
      moveLog: [...state.moveLog, { changes, autoMarks: savedAutoMarks }],
      redoStack: [],
    }));
    const s = get();
    persistProgress(s.puzzle, s.cells, s.autoMarks, s.timeMs, s.completed, false);
  },

  undo: () => {
    const { moveLog, cells, completed, autoMarks } = get();
    if (moveLog.length === 0 || completed) return;

    const lastMove = moveLog[moveLog.length - 1];

    const redoMove: Move = {
      changes: lastMove.changes.map(c => ({
        index: c.index,
        prev: cells[c.index],
        next: c.prev,
      })),
      autoMarks: [...autoMarks],
    };

    const newCells = [...cells];
    for (let i = lastMove.changes.length - 1; i >= 0; i--) {
      newCells[lastMove.changes[i].index] = lastMove.changes[i].prev;
    }

    const settings = useUserStore.getState().settings;
    if (settings.haptics) hapticLight();

    const { puzzle } = get();
    const undoErrors =
      settings.highlightErrors && puzzle
        ? computeErrors(newCells, puzzle.size, puzzle)
        : new Set<string>();

    set(state => ({
      cells: newCells,
      autoMarks: new Set(lastMove.autoMarks),
      errorCells: undoErrors,
      moveLog: moveLog.slice(0, -1),
      redoStack: [...state.redoStack, redoMove],
    }));
    const s = get();
    persistProgress(s.puzzle, s.cells, s.autoMarks, s.timeMs, s.completed, false);
  },

  redo: () => {
    const { redoStack, cells, autoMarks, completed } = get();
    if (redoStack.length === 0 || completed) return;

    const entry = redoStack[redoStack.length - 1];

    const undoMove: Move = {
      changes: entry.changes.map(c => ({
        index: c.index,
        prev: cells[c.index],
        next: c.prev,
      })),
      autoMarks: [...autoMarks],
    };

    const newCells = [...cells];
    for (const c of entry.changes) {
      newCells[c.index] = c.prev;
    }

    const settings = useUserStore.getState().settings;
    if (settings.haptics) hapticLight();

    const { puzzle } = get();
    const redoErrors =
      settings.highlightErrors && puzzle
        ? computeErrors(newCells, puzzle!.size, puzzle!)
        : new Set<string>();

    set(state => ({
      cells: newCells,
      autoMarks: new Set(entry.autoMarks),
      errorCells: redoErrors,
      moveLog: [...state.moveLog, undoMove],
      redoStack: redoStack.slice(0, -1),
    }));

    const won = checkWin(newCells, puzzle!.size, puzzle!);
    if (won) {
      if (settings.haptics) hapticSuccess();
      set({ completed: true });
    }
    const s = get();
    persistProgress(s.puzzle, s.cells, s.autoMarks, s.timeMs, s.completed, won);
  },

  applyDrawStroke: (changes: CellChange[]) => {
    const { completed, puzzle } = get();
    if (completed || !puzzle || changes.length === 0) return;

    const size = puzzle.size;
    const settings = useUserStore.getState().settings;

    set(state => {
      const newAutoMarks = new Set(state.autoMarks);
      for (const c of changes) {
        if (state.cells[c.index] !== 2) newAutoMarks.delete(c.index);
      }

      const currentErrors = settings.highlightErrors
        ? computeErrors(state.cells, size, puzzle)
        : new Set<string>();
      return {
        autoMarks: newAutoMarks,
        errorCells: currentErrors,
        moveLog: [
          ...state.moveLog,
          { changes, autoMarks: [...state.autoMarks] },
        ],
        redoStack: [],
      };
    });

    const s = get();
    persistProgress(s.puzzle, s.cells, s.autoMarks, s.timeMs, s.completed, false);
  },

  clearBoard: () => {
    const { cells, completed, puzzle, autoMarks } = get();
    if (completed || !puzzle) return;

    const changes: CellChange[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== 0) {
        changes.push({ index: i, prev: cells[i], next: 0 });
      }
    }
    if (changes.length === 0) return;

    const savedAutoMarks = [...autoMarks];
    const newCells = new Array<CellValue>(cells.length).fill(0) as CellValue[];

    set(state => ({
      cells: newCells,
      autoMarks: new Set<number>(),
      errorCells: new Set<string>(),
      moveLog: [...state.moveLog, { changes, autoMarks: savedAutoMarks }],
      redoStack: [],
    }));
    const s = get();
    persistProgress(s.puzzle, s.cells, s.autoMarks, s.timeMs, s.completed, false);
  },

  tick: () => {
    const { completed } = get();
    if (completed) return;
    set(state => ({ timeMs: state.timeMs + 1000 }));
  },
}));
