import type { RawPuzzle, Puzzle, HintStep } from '../types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function parsePuzzle(raw: RawPuzzle, puzzleId: string): Puzzle {
  const [header, layout] = raw.sbn.split('.');
  const match = header.match(/^(\d+)x(\d+)$/);
  if (!match) throw new Error(`Bad SBN header: ${header}`);

  const size = parseInt(match[1], 10);
  const stars = parseInt(match[2], 10);

  if (!layout) throw new Error(`SBN layout missing for puzzle ${puzzleId}`);
  if (layout.length < size * size) {
    throw new Error(
      `SBN layout too short: expected ${size * size} chars, got ${
        layout.length
      }`,
    );
  }

  const regions: number[][] = [];
  const regionCells: number[][] = [];
  for (let row = 0; row < size; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < size; col++) {
      const flatIdx = row * size + col;
      const char = layout[flatIdx];
      const regionIdx = LETTERS.indexOf(char.toUpperCase());
      if (regionIdx < 0) {
        throw new Error(
          `SBN: invalid region character '${char}' at [${row},${col}]`,
        );
      }
      rowData.push(regionIdx);
      if (!regionCells[regionIdx]) regionCells[regionIdx] = [];
      regionCells[regionIdx].push(flatIdx);
    }
    regions.push(rowData);
  }

  return {
    id: puzzleId,
    size,
    stars,
    regions,
    regionCells,
    solution: raw.solution,
    hints: (raw.hints ?? []) as HintStep[],
  };
}
