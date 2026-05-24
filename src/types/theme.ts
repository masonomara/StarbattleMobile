export type ThemeName =
  | 'original'
  | 'crimson'
  | 'emerald'

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
