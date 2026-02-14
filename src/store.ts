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
} from './types/state';
import type { Puzzle } from './types/puzzle';

/**
 * If a zone (row/col/region) has the required star count, collect its empty cells.
 * Returns the empty cell indices, or [] if the zone isn't full.
 */
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

/**
 * Returns cell indices a star at (starRow, starCol) would auto-mark,
 * split by feature so each can be tracked independently.
 */
function computeAutoXForStar(
  cells: CellValue[],
  boardSize: number,
  puzzle: Puzzle,
  settings: UserSettings,
  starRow: number,
  starCol: number,
): { neighborMarks: number[]; rowColMarks: number[]; regionMarks: number[] } {
  const neighborMarks: number[] = [];
  const rowColMarks: number[] = [];
  const regionMarks: number[] = [];

  if (settings.autoXNeighbors) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = starRow + dr;
        const nc = starCol + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize) {
          const nIdx = nr * boardSize + nc;
          if (cells[nIdx] === 0) neighborMarks.push(nIdx);
        }
      }
    }
  }

  if (settings.autoXRowsCols) {
    // Row
    const rowIndices: number[] = [];
    for (let c = 0; c < boardSize; c++)
      rowIndices.push(starRow * boardSize + c);
    rowColMarks.push(...collectZoneMarks(cells, rowIndices, puzzle.stars));

    // Column
    const colIndices: number[] = [];
    for (let r = 0; r < boardSize; r++)
      colIndices.push(r * boardSize + starCol);
    rowColMarks.push(...collectZoneMarks(cells, colIndices, puzzle.stars));
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
    regionMarks.push(...collectZoneMarks(cells, regionIndices, puzzle.stars));
  }

  return { neighborMarks, rowColMarks, regionMarks };
}

/** Apply marks to cells, record changes, add indices to the tracking set. */
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

/** Clear all auto-marked cells from all sets, recording changes. */
function clearAllAutoMarks(
  newCells: CellValue[],
  changes: CellChange[],
  neighbors: Set<number>,
  rowsCols: Set<number>,
  regions: Set<number>,
): void {
  for (const cellIdx of new Set([...neighbors, ...rowsCols, ...regions])) {
    if (newCells[cellIdx] === 2) {
      changes.push({ index: cellIdx, previousValue: 2 });
      newCells[cellIdx] = 0;
    }
  }
}

/** Clear all auto-marks then recompute from remaining stars. */
function rebuildAutoMarks(
  newCells: CellValue[],
  changes: CellChange[],
  oldNeighbors: Set<number>,
  oldRowsCols: Set<number>,
  oldRegions: Set<number>,
  boardSize: number,
  puzzle: Puzzle,
  settings: UserSettings,
): { neighbors: Set<number>; rowsCols: Set<number>; regions: Set<number> } {
  clearAllAutoMarks(newCells, changes, oldNeighbors, oldRowsCols, oldRegions);
  const neighbors = new Set<number>();
  const rowsCols = new Set<number>();
  const regions = new Set<number>();

  for (let i = 0; i < newCells.length; i++) {
    if (newCells[i] === 1) {
      const sr = Math.floor(i / boardSize);
      const sc = i % boardSize;
      const { neighborMarks, rowColMarks, regionMarks } = computeAutoXForStar(
        newCells,
        boardSize,
        puzzle,
        settings,
        sr,
        sc,
      );
      applyMarks(newCells, changes, neighbors, neighborMarks);
      applyMarks(newCells, changes, rowsCols, rowColMarks);
      applyMarks(newCells, changes, regions, regionMarks);
    }
  }

  return { neighbors, rowsCols, regions };
}

/** Find all stars that violate constraints (adjacency, row/col/region overflow). */
function computeErrors(
  cells: CellValue[],
  boardSize: number,
  puzzle: Puzzle,
): Set<string> {
  const errors = new Set<string>();

  // Collect star positions
  const stars: { r: number; c: number }[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 1) {
      stars.push({ r: Math.floor(i / boardSize), c: i % boardSize });
    }
  }

  // Check adjacency — any two stars touching (including diagonals)
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

  // Check rows
  for (let r = 0; r < boardSize; r++) {
    const rowStars: number[] = [];
    for (let c = 0; c < boardSize; c++) {
      if (cells[r * boardSize + c] === 1) rowStars.push(c);
    }
    if (rowStars.length > puzzle.stars) {
      for (const c of rowStars) errors.add(`${r},${c}`);
    }
  }

  // Check columns
  for (let c = 0; c < boardSize; c++) {
    const colStars: number[] = [];
    for (let r = 0; r < boardSize; r++) {
      if (cells[r * boardSize + c] === 1) colStars.push(r);
    }
    if (colStars.length > puzzle.stars) {
      for (const r of colStars) errors.add(`${r},${c}`);
    }
  }

  // Check regions
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

/** Check if every star is on a solution coordinate. */
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
  autoMarksNeighbors: Set<number>;
  autoMarksRowsCols: Set<number>;
  autoMarksRegions: Set<number>;
  errorCells: Set<string>;
  completed: boolean;
  timeMs: number;
  moveLog: Move[];
  redoStack: RedoEntry[];
  loadPuzzle: (puzzle: Puzzle) => void;
  tapCell: (row: number, col: number) => void;
  recomputeAutoMarks: () => void;
  undo: () => void;
  redo: () => void;
  clearBoard: () => void;
  tick: () => void;
};

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzle: null,
  boardSize: 0,
  cells: [],
  autoMarksNeighbors: new Set<number>(),
  autoMarksRowsCols: new Set<number>(),
  autoMarksRegions: new Set<number>(),
  errorCells: new Set<string>(),
  completed: false,
  timeMs: 0,
  moveLog: [],
  redoStack: [],

  loadPuzzle: (puzzle: Puzzle) => {
    const total = puzzle.size * puzzle.size;
    const saved = useUserStore.getState().getProgress(puzzle.id);
    set({
      puzzle,
      boardSize: puzzle.size,
      cells: saved ? saved.cells : new Array<CellValue>(total).fill(0),
      autoMarksNeighbors: new Set(saved?.autoMarksNeighbors ?? []),
      autoMarksRowsCols: new Set(saved?.autoMarksRowsCols ?? []),
      autoMarksRegions: new Set(saved?.autoMarksRegions ?? []),
      errorCells: new Set<string>(),
      completed: saved?.completed ?? false,
      timeMs: saved?.timeMs ?? 0,
      moveLog: [],
    });
  },

  tapCell: (row: number, col: number) => {
    const {
      cells,
      boardSize,
      completed,
      puzzle,
      autoMarksNeighbors,
      autoMarksRowsCols,
      autoMarksRegions,
    } = get();
    if (completed || !puzzle) return;

    const settings = useUserStore.getState().settings;
    const idx = row * boardSize + col;
    const current = cells[idx];

    const changes: CellChange[] = [];
    const newCells = [...cells];
    const prevNeighbors = [...autoMarksNeighbors];
    const prevRowsCols = [...autoMarksRowsCols];
    const prevRegions = [...autoMarksRegions];
    let newNeighbors = new Set(autoMarksNeighbors);
    let newRowsCols = new Set(autoMarksRowsCols);
    let newRegions = new Set(autoMarksRegions);

    // Cycle: 0 (empty) -> 2 (mark) -> 1 (star) -> 0 (empty)
    const next: CellValue = current === 0 ? 2 : current === 2 ? 1 : 0;
    changes.push({ index: idx, previousValue: current });
    newCells[idx] = next;

    // If user taps an auto-marked cell, it's now user-controlled
    newNeighbors.delete(idx);
    newRowsCols.delete(idx);
    newRegions.delete(idx);

    if (next === 1) {
      // PLACING A STAR
      const { neighborMarks, rowColMarks, regionMarks } = computeAutoXForStar(
        newCells,
        boardSize,
        puzzle,
        settings,
        row,
        col,
      );
      applyMarks(newCells, changes, newNeighbors, neighborMarks);
      applyMarks(newCells, changes, newRowsCols, rowColMarks);
      applyMarks(newCells, changes, newRegions, regionMarks);
    } else if (current === 1 && next === 0) {
      // REMOVING A STAR — clear all auto-marks, recompute for remaining stars
      const rebuilt = rebuildAutoMarks(
        newCells,
        changes,
        newNeighbors,
        newRowsCols,
        newRegions,
        boardSize,
        puzzle,
        settings,
      );
      newNeighbors = rebuilt.neighbors;
      newRowsCols = rebuilt.rowsCols;
      newRegions = rebuilt.regions;
    }

    if (settings.haptics) hapticLight();

    const newErrors = settings.highlightErrors
      ? computeErrors(newCells, boardSize, puzzle)
      : new Set<string>();

    set(state => ({
      cells: newCells,
      autoMarksNeighbors: newNeighbors,
      autoMarksRowsCols: newRowsCols,
      autoMarksRegions: newRegions,
      errorCells: newErrors,
      moveLog: [
        ...state.moveLog,
        {
          changes,
          prevAutoMarksNeighbors: prevNeighbors,
          prevAutoMarksRowsCols: prevRowsCols,
          prevAutoMarksRegions: prevRegions,
        },
      ],
      redoStack: [],
    }));

    const won = next === 1 && checkWin(newCells, boardSize, puzzle);
    if (won) {
      if (settings.haptics) hapticSuccess();
      set({ completed: true });
    }

    persistProgress(get(), won);
  },

  /** Call after saving settings to sync auto-marks with current toggles. */
  recomputeAutoMarks: () => {
    const {
      cells,
      boardSize,
      puzzle,
      completed,
      autoMarksNeighbors,
      autoMarksRowsCols,
      autoMarksRegions,
    } = get();
    if (!puzzle || completed) return;

    const settings = useUserStore.getState().settings;
    const changes: CellChange[] = [];
    const newCells = [...cells];
    const prevNeighbors = [...autoMarksNeighbors];
    const prevRowsCols = [...autoMarksRowsCols];
    const prevRegions = [...autoMarksRegions];

    const { neighbors: newNeighbors, rowsCols: newRowsCols, regions: newRegions } = rebuildAutoMarks(
      newCells,
      changes,
      autoMarksNeighbors,
      autoMarksRowsCols,
      autoMarksRegions,
      boardSize,
      puzzle,
      settings,
    );

    if (changes.length === 0) return;

    set(state => ({
      cells: newCells,
      autoMarksNeighbors: newNeighbors,
      autoMarksRowsCols: newRowsCols,
      autoMarksRegions: newRegions,
      moveLog: [
        ...state.moveLog,
        {
          changes,
          prevAutoMarksNeighbors: prevNeighbors,
          prevAutoMarksRowsCols: prevRowsCols,
          prevAutoMarksRegions: prevRegions,
        },
      ],
      redoStack: [],
    }));
    persistProgress(get(), false);
  },

  undo: () => {
    const { moveLog, cells, autoMarksNeighbors, autoMarksRowsCols, autoMarksRegions } = get();
    if (moveLog.length === 0) return;

    const lastMove = moveLog[moveLog.length - 1];

    // Capture current state for redo before reverting
    const redoEntry: RedoEntry = {
      cellValues: lastMove.changes.map(c => ({
        index: c.index,
        value: cells[c.index],
      })),
      autoMarksNeighbors: [...autoMarksNeighbors],
      autoMarksRowsCols: [...autoMarksRowsCols],
      autoMarksRegions: [...autoMarksRegions],
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
      autoMarksNeighbors: new Set(lastMove.prevAutoMarksNeighbors),
      autoMarksRowsCols: new Set(lastMove.prevAutoMarksRowsCols),
      autoMarksRegions: new Set(lastMove.prevAutoMarksRegions),
      errorCells: undoErrors,
      moveLog: moveLog.slice(0, -1),
      redoStack: [...state.redoStack, redoEntry],
    }));
    persistProgress(get(), false);
  },

  redo: () => {
    const { redoStack, cells, autoMarksNeighbors, autoMarksRowsCols, autoMarksRegions, completed } = get();
    if (redoStack.length === 0 || completed) return;

    const entry = redoStack[redoStack.length - 1];

    // Build an undo move from the current state
    const changes: CellChange[] = entry.cellValues.map(cv => ({
      index: cv.index,
      previousValue: cells[cv.index],
    }));
    const prevNeighbors = [...autoMarksNeighbors];
    const prevRowsCols = [...autoMarksRowsCols];
    const prevRegions = [...autoMarksRegions];

    // Apply forward values
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
      autoMarksNeighbors: new Set(entry.autoMarksNeighbors),
      autoMarksRowsCols: new Set(entry.autoMarksRowsCols),
      autoMarksRegions: new Set(entry.autoMarksRegions),
      errorCells: redoErrors,
      moveLog: [
        ...state.moveLog,
        {
          changes,
          prevAutoMarksNeighbors: prevNeighbors,
          prevAutoMarksRowsCols: prevRowsCols,
          prevAutoMarksRegions: prevRegions,
        },
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

  clearBoard: () => {
    const { cells, completed, puzzle, boardSize, autoMarksNeighbors, autoMarksRowsCols, autoMarksRegions } = get();
    if (completed || !puzzle) return;

    // Collect all non-empty cells as changes
    const changes: CellChange[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== 0) {
        changes.push({ index: i, previousValue: cells[i] });
      }
    }
    if (changes.length === 0) return;

    const prevNeighbors = [...autoMarksNeighbors];
    const prevRowsCols = [...autoMarksRowsCols];
    const prevRegions = [...autoMarksRegions];
    const newCells = new Array<CellValue>(cells.length).fill(0) as CellValue[];

    const settings = useUserStore.getState().settings;
    if (settings.haptics) hapticLight();

    set(state => ({
      cells: newCells,
      autoMarksNeighbors: new Set<number>(),
      autoMarksRowsCols: new Set<number>(),
      autoMarksRegions: new Set<number>(),
      errorCells: new Set<string>(),
      moveLog: [
        ...state.moveLog,
        {
          changes,
          prevAutoMarksNeighbors: prevNeighbors,
          prevAutoMarksRowsCols: prevRowsCols,
          prevAutoMarksRegions: prevRegions,
        },
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
    autoMarksNeighbors: [...state.autoMarksNeighbors],
    autoMarksRowsCols: [...state.autoMarksRowsCols],
    autoMarksRegions: [...state.autoMarksRegions],
    timeMs: state.timeMs,
    completed: state.completed,
    completedAt: state.completed ? Date.now() : undefined,
    updatedAt: Date.now(),
  };
  useUserStore.getState().saveProgress(progress);

  if (justCompleted) {
    const packId = state.puzzle.id.split(':')[0];
    useUserStore.getState().incrementPackCompleted(packId);
  }
}
