import type { Theme, ThemeName } from '../types/theme';

const tokens = {
  spacingMd: 12,
  spacingLg: 16,
  spacingXl: 24,
  radiusMd: 12,
  fontSizeSubhead: 15,
  fontSizeCallout: 16,
  fontSizeBody: 17,
  fontWeightSemibold: '600' as const,
  cellSize: 32,
};

const regionColorsLight = [
  '#E8EAF6', // indigo
  '#E3F2FD', // blue
  '#E8F5E9', // green
  '#FFF8E1', // amber
  '#FCE4EC', // rose
  '#F3E5F5', // purple
  '#E0F7FA', // cyan
  '#FBE9E7', // red-orange
  '#F9FBE7', // lime
  '#EDE7F6', // deep purple
  '#E0F2F1', // teal
  '#FFF3E0', // orange
];

const regionColorsDark = [
  '#283593', // indigo
  '#1565C0', // blue
  '#2E7D32', // green
  '#F9A825', // amber
  '#AD1457', // rose
  '#6A1B9A', // purple
  '#00838F', // cyan
  '#BF360C', // red-orange
  '#827717', // lime
  '#4527A0', // deep purple
  '#00695C', // teal
  '#E65100', // orange
];

// ─── BLURPLE ─────────────────────────────────────────────────────────────────

const originalLight: Theme = {
  isDark: false,
  bg: '#ffffff',
  card: '#ffffff',
  text: '#1F2328',
  textSecondary: '#59636E',
  accent: '#0969da',
  markColor: '#d1242f',
  regionColors: regionColorsLight,
  ...tokens,
};

const originalDark: Theme = {
  isDark: true,
  bg: '#0d1117',
  card: '#151B23',
  text: '#F0F6FC',
  textSecondary: '#9198A1',
  accent: '#4493f8',
  markColor: '#f85149',
  regionColors: regionColorsDark,
  ...tokens,
};

// ─── CRIMSON ─────────────────────────────────────────────────────────────────

const crimsonLight: Theme = {
  isDark: false,
  bg: '#F6F8FA',
  card: '#F6F8FA',
  text: '#1F2328',
  textSecondary: '#6E7781',
  accent: '#0969DA',
  markColor: '#CF222E',
  regionColors: regionColorsLight,
  ...tokens,
};

const crimsonDark: Theme = {
  isDark: true,
  bg: '#010409',
  card: '#484F58',
  text: '#E6EDF3',
  textSecondary: '#B1BAC4',
  accent: '#89b4fa',
  markColor: '#f38ba8',
  regionColors: regionColorsDark,
  ...tokens,
};

// ─── EMERALD ─────────────────────────────────────────────────────────────────

const emeraldLight: Theme = {
  isDark: false,
  bg: '#FFFAF3',
  card: '#FFFAF3',
  text: '#575279',
  textSecondary: '#575279',
  accent: '#907AA9',
  markColor: '#B4637A',
  regionColors: regionColorsLight,
  ...tokens,
};

const emeraldDark: Theme = {
  isDark: true,
  bg: '#141A17',
  card: '#1A221E',
  text: '#E4EFE8',
  textSecondary: '#A8C4B0',
  accent: '#10B981',
  markColor: '#F57970',
  regionColors: regionColorsDark,
  ...tokens,
};

// ─── Exports ─────────────────────────────────────────────────────────────────

export const PALETTES: Record<ThemeName, { light: Theme; dark: Theme }> = {
  original: { light: originalLight, dark: originalDark },
  crimson: { light: crimsonLight, dark: crimsonDark },
  emerald: { light: emeraldLight, dark: emeraldDark },
};

export const PALETTE_META: Record<
  ThemeName,
  { label: string; accent: string }
> = {
  original: { label: 'Original', accent: '#ffffff' },
  crimson: { label: 'Latte', accent: '#EFF1F5' },
  emerald: { label: 'Rose Pine', accent: '#907AA9' },
};

export const PALETTE_NAMES = Object.keys(PALETTES) as ThemeName[];
