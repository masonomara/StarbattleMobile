import { create } from 'zustand';
import { Haptics } from 'react-native-nitro-haptics';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import {
  computeAutoXForStar,
  applyMarks,
  rebuildAutoMarks,
  computeErrors,
  checkWin,
} from './puzzleLogic';
import { loadProgress, saveProgress } from '../../shared/lib/progress';
import type { CellChange, CellValue, HintStep, Move, Puzzle, TapMode } from '../../types';

// Keeps memory usage bounded — older moves beyond this limit are dropped.
const MAX_HISTORY = 50;

// Debounces progress writes so rapid cell changes (fast tapping, drag strokes)
// produce a single DB write 400 ms after the last change rather than one per event.
// NOTE: PuzzleScreen bypasses this debounce intentionally for two lifecycle
// events: navigating away (beforeRemove) and backgrounding (AppState change).
// Those paths call saveProgress() directly to guarantee a flush before unmount.
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
  // True when the saved progress already had completed=true at load time.
  // Consumers (e.g. WinBanner) use this to suppress the victory animation
  // when revisiting a puzzle that was solved in a previous session.
  loadedAsCompleted: boolean;
  timeMs: number;
  moveLog: Move[];
  redoStack: Move[];
  tapMode: TapMode;
  hintGhosts: Map<number, 'star' | 'mark'>;
  hintsLoading: boolean;
  loadPuzzle: (puzzle: Puzzle) => Promise<void>;
  setHints: (hints: HintStep[]) => void;
  tapCell: (row: number, col: number) => void;
  cycleTapMode: () => void;
  recomputeAutoMarks: () => void;
  undo: () => void;
  redo: () => void;
  applyDrawStroke: (changes: CellChange[]) => void;
  clearBoard: () => void;
  tick: (ms?: number) => void;
  showHint: () => void;
};

export const usePuzzleStore = create<PuzzleState>((set, get) => {
  function flushSave(puzzleId: string) {
    const { cells, autoMarks, timeMs, completed } = get();
    scheduleSave(puzzleId, cells, autoMarks, timeMs, completed);
  }

  // Clears any active hint ghost overlay. Every cell mutation (tap, draw,
  // undo, redo, clear) must call this because the ghost suggestions would
  // no longer reflect the updated board state.
  function dismissHints() {
    if (get().hintGhosts.size > 0) {
      set({ hintGhosts: new Map() });
    }
  }

  // Errors are only highlighted when the setting is on; otherwise an empty set.
  // Centralizes the recompute shared by tap/draw/undo/redo.
  function computeErrorCells(
    cells: CellValue[],
    puzzle: Puzzle | null,
  ): Set<number> {
    const { highlightErrors } = useSettingsStore.getState().settings;
    return highlightErrors && puzzle
      ? computeErrors(cells, puzzle.size, puzzle)
      : new Set<number>();
  }

  // Detects a win after a star placement: fires success haptics and flips
  // `completed`. Shared by tapCell and redo (the only paths that place stars).
  function maybeWin(cells: CellValue[], puzzle: Puzzle): void {
    if (!checkWin(cells, puzzle.size, puzzle)) return;
    if (useSettingsStore.getState().settings.haptics) {
      Haptics.notification('success');
    }
    set({ completed: true });
  }

  return {
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
  hintsLoading: false,

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
      // hintsLoading=true when the pack has no bundled hints — they'll arrive
      // asynchronously via setHints() after the pack file is fetched.
      hintsLoading: puzzle.hints.length === 0,
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

  // Handles a single tap on cell (row, col). Responsible for:
  // mode-based value cycling, auto-mark updates, error highlighting,
  // win detection, haptics, and pushing an entry to the move history.
  tapCell: (row: number, col: number) => {
    const { cells, completed, puzzle, tapMode, autoMarks } = get();
    if (completed || !puzzle) return;

    dismissHints();

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

    set(state => ({
      cells: newCells,
      autoMarks: newAutoMarks,
      errorCells: computeErrorCells(newCells, puzzle),
      moveLog: [...state.moveLog, { changes, autoMarks: savedAutoMarks }].slice(
        -MAX_HISTORY,
      ),
      redoStack: [],
    }));

    maybeWin(newCells, puzzle);

    flushSave(puzzle.id);
  },

  cycleTapMode: () => {
    set(state => ({ tapMode: state.tapMode === 'cycle' ? 'erase' : 'cycle' }));
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
    flushSave(puzzle.id);
  },

  undo: () => {
    const { moveLog, cells, completed, autoMarks, puzzle } = get();
    if (moveLog.length === 0 || completed || !puzzle) return;

    dismissHints();

    const lastMove = moveLog[moveLog.length - 1];

    const redoMove: Move = {
      changes: lastMove.changes.map(c => ({ ...c })),
      autoMarks: [...autoMarks],
    };

    const newCells = [...cells];
    for (let i = lastMove.changes.length - 1; i >= 0; i--) {
      newCells[lastMove.changes[i].index] = lastMove.changes[i].prev;
    }

    const settings = useSettingsStore.getState().settings;
    if (settings.haptics) Haptics.impact('light');

    set(state => ({
      cells: newCells,
      autoMarks: new Set(lastMove.autoMarks),
      errorCells: computeErrorCells(newCells, puzzle),
      moveLog: moveLog.slice(0, -1),
      redoStack: [...state.redoStack, redoMove].slice(-MAX_HISTORY),
    }));
    flushSave(puzzle.id);
  },

  redo: () => {
    const { redoStack, cells, autoMarks, completed, puzzle } = get();
    if (redoStack.length === 0 || completed || !puzzle) return;

    dismissHints();

    const entry = redoStack[redoStack.length - 1];

    const undoMove: Move = {
      changes: entry.changes.map(c => ({ ...c })),
      autoMarks: [...autoMarks],
    };

    const newCells = [...cells];
    for (const c of entry.changes) {
      newCells[c.index] = c.next;
    }

    const settings = useSettingsStore.getState().settings;
    if (settings.haptics) Haptics.impact('light');

    set(state => ({
      cells: newCells,
      autoMarks: new Set(entry.autoMarks),
      errorCells: computeErrorCells(newCells, puzzle),
      moveLog: [...state.moveLog, undoMove].slice(-MAX_HISTORY),
      redoStack: redoStack.slice(0, -1),
    }));

    maybeWin(newCells, puzzle);
    flushSave(puzzle.id);
  },

  // Commits the changes accumulated during a drag stroke (see useDrawGesture).
  // No checkWin call here because drag strokes only ever write value 2 (marks);
  // stars (value 1) can only be placed by tapCell, which does check for a win.
  applyDrawStroke: (changes: CellChange[]) => {
    const { completed, puzzle } = get();
    if (completed || !puzzle || changes.length === 0) return;

    dismissHints();

    const size = puzzle.size;
    const settings = useSettingsStore.getState().settings;

    set(state => {
      const newCells = [...state.cells] as CellValue[];
      let newAutoMarks = new Set(state.autoMarks);
      const erasedStar = changes.some(c => c.prev === 1 && c.next === 0);
      for (const c of changes) {
        newCells[c.index] = c.next;
        if (c.next !== 2) newAutoMarks.delete(c.index);
      }
      if (erasedStar) {
        newAutoMarks = rebuildAutoMarks(newCells, changes, newAutoMarks, size, puzzle, settings);
      }

      return {
        cells: newCells,
        autoMarks: newAutoMarks,
        errorCells: computeErrorCells(newCells, puzzle),
        moveLog: [
          ...state.moveLog,
          { changes, autoMarks: [...state.autoMarks] },
        ].slice(-MAX_HISTORY),
        redoStack: [],
      };
    });

    flushSave(puzzle.id);
  },

  clearBoard: () => {
    const { cells, completed, puzzle, autoMarks } = get();
    if (completed || !puzzle) return;

    dismissHints();

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
    flushSave(puzzle.id);
  },

  showHint: () => {
    const { puzzle, cells, completed, hintGhosts } = get();
    if (!puzzle || completed) return;

    if (hintGhosts.size > 0) {
      set({ hintGhosts: new Map() });
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
        set({ hintGhosts: ghosts });
        return;
      }
    }
  },

  setHints: (hints: HintStep[]) => {
    set(s => ({
      puzzle: s.puzzle ? { ...s.puzzle, hints } : null,
      hintsLoading: false,
    }));
  },

  tick: (ms = 1000) => {
    if (get().completed) return;
    set(state => ({ timeMs: state.timeMs + ms }));
  },
  };
});
