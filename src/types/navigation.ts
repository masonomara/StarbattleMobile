export type RootStackParamList = {
  Home: undefined;
  PackList: undefined;
  PuzzleSelect: { packId: string };
  Puzzle: { packId: string; puzzleIndex: number };
};
