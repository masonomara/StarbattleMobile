import { create } from 'zustand';
import { Haptics } from 'react-native-nitro-haptics';
import { useSettingsStore } from './stores/settingsStore';
import {
  computeAutoXForStar,
  applyMarks,
  rebuildAutoMarks,
  computeErrors,
  checkWin,
} from './utils/puzzleLogic';
import { loadProgress, saveProgress } from './utils/progress';
import { CellChange, CellValue, Move, Puzzle, TapMode } from './types';

const MAX_HISTORY = 50;

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(
  puzzleId: string,
  cells: CellValue[],
  autoMarks: Set<number>,
  timeMs: number,
  completed: boolean,
) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveProgress(puzzleId, cells, autoMarks, timeMs, completed);
  }, 400);
}

type PuzzleState = {
  puzzle: Puzzle | null;
  cells: CellValue[];
  autoMarks: Set<number>;
  errorCells: Set<number>;
  completed: boolean;
  loadedAsCompleted: boolean;
  timeMs: number;
  moveLog: Move[];
  redoStack: Move[];
  tapMode: TapMode;
  hintGhosts: Map<number, 'star' | 'mark'>;
  hintStepIndex: number;
  loadPuzzle: (puzzle: Puzzle) => Promise<void>;
  tapCell: (row: number, col: number) => void;
  cycleTapMode: () => void;
  recomputeAutoMarks: () => void;
  undo: () => void;
  redo: () => void;
  applyDrawStroke: (changes: CellChange[]) => void;
  clearBoard: () => void;
  tick: (ms?: number) => void;
  showHint: () => void;
  dismissHint: () => void;
};

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzle: null,
  cells: [],
  autoMarks: new Set<number>(),
  errorCells: new Set<number>(),
  completed: false,
  loadedAsCompleted: false,
  timeMs: 0,
  moveLog: [],
  redoStack: [],
  tapMode: 'cycle',
  hintGhosts: new Map<number, 'star' | 'mark'>(),
  hintStepIndex: -1,

  loadPuzzle: async (puzzle: Puzzle) => {
    const total = puzzle.size * puzzle.size;
    set({
      puzzle,
      cells: new Array<CellValue>(total).fill(0),
      autoMarks: new Set<number>(),
      errorCells: new Set<number>(),
      completed: false,
      loadedAsCompleted: false,
      timeMs: 0,
      moveLog: [],
      redoStack: [],
      hintGhosts: new Map(),
      hintStepIndex: -1,
    });
    try {
      const saved = await loadProgress(puzzle.id);
      if (saved) {
        set({
          cells: saved.cells,
          autoMarks: new Set(saved.autoMarks),
          completed: saved.completed,
          loadedAsCompleted: saved.completed,
          timeMs: saved.timeMs,
        });
      }
    } catch {
      // ignore — puzzle already shown with empty state
    }
  },

  tapCell: (row: number, col: number) => {
    const { cells, completed, puzzle, tapMode, autoMarks, hintGhosts } = get();
    if (completed || !puzzle) return;

    if (hintGhosts.size > 0) {
      set({ hintGhosts: new Map(), hintStepIndex: -1 });
    }

    const size = puzzle.size;
    const settings = useSettingsStore.getState().settings;
    const idx = row * size + col;
    const current = cells[idx];

    const changes: CellChange[] = [];
    const newCells = [...cells];
    const savedAutoMarks = [...autoMarks];
    let newAutoMarks = new Set(autoMarks);

    let next: CellValue;
    switch (tapMode) {
      case 'erase':
        if (current === 0) return;
        next = 0;
        break;
      case 'cycle':
      default:
        next = current === 0 ? 2 : current === 2 ? 1 : 0;
        break;
    }
    changes.push({ index: idx, prev: current, next });
    newCells[idx] = next;
    newAutoMarks.delete(idx);

    if (next === 1) {
      const marks = computeAutoXForStar(
        newCells,
        size,
        puzzle,
        settings,
        row,
        col,
      );
      applyMarks(newCells, changes, newAutoMarks, marks);
    } else if (current === 1 && next === 0) {
      newAutoMarks = rebuildAutoMarks(
        newCells,
        changes,
        newAutoMarks,
        size,
        puzzle,
        settings,
      );
    }

    if (settings.haptics) Haptics.impact('light');

    const newErrors = settings.highlightErrors
      ? computeErrors(newCells, size, puzzle)
      : new Set<number>();

    set(state => ({
      cells: newCells,
      autoMarks: newAutoMarks,
      errorCells: newErrors,
      moveLog: [...state.moveLog, { changes, autoMarks: savedAutoMarks }].slice(
        -MAX_HISTORY,
      ),
      redoStack: [],
    }));

    const won = checkWin(newCells, size, puzzle);
    if (won) {
      if (settings.haptics) Haptics.notification('success');
      set({ completed: true });
    }

    const s = get();
    scheduleSave(puzzle.id, s.cells, s.autoMarks, s.timeMs, s.completed);
  },

  cycleTapMode: () => {
    const order: TapMode[] = ['cycle', 'erase'];
    const current = get().tapMode;
    const nextIdx = (order.indexOf(current) + 1) % order.length;
    set({ tapMode: order[nextIdx] });
  },

  recomputeAutoMarks: () => {
    const { cells, puzzle, completed, autoMarks } = get();
    if (!puzzle || completed) return;

    const size = puzzle.size;
    const settings = useSettingsStore.getState().settings;
    const changes: CellChange[] = [];
    const newCells = [...cells];
    const savedAutoMarks = [...autoMarks];

    const newAutoMarks = rebuildAutoMarks(
      newCells,
      changes,
      autoMarks,
      size,
      puzzle,
      settings,
    );

    if (changes.length === 0) return;

    set(state => ({
      cells: newCells,
      autoMarks: newAutoMarks,
      moveLog: [...state.moveLog, { changes, autoMarks: savedAutoMarks }].slice(
        -MAX_HISTORY,
      ),
      redoStack: [],
    }));
    const s = get();
    scheduleSave(puzzle.id, s.cells, s.autoMarks, s.timeMs, s.completed);
  },

  undo: () => {
    const { moveLog, cells, completed, autoMarks, hintGhosts, puzzle } = get();
    if (moveLog.length === 0 || completed) return;

    if (hintGhosts.size > 0) {
      set({ hintGhosts: new Map(), hintStepIndex: -1 });
    }

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

    const settings = useSettingsStore.getState().settings;
    if (settings.haptics) Haptics.impact('light');

    const undoErrors =
      settings.highlightErrors && puzzle
        ? computeErrors(newCells, puzzle.size, puzzle)
        : new Set<number>();

    set(state => ({
      cells: newCells,
      autoMarks: new Set(lastMove.autoMarks),
      errorCells: undoErrors,
      moveLog: moveLog.slice(0, -1),
      redoStack: [...state.redoStack, redoMove].slice(-MAX_HISTORY),
    }));
    const s = get();
    scheduleSave(puzzle!.id, s.cells, s.autoMarks, s.timeMs, s.completed);
  },

  redo: () => {
    const { redoStack, cells, autoMarks, completed, hintGhosts, puzzle } =
      get();
    if (redoStack.length === 0 || completed) return;

    if (hintGhosts.size > 0) {
      set({ hintGhosts: new Map(), hintStepIndex: -1 });
    }

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

    const settings = useSettingsStore.getState().settings;
    if (settings.haptics) Haptics.impact('light');

    const redoErrors =
      settings.highlightErrors && puzzle
        ? computeErrors(newCells, puzzle.size, puzzle)
        : new Set<number>();

    set(state => ({
      cells: newCells,
      autoMarks: new Set(entry.autoMarks),
      errorCells: redoErrors,
      moveLog: [...state.moveLog, undoMove].slice(-MAX_HISTORY),
      redoStack: redoStack.slice(0, -1),
    }));

    const won = checkWin(newCells, puzzle!.size, puzzle!);
    if (won) {
      if (settings.haptics) Haptics.notification('success');
      set({ completed: true });
    }
    const s = get();
    scheduleSave(puzzle!.id, s.cells, s.autoMarks, s.timeMs, s.completed);
  },

  applyDrawStroke: (changes: CellChange[]) => {
    const { completed, puzzle, hintGhosts } = get();
    if (completed || !puzzle || changes.length === 0) return;

    if (hintGhosts.size > 0) {
      set({ hintGhosts: new Map(), hintStepIndex: -1 });
    }

    const size = puzzle.size;
    const settings = useSettingsStore.getState().settings;

    set(state => {
      const newCells = [...state.cells] as CellValue[];
      const newAutoMarks = new Set(state.autoMarks);
      for (const c of changes) {
        newCells[c.index] = c.next;
        if (c.next !== 2) newAutoMarks.delete(c.index);
      }

      const currentErrors = settings.highlightErrors
        ? computeErrors(newCells, size, puzzle)
        : new Set<number>();
      return {
        cells: newCells,
        autoMarks: newAutoMarks,
        errorCells: currentErrors,
        moveLog: [
          ...state.moveLog,
          { changes, autoMarks: [...state.autoMarks] },
        ].slice(-MAX_HISTORY),
        redoStack: [],
      };
    });

    const s = get();
    scheduleSave(puzzle.id, s.cells, s.autoMarks, s.timeMs, s.completed);
  },

  clearBoard: () => {
    const { cells, completed, puzzle, autoMarks, hintGhosts } = get();
    if (completed || !puzzle) return;

    if (hintGhosts.size > 0) {
      set({ hintGhosts: new Map(), hintStepIndex: -1 });
    }

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
      errorCells: new Set<number>(),
      moveLog: [...state.moveLog, { changes, autoMarks: savedAutoMarks }].slice(
        -MAX_HISTORY,
      ),
      redoStack: [],
    }));
    const s = get();
    scheduleSave(puzzle.id, s.cells, s.autoMarks, s.timeMs, s.completed);
  },

  showHint: () => {
    const { puzzle, cells, completed, hintGhosts } = get();
    if (!puzzle || completed) return;

    if (hintGhosts.size > 0) {
      set({ hintGhosts: new Map(), hintStepIndex: -1 });
      return;
    }

    const size = puzzle.size;
    for (let i = 0; i < puzzle.hints.length; i++) {
      const step = puzzle.hints[i];
      const ghosts = new Map<number, 'star' | 'mark'>();

      for (const [r, c] of step.placements) {
        const idx = r * size + c;
        if (cells[idx] !== 1) ghosts.set(idx, 'star');
      }
      for (const [r, c] of step.marks) {
        const idx = r * size + c;
        if (cells[idx] !== 2) ghosts.set(idx, 'mark');
      }

      if (ghosts.size > 0) {
        set({ hintGhosts: ghosts, hintStepIndex: i });
        return;
      }
    }
  },

  dismissHint: () => {
    set({ hintGhosts: new Map(), hintStepIndex: -1 });
  },

  tick: (ms = 1000) => {
    if (get().completed) return;
    set(state => ({ timeMs: state.timeMs + ms }));
  },
}));
