export type CellValue = 0 | 1 | 2; // 0=empty, 1=star, 2=marked

export type Progress = {
  puzzleId: string;
  cells: CellValue[];
  autoMarksNeighbors?: number[];
  autoMarksRowsCols?: number[];
  timeMs: number;
  completed: boolean;
  completedAt?: number;
  updatedAt: number;
};

export type PackProgress = {
  packId: string;
  completedCount: number;
  totalCount: number;
  updatedAt: number;
};

export type UserProfile = {
  id: string;
  isAnonymous: boolean;
};

export type UserSettings = {
  autoXNeighbors: boolean;
  autoXRowsCols: boolean;
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
  prevAutoMarksNeighbors: number[];
  prevAutoMarksRowsCols: number[];
};
