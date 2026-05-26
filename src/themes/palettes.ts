import type { ThemeName } from '../types.ts';

export const tokens = {
  spacingMd: 12,
  spacingLg: 16,
  spacingXl: 24,
  radiusMd: 12,
  fontSizeSubhead: 15,
  fontSizeCallout: 16,
  fontSizeBody: 17,
  fontWeightSemibold: '600' as const,
  cellSize: 36,
};

export type PaletteColors = {
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
};

// ─── ORIGINAL ────────────────────────────────────────────────────────────────

const originalLight: PaletteColors = {
  black: '31, 35, 40',
  red: '209, 36, 47',
  green: '26, 127, 55',
  yellow: '154, 103, 0',
  blue: '9, 105, 218',
  magenta: '191, 57, 137',
  cyan: '27, 124, 131',
  lightGray: '209, 217, 224',
  gray: '89, 99, 110',
  white: '255, 255, 255',
};

const originalDark: PaletteColors = {
  black: '13, 17, 23',
  red: '248, 81, 73',
  green: '63, 185, 80',
  yellow: '210, 153, 34',
  blue: '68, 147, 248',
  magenta: '171, 125, 248',
  cyan: '57, 197, 207',
  lightGray: '145, 152, 161',
  gray: '61, 68, 77',
  white: '240, 246, 252',
};

// ─── CRIMSON ─────────────────────────────────────────────────────────────────

const crimsonLight: PaletteColors = {
  black: '0, 0, 0',
  red: '160, 20, 20',
  green: '0, 120, 40',
  yellow: '160, 80, 0',
  blue: '60, 0, 120',
  magenta: '140, 0, 80',
  cyan: '0, 100, 120',
  lightGray: '192, 192, 192',
  gray: '128, 128, 128',
  white: '255, 255, 255',
};

const crimsonDark: PaletteColors = { ...crimsonLight };

// ─── GRUVBOX ─────────────────────────────────────────────────────────────────

const gruvboxDark: PaletteColors = {
  black: '40, 40, 40',
  red: '204, 36, 29',
  green: '152, 151, 26',
  yellow: '215, 153, 33',
  blue: '69, 133, 136',
  magenta: '177, 98, 134',
  cyan: '104, 157, 106',
  lightGray: '168, 153, 132',
  gray: '146, 131, 116',
  white: '235, 219, 178',
};

const gruvboxLight: PaletteColors = {
  black: '60, 56, 54',
  red: '204, 36, 29',
  green: '104, 157, 106',
  yellow: '215, 153, 33',
  blue: '69, 133, 136',
  magenta: '177, 98, 134',
  cyan: '104, 157, 106',
  gray: '124, 111, 100',
  lightGray: '146, 131, 116',
  white: '251, 241, 199',
};

// ─── Exports ─────────────────────────────────────────────────────────────────

export const PALETTES: Record<
  ThemeName,
  { light: PaletteColors; dark: PaletteColors }
> = {
  original: { light: originalLight, dark: originalDark },
  crimson: { light: crimsonLight, dark: crimsonDark },
  gruvbox: { light: gruvboxLight, dark: gruvboxDark },
};

export const PALETTE_META: Record<ThemeName, { label: string }> = {
  original: { label: 'Original' },
  crimson: { label: 'Crimson' },
  gruvbox: { label: 'Gruvbox' },
};

export const PALETTE_NAMES = Object.keys(PALETTES) as ThemeName[];
