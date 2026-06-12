import { getViolation } from '../puzzleLogic';
import type { CellValue, Puzzle } from '../../../types';

// The tutorial's contextual header line for the current board: a rule-specific
// error message when something's wrong, otherwise the next bit of guidance.
export function tutorialMessage(cells: CellValue[], puzzle: Puzzle): string {
  const kind = getViolation(cells, puzzle.size, puzzle);
  if (kind === 'adjacency') return 'Stars cannot touch. Not even diagonally.';
  if (kind === 'row') return 'Each row must needs exactly one star.';
  if (kind === 'column') return 'Each column needs exactly one star.';
  if (kind === 'region') return 'Each outlined region needs exactly one star.';
  if (cells.every(c => c !== 1)) {
    return cells.some(c => c === 2)
      ? 'That’s a mark. Tap the cell again to make it a star.'
      : 'Place one star in each row, column, and region with no two touching. Tap a cell to start.';
  }
  return 'Keep going! Place one star in each row, column, and region.';
}
