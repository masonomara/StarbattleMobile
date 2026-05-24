import type { ReactNode } from 'react';

// NAVIGATION

export type RootStackParamList = {
  Home: undefined;
  Library: { packId: string };
  Puzzle:
    | { packId: string; puzzleIndex: number; streakType?: never }
    | {
        streakType: StreakType;
        isArchive?: boolean;
        archiveKey?: string;
        packId?: never;
        puzzleIndex?: never;
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
  rule: string;
  level: number;
  placements: Coord[];
  marks: Coord[];
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

export type ThemeName = 'original' | 'crimson' | 'emerald';

export type Theme = {
  isDark: boolean;
  bg: string;
  card: string;
  text: string;
  textSecondary: string;
  markColor: string;
  accent: string;
  regionColors: string[];
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
