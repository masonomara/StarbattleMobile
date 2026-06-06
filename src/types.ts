import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

// NAVIGATION
// All app-wide types are centralised here per CLAUDE.md. Keep it that way —
// do not export types from component or utility files.

export type RootStackParamList = {
  Home: undefined;
  Library: { packId: string };
  // Puzzle accepts two mutually exclusive route shapes — a discriminated union.
  // PuzzleScreen narrows between them with `'puzzleIndex' in params`.
  Puzzle:
    | { packId: string; puzzleIndex: number }
    | { packId: string; archiveKey?: string };
  ArchivePack: { type: StreakType };
  Tutorial: undefined;
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
  ghost?: boolean;
};

export type HeaderProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  absolute?: boolean;
  bordered?: boolean;
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

export type PackCardProps = {
  name: string;
  meta: string;
  preview?: Puzzle;
  onPress: () => void;
  right?: ReactNode;
  theme: Theme;
  coloredRegions: boolean;
  disabled?: boolean;
};

export type PulseBoxProps = {
  width: number;
  height: number;
  radius?: number;
  baseColor: string;
  style?: StyleProp<ViewStyle>;
};

export type PackCardSkeletonProps = {
  theme: Theme;
};

export type ToolbarProps = {
  isZoomed: boolean;
  onZoomReset: () => void;
  hintDisabledMessage?: string;
};

export type WinBannerProps = {
  packId: string;
  puzzleIndex: number;
  packName: string;
  isLastPuzzle: boolean;
  streakType?: StreakType;
  streakCount?: number;
  tutorial?: boolean;
};

// STATE

export type StreakType = 'daily' | 'weekly' | 'monthly';

export type Streak = {
  type: StreakType;
  current: number;
  best: number;
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
  tutorialSeen: boolean;
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
  rule: string; // human-readable description of the logical deduction
  level: number; // difficulty level of this deduction step (higher = harder)
  placements: Coord[]; // cells where a star should be placed
  marks: Coord[]; // cells that can be ruled out (should be marked)
};

// Shape of "{packId}-hints.json" in Storage. hints[i] is the deduction chain
// for puzzles[i] in the slim pack.
export type HintsFile = {
  version: number;
  hints: HintStep[][];
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
  solutionSet: Set<number>;
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

// All data resolved from route params + remote pack source before a puzzle
// can render. Loaded asynchronously by usePackData; null until ready.
// ARCH: effectivePackId conflates two different ID spaces (streakType string
// vs catalog packId). Consider a discriminated union here to make the
// streak vs library distinction explicit at the type level.
export type PackData = {
  rawPuzzle: RawPuzzle;
  puzzleId: string;
  gridSize: number;
  packName: string;
  // True when this is the final puzzle in a library pack (disables "Next").
  isLastPuzzle: boolean;
  // For streak packs this is the streakType ('daily' | 'weekly' | 'monthly'),
  // NOT the catalog packId. Hints and archive keys are indexed by streakType.
  effectivePackId: string;
  puzzleIndexInPack: number;
  streakType?: StreakType;
};

// THEME

export type RoleColors = {
  text: string;
  textSecondary: string;
  background: string;
  surface: string;
  border: string;
  puzzleBorder: string;
  puzzleInnerBorder: string;
  blue: string;
  red: string;
  green: string;
  yellow: string;
};

export type RegionColors = {
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  orange: string;
  purple: string;
  teal: string;
};

export type ThemeColors = {
  roles: RoleColors;
  regions: RegionColors;
};

// Themes that are shipped and selectable by the user.
// Commented-out names are palette definitions that exist in src/themes/ but
// are not yet exposed in the settings UI (pending design review).
export type ThemeName =
  | 'original'
  | 'primer'
  | 'gruvbox'
  | 'rosePine'
  | 'seoul256'
  | 'tokyoNight';
// Candidates: ayu, catppuccin, everforest, iceberg, nightOwl, nightfox,
//             one, oneHalf, solarized, zenbonesForestbones, zenbonesNeobones,
//             zenbonesRosebones, zenbonesSeoulbones, zenbonesTokyobones,
//             zenbonesZenwritten.

export type PaletteVariants = {
  label: string;
  dark: ThemeColors;
  light: ThemeColors;
};

// APP ICON
// The alternate iOS app-icon names declared in Info.plist (CFBundleAlternateIcons),
// matching the `.icon` files in ios/. `null` means the primary icon (AppIcon),
// which is the "original" theme's artwork.
export type AppIconName =
  | 'AppIcon-gruvbox'
  | 'AppIcon-primer'
  | 'AppIcon-rosePine'
  | 'AppIcon-seoul256'
  | 'AppIcon-tokyoNight'
  | null;

// The in-app-target native module (ios/StarbattleMobile/AppIconModule.m) that
// wraps UIApplication's alternate-icon API. Resolved from NativeModules; may be
// undefined on platforms/builds where it isn't linked (e.g. Android).
export interface AppIconNativeModule {
  getIcon(): Promise<string>;
  setIcon(iconName: string): Promise<string>;
  supportsAlternateIcons(): Promise<boolean>;
}

// DEBT: Theme mixes semantic color roles with design tokens (spacing, radius,
// font sizes). These are different concerns — colors should come from the
// palette; tokens are layout constants that never change per-theme. Consider
// separating them so callers can import tokens directly without needing a
// full theme object (e.g. for non-themed utility components).
// See: src/themes/palettes.ts `tokens` object.
export type Theme = {
  isDark: boolean;
  background: string;
  text: string;
  textSecondary: string;
  surface: string;
  border: string;
  puzzleBorder: string;
  puzzleInnerBorder: string;
  blue: string;
  red: string;
  green: string;
  yellow: string;
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
  difficulty?: 'normal' | 'hard';
  isFree: boolean;
  priceUsd?: number;
  puzzleCount: number;
  storagePath?: string;
  // Present only for streak packs (daily/weekly/monthly). Absent for library packs.
  type?: StreakType;
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
