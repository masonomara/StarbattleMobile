import type { Coord, HintStep, GamePuzzle } from './types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type RawPuzzle = {
  sbn: string;
  solution: Coord[];
  hints: HintStep[];
};

export function parsePuzzle(raw: RawPuzzle, puzzleId: string): GamePuzzle {
  const parts = raw.sbn.split('.');
  const header = parts[0];
  const layout = parts[1];
  const match = header.match(/^(\d+)x(\d+)$/);
  if (!match) throw new Error(`Bad SBN header: ${header}`);

  const size = parseInt(match[1], 10);
  const stars = parseInt(match[2], 10);

  const regions: number[][] = [];
  for (let row = 0; row < size; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < size; col++) {
      const char = layout[row * size + col];
      rowData.push(LETTERS.indexOf(char.toUpperCase()));
    }
    regions.push(rowData);
  }

  return {
    id: puzzleId,
    size,
    stars,
    regions,
    solution: raw.solution,
    hints: raw.hints,
  };
}
