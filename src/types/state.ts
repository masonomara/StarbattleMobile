export type StreakType = 'daily' | 'weekly' | 'monthly';

export type Streak = {
  type: StreakType;
  current: number;
  lastCompletedKey: string;
};

export type CellValue = 0 | 1 | 2; // 0=empty, 1=star, 2=marked

export type TapMode = 'cycle' | 'erase';

export type UserSettings = {
  autoXNeighbors: boolean;
  autoXRowsCols: boolean;
  autoXRegions: boolean;
  highlightErrors: boolean;
  coloredRegions: boolean;
  alwaysShowTimer: boolean;
  alwaysShowToolbar: boolean;
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

export type DrawLayerHandle = {
  addCell: (idx: number, value: CellValue) => void;
  reset: () => void;
};
