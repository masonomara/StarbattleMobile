export type Coord = number[]; // [row, col]

export type HintStep = {
  rule: string;
  level: number;
  placements: Coord[];
  marks: Coord[];
};

export type BundledPuzzle = {
  sbn: string;
  solution: Coord[];
  hints: HintStep[];
};

export type PackFile = {
  id: string;
  name: string;
  version: number;
  free: boolean;
  gridSize: number;
  stars: number;
  puzzles: BundledPuzzle[];
};
