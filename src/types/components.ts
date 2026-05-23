import type { ReactNode } from 'react';
import type { PaywallContext } from './user';
import type { Puzzle } from './puzzle';
import type { CellValue, StreakType } from './state';
import type { Theme } from './theme';

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
