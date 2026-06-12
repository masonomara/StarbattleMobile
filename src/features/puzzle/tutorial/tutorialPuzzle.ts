import { parsePuzzle } from '../../../shared/lib/parsePuzzle';
import type { Puzzle } from '../../../types';

// A real 5×5 / 1★ puzzle (a random easy board from the 5x5-mania pack). Swappable
// for any valid 5×5 single-star puzzle. Loaded into the puzzle store by
// PuzzleScreen in tutorial mode (id 'tutorial', which progress.ts refuses to persist).
const TUTORIAL_SBN = '5x1.CADDDCAADDAAAADAAAEEAABBB.s-1382643181d38l5c12v1';
const TUTORIAL_SOLUTION: [number, number][] = [
  [0, 0],
  [1, 3],
  [2, 1],
  [3, 4],
  [4, 2],
];

export const TUTORIAL_PUZZLE: Puzzle = parsePuzzle(
  { sbn: TUTORIAL_SBN, solution: TUTORIAL_SOLUTION },
  'tutorial',
);
