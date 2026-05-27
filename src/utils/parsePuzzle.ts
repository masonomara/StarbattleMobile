import type { RawPuzzle, Puzzle, HintStep } from '../types';

// SBN (Star Battle Notation) encodes a puzzle as "<size>x<stars>.<layout>".
// - size:   grid dimension (e.g. 8 for an 8×8 grid)
// - stars:  how many stars each row, column, and region must contain
// - layout: a flat, row-major string of capital letters (one per cell) where each
//           letter identifies which region that cell belongs to.
//   Example: "5x1.AABBBACCCBBACDDDEAEEE" → 5×5 grid, 1 star per region, 5 regions A–E.
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function parsePuzzle(raw: RawPuzzle, puzzleId: string): Puzzle {
  try {
    return _parsePuzzle(raw, puzzleId);
  } catch (e) {
    console.error('[SB:PACK] threw for puzzle', puzzleId, '— raw keys:', Object.keys(raw ?? {}), 'sbn:', (raw as RawPuzzle | undefined)?.sbn?.slice(0, 40), 'error:', e);
    throw e;
  }
}

function _parsePuzzle(raw: RawPuzzle, puzzleId: string): Puzzle {
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
