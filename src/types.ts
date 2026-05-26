import type { ReactNode } from 'react';

// NAVIGATION

export type RootStackParamList = {
  Home: undefined;
  Library: { packId: string };
  // Puzzle accepts two mutually exclusive route shapes — a discriminated union.
  // PuzzleScreen narrows between them with `'streakType' in params`.
  Puzzle:
    | { packId: string; puzzleIndex: number }
    | {
        streakType: StreakType;
        archiveOptions?: { isArchive: boolean; archiveKey: string };
      };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

// COMPONENTS

export type CircleButtonProps = {
  onPress: () => void;
  children: ReactNode;
  hitSlop?: number;
};

export type HeaderProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  absolute?: boolean;
};

export type ErrorBoundaryProps = {
  children: ReactNode;
  onReset?: () => void;
  theme: Theme;
};

export type PaywallModalProps = {
  context: PaywallContext | null;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
};

export type PuzzleCanvasProps = {
  puzzle: Puzzle;
  cells: CellValue[];
  errorCells: Set<number>;
  hintGhosts: Map<number, 'star' | 'mark'>;
  theme: Theme;
  canvasSize: number;
};

export type PuzzleThumbnailProps = {
  puzzle: Puzzle;
  size: number;
  theme: Theme;
  coloredRegions: boolean;
};

export type ToolbarProps = {
  isZoomed: boolean;
  onZoomReset: () => void;
};

export type WinBannerProps = {
  packId: string;
  puzzleIndex: number;
  packName: string;
  isLastPuzzle: boolean;
  streakType?: StreakType;
};

// STATE

export type StreakType = 'daily' | 'weekly' | 'monthly';

export type Streak = {
  type: StreakType;
  current: number;
  lastCompletedKey: string;
};

export type CellValue = 0 | 1 | 2; // 0=empty, 1=star, 2=marked (dot/X)

// 'cycle' advances each cell through empty→marked→star→empty on tap.
// 'erase' clears whatever value is present (noop on empty).
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
  palette: ThemeName;
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

// PUZZLE

export type Coord = [number, number];

export type HintStep = {
  rule: string;     // human-readable description of the logical deduction
  level: number;    // difficulty level of this deduction step (higher = harder)
  placements: Coord[]; // cells where a star should be placed
  marks: Coord[];      // cells that can be ruled out (should be marked)
};

export type RawPuzzle = {
  sbn: string;
  solution: Coord[];
  hints?: HintStep[];
};

export type Puzzle = {
  id: string;
  size: number;
  stars: number;
  regions: number[][];
  regionCells: number[][];
  solution: Coord[];
  hints: HintStep[];
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

// THEME

export type ThemeName = 'original' | 'crimson' | 'gruvbox';

export type Theme = {
  isDark: boolean;
  // 16 color slots — all stored as 'r, g, b' RGB tuples
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  lightGray: string;
  gray: string;

  white: string;
  // Derived — 12 chromatic slots for region fills
  regionColors: string[];
  regionColorAlpha: number;
  spacingMd: number;
  spacingLg: number;
  spacingXl: number;
  radiusMd: number;
  fontSizeSubhead: number;
  fontSizeCallout: number;
  fontSizeBody: number;
  fontWeightSemibold: '600';
  cellSize: number;
};

// USER

export type Entitlements = {
  isPremium: boolean;
  premiumPurchasedAt?: string;
  ownedPackIds: string[];
};

export type PackCatalogItem = {
  id: string;
  name: string;
  gridSize: number;
  stars: number;
  difficulty: 'normal' | 'hard';
  isFree: boolean;
  priceUsd?: number;
  puzzleCount: number;
  storagePath?: string;
};

export type PaywallContext =
  | { type: 'sequential'; packId: string; puzzleIndex: number }
  | {
      type: 'paid-pack';
      packId: string;
      packName: string;
      priceUsd: number | undefined;
      storagePath: string;
    }
  | { type: 'unavailable'; packId: string; packName: string };
