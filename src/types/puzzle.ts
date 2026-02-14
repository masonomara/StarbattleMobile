export type Coord = [number, number];

export type RawPuzzle = {
  sbn: string;
  solution: Coord[];
  hints?: unknown; // Hints aren't used yet, will be installed later
};

export type Puzzle = {
  id: string;
  size: number;
  stars: number;
  regions: number[][];
  solution: Coord[];
};

export type Pack = {
  id: string;
  name: string;
  version: number;
  free: boolean;
  gridSize: number;
  stars: number;
  puzzles: RawPuzzle[];
};

export type Borders = {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
};
