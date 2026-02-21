export type CellValue = 0 | 1 | 2; // 0=empty, 1=star, 2=marked

export type TapMode = 'cycle' | 'mark' | 'star' | 'erase';

export type Progress = {
  puzzleId: string;
  cells: CellValue[];
  autoMarks?: number[];
  timeMs: number;
  completed: boolean;
  completedAt?: number;
  updatedAt: number;
};

export type UserSettings = {
  autoXNeighbors: boolean;
  autoXRowsCols: boolean;
  autoXRegions: boolean;
  highlightErrors: boolean;
  showTimer: boolean;
  hideToolbar: boolean;
  theme: 'system' | 'light' | 'dark';
  haptics: boolean;
};

export type CellChange = {
  index: number;
  prev: CellValue;
  next: CellValue;
};

export type Move = {
  changes: CellChange[];
  autoMarks: number[];
};

export type UserState = {
  settings: UserSettings;
  completedPuzzles: Set<string>;
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  saveProgress: (progress: Progress) => void;
};
