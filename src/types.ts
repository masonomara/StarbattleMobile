import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle, TextStyle, TextProps } from 'react-native';

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
  // Custom right-side content. Takes precedence over the locked/completed/total
  // progress states below (used by StreaksModal to render its own lock).
  right?: ReactNode;
  // Built-in right-side states. `locked` shows a lock icon; otherwise, when
  // `total` is set, a "completed/total puzzles completed" label (with a leading
  // checkmark once the pack is fully solved).
  locked?: boolean;
  completed?: number;
  total?: number;
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

// One circle in a streak progress row (daily → days of the week, weekly → weeks
// of the month, monthly → months of the year).
//   key       — the streak completion key this cell maps to (matches the suffix
//               stored in puzzle_progress, e.g. "2026-06-07" / "2026-W23" / "2026-06")
//   letter    — single-character label drawn in the circle
//   isCurrent — true for the cell that contains "now" (today's day/week/month)
export type StreakCell = {
  key: string;
  letter: string;
  isCurrent: boolean;
};

// Progress row at the bottom of a streak card. Renders one circle per cell,
// filling those whose key is in completedKeys and connecting consecutive solved
// cells. Used for daily, weekly, and monthly with cadence-specific cells.
export type StreakProgressRowProps = {
  cells: StreakCell[];
  completedKeys: Set<string>;
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

// Per-puzzle difficulty grade emitted by the generator. `difficulty` is a raw
// numeric score; `band` is the bucketed label. Carried through but not yet
// surfaced in the UI — present so they can be displayed/sorted on later.
export type DifficultyBand = 'easy' | 'medium' | 'hard';

export type RawPuzzle = {
  sbn: string;
  solution: Coord[];
  difficulty?: number;
  band?: DifficultyBand;
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
  difficulty?: number;
  band?: DifficultyBand;
};

export type Pack = {
  id: string;
  name: string;
  version: number;
  gridSize: number;
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
  // Named typographic roles — the single source of truth for size/leading/
  // weight/tracking. Use via <Text role="..."> so every instance of a role is
  // uniform. Font family is intentionally omitted (system font for Dynamic Type).
  type: Record<TextRole, TextRoleStyle>;
};

// The set of typographic roles (an iOS-style type scale). Pick the closest role
// rather than hardcoding a fontSize. The role owns size/line-height/weight — a
// style should not override fontWeight, so every instance of a role matches.
export type TextRole =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption1'
  | 'caption2';

// Letter spacing is intentionally omitted: with the system font, the OS applies
// its own optical tracking per size, which beats a hand-tuned constant.
export type TextRoleStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle['fontWeight'];
};

// Props for the app's <Text> wrapper: RN TextProps plus an optional role token.
// RN's TextProps already declares an accessibility `role`; omit it so our
// typographic role takes that name (the app doesn't use the ARIA role on Text).
export type AppTextProps = Omit<TextProps, 'role'> & {
  role?: TextRole;
  // Render this text in the platform's system serif instead of the default
  // sans. Orthogonal to `role`: the role still owns size/weight, `serif` only
  // swaps the font family. A `style` fontFamily still wins if set.
  serif?: boolean;
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
