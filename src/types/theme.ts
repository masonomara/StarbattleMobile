export type ThemeName =
  | 'original'
  | 'crimson'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'midnight';

export type Theme = {
  isDark: boolean;
  bg: string;
  card: string;
  text: string;
  textSecondary: string;
  regionBorder: string;
  innerBorder: string;
  markColor: string;
  accent: string;
  onAccent: string;
  highlight: string;
  onHighlight: string;
  shadow: string;
  overlay: string;
  errorStar: string;
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
