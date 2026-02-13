export type Coord = [number, number];

export type HintStep = {
  rule: string;
  level: number;
  placements: Coord[];
  marks: Coord[];
};

export type GamePuzzle = {
  id: string;
  size: number;
  stars: number;
  regions: number[][];
  solution: Coord[];
  hints: HintStep[];
};

export type Pack = {
  id: string;
  name: string;
  gridSize: number;
  stars: number;
  puzzles: GamePuzzle[];
};
