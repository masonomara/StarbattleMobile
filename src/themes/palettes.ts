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
  text: '#1f2328',
  textSecondary: '#59636e',
  regionBorder: '#1f2328',
  innerBorder: '#59636e',
  highlight: '#E6EAEF',
  onHighlight: '#1f2328',
  shadow: '#25292E',
  overlay: '#c8d1da66',
  accent: '#0969da',
  onAccent: '#ffffff',
  markColor: '#d1242f',
  errorStar: '#d1242f',
  regionColors: regionColorsLight,
  ...tokens,
};

const originalDark: Theme = {
  isDark: true,
  bg: '#0d1117',
  card: '#151B23',
  text: '#F0F6FC',
  textSecondary: '#9198A1',
  regionBorder: '#f0f6fc',
  innerBorder: '#9198A1',
  highlight: '#2A313C',
  onHighlight: '#f0f6fc',
  shadow: '#010409',
  overlay: '#c8d1da66',
  accent: '#4493f8',
  onAccent: '#0d1117',
  markColor: '#f85149',
  errorStar: '#f85149',
  regionColors: regionColorsDark,
  ...tokens,
};

// ─── CRIMSON ─────────────────────────────────────────────────────────────────
// Accent is red — violet marks and orange error star avoid collision.

const crimsonLight: Theme = {
  isDark: false,
  bg: '#EFF1F5',
  card: '#EFF1F5',
  text: '#4C4F69',
  textSecondary: '#6C6F85',
  regionBorder: '#4C4F69',
  innerBorder: '#6C6F85',
  highlight: '#DCE0E8',
  onHighlight: '#4C4F69',
  shadow: '#5C5F77',
  overlay: '#5C5F7766',
  accent: '#1E66F5',
  onAccent: '#EFF1F5',
  markColor: '#D20F39',
  errorStar: '#D20F39',
  regionColors: regionColorsLight,
  ...tokens,
};

const crimsonDark: Theme = {
  isDark: true,
  bg: '#1E1E2E',
  card: '#313244',
  text: '#CDD6F4',
  textSecondary: '#A6ADC8',
  regionBorder: '#cdd6f4',
  innerBorder: '#A6ADC8',
  highlight: '#585B70',
  onHighlight: '#CDD6F4',
  shadow: '#11111B',
  overlay: '#11111B66',
  accent: '#89b4fa',
  onAccent: '#1E1E2E',
  markColor: '#f38ba8',
  errorStar: '#f38ba8',
  regionColors: regionColorsDark,
  ...tokens,
};

// ─── EMERALD ─────────────────────────────────────────────────────────────────

const emeraldLight: Theme = {
  isDark: false,
  bg: '#FAF4ED',
  card: '#FAF4ED',
  text: '#575279',
  textSecondary: '#797593',
  regionBorder: '#575279',
  innerBorder: '#797593',
  highlight: '#F2E9E1',
  onHighlight: '#575279',
  shadow: '#575279',
  overlay: '#F2E9E166',
  accent: '#286983',
  onAccent: '#FAF4ED',
  markColor: '#B4637A',
  errorStar: '#B4637A',
  regionColors: regionColorsLight,
  ...tokens,
};

const emeraldDark: Theme = {
  isDark: true,
  bg: '#141A17',
  card: '#1A221E',
  text: '#E4EFE8',
  textSecondary: '#A8C4B0',
  regionBorder: '#E4EFE8',
  innerBorder: '#5A7A62',
  highlight: '#1F2E25',
  onHighlight: '#A8C4B0',
  shadow: '#0C120F',
  overlay: 'rgba(0,0,0,0.5)',
  accent: '#10B981',
  onAccent: '#FFFFFF',
  markColor: '#F57970',
  errorStar: '#E53935',
  regionColors: regionColorsDark,
  ...tokens,
};

// ─── AMBER ───────────────────────────────────────────────────────────────────
// Dark accent is bright gold — needs dark text on buttons.

const amberLight: Theme = {
  isDark: false,
  bg: '#FFFEF8',
  card: '#FFFEF8',
  text: '#1F2328',
  textSecondary: '#5A5040',
  regionBorder: '#060607',
  innerBorder: '#060607',
  highlight: '#F5F0E5',
  onHighlight: '#5A5040',
  shadow: '#EEE9DA',
  overlay: 'rgba(0,0,0,0.4)',
  accent: '#D97706',
  onAccent: '#FFFFFF',
  markColor: '#B52C21',
  errorStar: '#E53935',
  regionColors: regionColorsLight,
  ...tokens,
};

const amberDark: Theme = {
  isDark: true,
  bg: '#1C1810',
  card: '#231F14',
  text: '#F0EBD8',
  textSecondary: '#C4B48A',
  regionBorder: '#F0EBD8',
  innerBorder: '#7A6A48',
  highlight: '#2F2814',
  onHighlight: '#C4B48A',
  shadow: '#130F08',
  overlay: 'rgba(0,0,0,0.5)',
  accent: '#F59E0B',
  onAccent: '#78350F',
  markColor: '#F57970',
  errorStar: '#E53935',
  regionColors: regionColorsDark,
  ...tokens,
};

// ─── VIOLET ──────────────────────────────────────────────────────────────────

const violetLight: Theme = {
  isDark: false,
  bg: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1F2328',
  textSecondary: '#524A5A',
  regionBorder: '#060607',
  innerBorder: '#060607',
  highlight: '#EEEBF5',
  onHighlight: '#524A5A',
  shadow: '#E9E6F0',
  overlay: 'rgba(0,0,0,0.4)',
  accent: '#7C3AED',
  onAccent: '#FFFFFF',
  markColor: '#B52C21',
  errorStar: '#E53935',
  regionColors: regionColorsLight,
  ...tokens,
};

const violetDark: Theme = {
  isDark: true,
  bg: '#16111E',
  card: '#1D1528',
  text: '#EDE8F5',
  textSecondary: '#B8A8D0',
  regionBorder: '#EDE8F5',
  innerBorder: '#6A5A88',
  highlight: '#261A38',
  onHighlight: '#B8A8D0',
  shadow: '#0F0A14',
  overlay: 'rgba(0,0,0,0.5)',
  accent: '#8B5CF6',
  onAccent: '#FFFFFF',
  markColor: '#F57970',
  errorStar: '#E53935',
  regionColors: regionColorsDark,
  ...tokens,
};

// ─── MIDNIGHT ────────────────────────────────────────────────────────────────

const midnightLight: Theme = {
  isDark: false,
  bg: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1F2328',
  textSecondary: '#4A5060',
  regionBorder: '#060607',
  innerBorder: '#060607',
  highlight: '#E8EDF5',
  onHighlight: '#4A5060',
  shadow: '#E5EBF0',
  overlay: 'rgba(0,0,0,0.4)',
  accent: '#1D4ED8',
  onAccent: '#FFFFFF',
  markColor: '#B52C21',
  errorStar: '#E53935',
  regionColors: regionColorsLight,
  ...tokens,
};

const midnightDark: Theme = {
  isDark: true,
  bg: '#0F1624',
  card: '#152035',
  text: '#E8EEF8',
  textSecondary: '#8AA0C8',
  regionBorder: '#E8EEF8',
  innerBorder: '#3A5080',
  highlight: '#1B2E50',
  onHighlight: '#8AA0C8',
  shadow: '#081018',
  overlay: 'rgba(0,0,0,0.5)',
  accent: '#2563EB',
  onAccent: '#FFFFFF',
  markColor: '#F57970',
  errorStar: '#E53935',
  regionColors: regionColorsDark,
  ...tokens,
};

// ─── Exports ─────────────────────────────────────────────────────────────────

export const PALETTES: Record<ThemeName, { light: Theme; dark: Theme }> = {
  original: { light: originalLight, dark: originalDark },
  crimson: { light: crimsonLight, dark: crimsonDark },
  emerald: { light: emeraldLight, dark: emeraldDark },
  amber: { light: amberLight, dark: amberDark },
  violet: { light: violetLight, dark: violetDark },
  midnight: { light: midnightLight, dark: midnightDark },
};

export const PALETTE_META: Record<
  ThemeName,
  { label: string; accent: string }
> = {
  original: { label: 'Original', accent: '#ffffff' },
  crimson: { label: 'Latte', accent: '#EFF1F5' },
  emerald: { label: 'Rose', accent: '#FAF4ED' },
  amber: { label: 'Amber', accent: '#D97706' },
  violet: { label: 'Violet', accent: '#7C3AED' },
  midnight: { label: 'Midnight', accent: '#1D4ED8' },
};

export const PALETTE_NAMES = Object.keys(PALETTES) as ThemeName[];
