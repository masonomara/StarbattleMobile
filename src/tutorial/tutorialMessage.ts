import { getViolation } from '../utils/puzzleLogic';
import type { CellValue, Puzzle } from '../types';

// The tutorial's contextual header line for the current board: a rule-specific
// error message when something's wrong, otherwise the next bit of guidance.
export function tutorialMessage(cells: CellValue[], puzzle: Puzzle): string {
  const kind = getViolation(cells, puzzle.size, puzzle);
  if (kind === 'adjacency') return "Stars can't touch.";
  if (kind === 'row') return 'Each row must have exactly 1 star.';
  if (kind === 'column') return 'Each column must have exactly 1 star.';
  if (kind === 'region') return 'Each region must have exactly 1 star.';
  if (cells.every(c => c !== 1)) {
    return cells.some(c => c === 2)
      ? 'Tap the same cell to turn it into a star.'
      : 'Tap a cell to place an X.';
  }
  return 'The puzzle is complete when each row, column, and region have exactly one star.';
}
