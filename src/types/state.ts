export type CellValue = 0 | 1 | 2;

export type PuzzleProgress = {
  puzzleId: string;
  cells: CellValue[];
  timeMs: number;
  completed: boolean;
  completedAt?: number;
  hintsUsed: number;
  currentHintIndex: number;
  updatedAt: number;
};

export type UserSettings = {
  autoX: boolean;
  highlightErrors: boolean;
  showTimer: boolean;
  theme: 'system' | 'light' | 'dark';
  haptics: boolean;
};

export type CellChange = {
  index: number;
  previousValue: CellValue;
};

export type Move = {
  changes: CellChange[];
};
