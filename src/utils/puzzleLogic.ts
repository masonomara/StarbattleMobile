import type { CellValue, CellChange, UserSettings, Puzzle } from '../types';

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

export function computeAutoXForStar(
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
    marks.push(
      ...collectZoneMarks(cells, puzzle.regionCells[region], puzzle.stars),
    );
  }

  return marks;
}

export function applyMarks(
  newCells: CellValue[],
  changes: CellChange[],
  markSet: Set<number>,
  marks: number[],
): void {
  for (const markIdx of marks) {
    if (newCells[markIdx] === 0) {
      changes.push({ index: markIdx, prev: 0, next: 2 });
      newCells[markIdx] = 2;
    }
    markSet.add(markIdx);
  }
}

export function clearAutoMarks(
  newCells: CellValue[],
  changes: CellChange[],
  autoMarks: Set<number>,
): void {
  for (const cellIdx of autoMarks) {
    if (newCells[cellIdx] === 2) {
      changes.push({ index: cellIdx, prev: 2, next: 0 });
      newCells[cellIdx] = 0;
    }
  }
}

export function rebuildAutoMarks(
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

export function computeErrors(
  cells: CellValue[],
  boardSize: number,
  puzzle: Puzzle,
): Set<number> {
  const errors = new Set<number>();
  const starIndices: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 1) starIndices.push(i);
  }

  // Adjacency: any two touching stars are both errors.
  for (let i = 0; i < starIndices.length; i++) {
    for (let j = i + 1; j < starIndices.length; j++) {
      const ri = Math.floor(starIndices[i] / boardSize);
      const ci = starIndices[i] % boardSize;
      const rj = Math.floor(starIndices[j] / boardSize);
      const cj = starIndices[j] % boardSize;
      if (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1) {
        errors.add(starIndices[i]);
        errors.add(starIndices[j]);
      }
    }
  }

  // Row, column, and region overcount in one pass over starIndices.
  const rows = new Map<number, number[]>();
  const cols = new Map<number, number[]>();
  const regionMap = new Map<number, number[]>();
  for (const idx of starIndices) {
    const r = Math.floor(idx / boardSize);
    const c = idx % boardSize;
    let arr = rows.get(r);
    if (arr) arr.push(idx);
    else rows.set(r, [idx]);
    arr = cols.get(c);
    if (arr) arr.push(idx);
    else cols.set(c, [idx]);
    arr = regionMap.get(puzzle.regions[r][c]);
    if (arr) arr.push(idx);
    else regionMap.set(puzzle.regions[r][c], [idx]);
  }
  const flagZone = (map: Map<number, number[]>) => {
    for (const zone of map.values()) {
      if (zone.length > puzzle.stars) {
        for (const idx of zone) errors.add(idx);
      }
    }
  };
  flagZone(rows);
  flagZone(cols);
  flagZone(regionMap);

  return errors;
}

export function checkWin(
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
