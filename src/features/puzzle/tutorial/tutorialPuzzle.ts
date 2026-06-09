import { parsePuzzle } from '../../../utils/parsePuzzle';
import type { Puzzle } from '../../../types';

// A real 5×5 / 1★ puzzle (the easiest in 5x5-normal). Swappable for any valid
// 5×5 single-star puzzle. Loaded into the puzzle store by PuzzleScreen in
// tutorial mode (id 'tutorial', which progress.ts refuses to persist).
const TUTORIAL_SBN = '5x1.DBBCCDBBCCDAAACDAAAEAAAAA.s761168475d1l4c13v1';
const TUTORIAL_SOLUTION: [number, number][] = [
  [0, 1],
  [1, 3],
  [2, 0],
  [3, 4],
  [4, 2],
];

export const TUTORIAL_PUZZLE: Puzzle = parsePuzzle(
  { sbn: TUTORIAL_SBN, solution: TUTORIAL_SOLUTION },
  'tutorial',
);
