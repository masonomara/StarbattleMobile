import { create } from 'zustand';
import { hapticLight, hapticSuccess } from './haptics';
import { useUserStore } from './stores/userStore';
import type {
  CellValue,
  Progress,
  Move,
  CellChange,
  UserSettings,
  RedoEntry,
  TapMode,
} from './types/state';
import type { Puzzle } from './types/puzzle';

function collectZoneMarks(
  cells: CellValue[],
  zoneIndices: number[],
  requiredStars: number,
): number[] {
  let stars = 0;
  for (const idx of zoneIndices) {
    if (cells[idx] === 1) stars++;
  }
  if (stars !== requiredStars) return [];
  const marks: number[] = [];
  for (const idx of zoneIndices) {
    if (cells[idx] === 0) marks.push(idx);
  }
  return marks;
}

function computeAutoXForStar(
  cells: CellValue[],
  boardSize: number,
  puzzle: Puzzle,
  settings: UserSettings,
  starRow: number,
  starCol: number,
): number[] {
  const marks: number[] = [];

  if (settings.autoXNeighbors) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = starRow + dr;
        const nc = starCol + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize) {
          const nIdx = nr * boardSize + nc;
          if (cells[nIdx] === 0) marks.push(nIdx);
        }
      }
    }
  }

  if (settings.autoXRowsCols) {
    const rowIndices: number[] = [];
    for (let c = 0; c < boardSize; c++)
      rowIndices.push(starRow * boardSize + c);
    marks.push(...collectZoneMarks(cells, rowIndices, puzzle.stars));

    const colIndices: number[] = [];
    for (let r = 0; r < boardSize; r++)
      colIndices.push(r * boardSize + starCol);
    marks.push(...collectZoneMarks(cells, colIndices, puzzle.stars));
  }

  if (settings.autoXRegions) {
    const region = puzzle.regions[starRow][starCol];
    const regionIndices: number[] = [];
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        if (puzzle.regions[r][c] === region)
          regionIndices.push(r * boardSize + c);
      }
    }
    marks.push(...collectZoneMarks(cells, regionIndices, puzzle.stars));
  }

  return marks;
}

function applyMarks(
  newCells: CellValue[],
  changes: CellChange[],
  markSet: Set<number>,
  marks: number[],
): void {
  for (const markIdx of marks) {
    if (newCells[markIdx] === 0) {
      changes.push({ index: markIdx, previousValue: 0 });
      newCells[markIdx] = 2;
    }
    markSet.add(markIdx);
  }
}

function clearAutoMarks(
  newCells: CellValue[],
  changes: CellChange[],
  autoMarks: Set<number>,
): void {
  for (const cellIdx of autoMarks) {
    if (newCells[cellIdx] === 2) {
      changes.push({ index: cellIdx, previousValue: 2 });
      newCells[cellIdx] = 0;
    }
  }
}

function rebuildAutoMarks(
  newCells: CellValue[],
  changes: CellChange[],
  oldAutoMarks: Set<number>,
  boardSize: number,
  puzzle: Puzzle,
  settings: UserSettings,
): Set<number> {
  clearAutoMarks(newCells, changes, oldAutoMarks);
  const newMarks = new Set<number>();

  for (let i = 0; i < newCells.length; i++) {
    if (newCells[i] === 1) {
      const sr = Math.floor(i / boardSize);
      const sc = i % boardSize;
      const marks = computeAutoXForStar(
        newCells,
        boardSize,
        puzzle,
        settings,
        sr,
        sc,
      );
      applyMarks(newCells, changes, newMarks, marks);
    }
  }

  return newMarks;
}

function computeErrors(
  cells: CellValue[],
  boardSize: number,
  puzzle: Puzzle,
): Set<string> {
  const errors = new Set<string>();

  const stars: { r: number; c: number }[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 1) {
      stars.push({ r: Math.floor(i / boardSize), c: i % boardSize });
    }
  }

  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const dr = Math.abs(stars[i].r - stars[j].r);
      const dc = Math.abs(stars[i].c - stars[j].c);
      if (dr <= 1 && dc <= 1) {
        errors.add(`${stars[i].r},${stars[i].c}`);
        errors.add(`${stars[j].r},${stars[j].c}`);
      }
    }
  }

  for (let r = 0; r < boardSize; r++) {
    const rowStars: number[] = [];
    for (let c = 0; c < boardSize; c++) {
      if (cells[r * boardSize + c] === 1) rowStars.push(c);
    }
    if (rowStars.length > puzzle.stars) {
      for (const c of rowStars) errors.add(`${r},${c}`);
    }
  }

  for (let c = 0; c < boardSize; c++) {
    const colStars: number[] = [];
    for (let r = 0; r < boardSize; r++) {
      if (cells[r * boardSize + c] === 1) colStars.push(r);
    }
    if (colStars.length > puzzle.stars) {
      for (const r of colStars) errors.add(`${r},${c}`);
    }
  }

  const regionMap = new Map<number, { r: number; c: number }[]>();
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (cells[r * boardSize + c] === 1) {
        const region = puzzle.regions[r][c];
        if (!regionMap.has(region)) regionMap.set(region, []);
        regionMap.get(region)!.push({ r, c });
      }
    }
  }
  for (const regionStars of regionMap.values()) {
    if (regionStars.length > puzzle.stars) {
      for (const { r, c } of regionStars) errors.add(`${r},${c}`);
    }
  }

  return errors;
}

function checkWin(
  cells: CellValue[],
  boardSize: number,
  puzzle: Puzzle,
): boolean {
  const solution = puzzle.solution;
  let starCount = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 1) {
      starCount++;
      const r = Math.floor(i / boardSize);
      const c = i % boardSize;
      if (!solution.some(([sr, sc]) => sr === r && sc === c)) return false;
    }
  }
  return starCount === solution.length;
}

type PuzzleState = {
  puzzle: Puzzle | null;
  boardSize: number;
  cells: CellValue[];
  autoMarks: Set<number>;
  errorCells: Set<string>;
  completed: boolean;
  timeMs: number;
  moveLog: Move[];
  redoStack: RedoEntry[];
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
  boardSize: 0,
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
      boardSize: puzzle.size,
      cells: saved ? saved.cells : new Array<CellValue>(total).fill(0),
      autoMarks: new Set(saved?.autoMarks ?? []),
      errorCells: new Set<string>(),
      completed: saved?.completed ?? false,
      timeMs: saved?.timeMs ?? 0,
      moveLog: [],
    });
  },

  tapCell: (row: number, col: number) => {
    const { cells, boardSize, completed, puzzle, tapMode, autoMarks } = get();
    if (completed || !puzzle) return;

    const settings = useUserStore.getState().settings;
    const idx = row * boardSize + col;
    const current = cells[idx];

    const changes: CellChange[] = [];
    const newCells = [...cells];
    const prevAutoMarks = [...autoMarks];
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
    changes.push({ index: idx, previousValue: current });
    newCells[idx] = next;

    newAutoMarks.delete(idx);

    if (next === 1) {
      const marks = computeAutoXForStar(
        newCells,
        boardSize,
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
        boardSize,
        puzzle,
        settings,
      );
    }

    if (settings.haptics) hapticLight();

    const newErrors = settings.highlightErrors
      ? computeErrors(newCells, boardSize, puzzle)
      : new Set<string>();

    set(state => ({
      cells: newCells,
      autoMarks: newAutoMarks,
      errorCells: newErrors,
      moveLog: [
        ...state.moveLog,
        { changes, prevAutoMarks },
      ],
      redoStack: [],
    }));

    const won = checkWin(newCells, boardSize, puzzle);
    if (won) {
      if (settings.haptics) hapticSuccess();
      set({ completed: true });
    }

    persistProgress(get(), won);
  },

  cycleTapMode: () => {
    const order: TapMode[] = ['cycle', 'mark', 'star', 'erase'];
    const current = get().tapMode;
    const nextIdx = (order.indexOf(current) + 1) % order.length;
    set({ tapMode: order[nextIdx] });
  },

  recomputeAutoMarks: () => {
    const { cells, boardSize, puzzle, completed, autoMarks } = get();
    if (!puzzle || completed) return;

    const settings = useUserStore.getState().settings;
    const changes: CellChange[] = [];
    const newCells = [...cells];
    const prevAutoMarks = [...autoMarks];

    const newAutoMarks = rebuildAutoMarks(
      newCells,
      changes,
      autoMarks,
      boardSize,
      puzzle,
      settings,
    );

    if (changes.length === 0) return;

    set(state => ({
      cells: newCells,
      autoMarks: newAutoMarks,
      moveLog: [
        ...state.moveLog,
        { changes, prevAutoMarks },
      ],
      redoStack: [],
    }));
    persistProgress(get(), false);
  },

  undo: () => {
    const { moveLog, cells, completed, autoMarks } = get();
    if (moveLog.length === 0 || completed) return;

    const lastMove = moveLog[moveLog.length - 1];

    const redoEntry: RedoEntry = {
      cellValues: lastMove.changes.map(c => ({
        index: c.index,
        value: cells[c.index],
      })),
      autoMarks: [...autoMarks],
    };

    const newCells = [...cells];
    for (let i = lastMove.changes.length - 1; i >= 0; i--) {
      const { index, previousValue } = lastMove.changes[i];
      newCells[index] = previousValue;
    }

    const settings = useUserStore.getState().settings;
    if (settings.haptics) hapticLight();

    const { puzzle, boardSize } = get();
    const undoErrors =
      settings.highlightErrors && puzzle
        ? computeErrors(newCells, boardSize, puzzle)
        : new Set<string>();

    set(state => ({
      cells: newCells,
      autoMarks: new Set(lastMove.prevAutoMarks),
      errorCells: undoErrors,
      moveLog: moveLog.slice(0, -1),
      redoStack: [...state.redoStack, redoEntry],
    }));
    persistProgress(get(), false);
  },

  redo: () => {
    const { redoStack, cells, autoMarks, completed } = get();
    if (redoStack.length === 0 || completed) return;

    const entry = redoStack[redoStack.length - 1];

    const changes: CellChange[] = entry.cellValues.map(cv => ({
      index: cv.index,
      previousValue: cells[cv.index],
    }));
    const prevAutoMarks = [...autoMarks];

    const newCells = [...cells];
    for (const cv of entry.cellValues) {
      newCells[cv.index] = cv.value;
    }

    const settings = useUserStore.getState().settings;
    if (settings.haptics) hapticLight();

    const { puzzle, boardSize } = get();
    const redoErrors =
      settings.highlightErrors && puzzle
        ? computeErrors(newCells, boardSize, puzzle)
        : new Set<string>();

    set(state => ({
      cells: newCells,
      autoMarks: new Set(entry.autoMarks),
      errorCells: redoErrors,
      moveLog: [
        ...state.moveLog,
        { changes, prevAutoMarks },
      ],
      redoStack: redoStack.slice(0, -1),
    }));

    const won = checkWin(newCells, boardSize, puzzle!);
    if (won) {
      if (settings.haptics) hapticSuccess();
      set({ completed: true });
    }
    persistProgress(get(), won);
  },

  applyDrawStroke: (changes: CellChange[]) => {
    const { completed, puzzle, boardSize } = get();
    if (completed || !puzzle || changes.length === 0) return;

    const settings = useUserStore.getState().settings;

    set(state => {
      const currentErrors = settings.highlightErrors
        ? computeErrors(state.cells, boardSize, puzzle)
        : new Set<string>();
      return {
        errorCells: currentErrors,
        moveLog: [
          ...state.moveLog,
          {
            changes,
            prevAutoMarks: [...state.autoMarks],
          },
        ],
        redoStack: [],
      };
    });

    persistProgress(get(), false);
  },

  clearBoard: () => {
    const { cells, completed, puzzle, autoMarks } = get();
    if (completed || !puzzle) return;

    const changes: CellChange[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== 0) {
        changes.push({ index: i, previousValue: cells[i] });
      }
    }
    if (changes.length === 0) return;

    const prevAutoMarks = [...autoMarks];
    const newCells = new Array<CellValue>(cells.length).fill(0) as CellValue[];

    set(state => ({
      cells: newCells,
      autoMarks: new Set<number>(),
      errorCells: new Set<string>(),
      moveLog: [
        ...state.moveLog,
        { changes, prevAutoMarks },
      ],
      redoStack: [],
    }));
    persistProgress(get(), false);
  },

  tick: () => {
    const { completed } = get();
    if (completed) return;
    set(state => ({ timeMs: state.timeMs + 1000 }));
  },
}));

function persistProgress(state: PuzzleState, justCompleted: boolean): void {
  if (!state.puzzle) return;
  const progress: Progress = {
    puzzleId: state.puzzle.id,
    cells: state.cells,
    autoMarks: [...state.autoMarks],
    timeMs: state.timeMs,
    completed: state.completed,
    completedAt: justCompleted ? Date.now() : undefined,
    updatedAt: Date.now(),
  };
  useUserStore.getState().saveProgress(progress);
}
