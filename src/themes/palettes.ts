import type {
  ThemeName,
  ThemeColors,
  PaletteVariants,
  TextRole,
  TextRoleStyle,
} from '../types';

// Typographic role tokens — one complete bundle per role, the single source of
// truth for text styling (an iOS-style type scale). fontWeight 600 = semibold,
// 400 = regular. No fontFamily here: the Text wrapper applies the base font
// (Karla), resolving each role's fontWeight to the matching Karla face.
const type: Record<TextRole, TextRoleStyle> = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
  },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '600' },
};

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
  type,
};

// ─── ORIGINAL ────────────────────────────────────────────────────────────────────

const originalDark: ThemeColors = {
  roles: {
    text: '#F0F6FC',
    textSecondary: '#9198A1',
    background: '#0D1117',
    surface: '#151B23',
    border: '#3D444D',
    puzzleBorder: '#F0F6FC',
    puzzleInnerBorder: '#3D444D',
    blue: '#4493F8',
    red: '#F85149',
    green: '#3FB950',
    yellow: '#D29922',
  },
  regions: {
    red: '#F85149',
    orange: '#E57536',
    yellow: '#D29922',
    green: '#3FB950',
    teal: '#3CBF90',
    cyan: '#39C5CF',
    blue: '#4493F8',
    purple: '#A371F7',
    magenta: '#CE61A0',
  },
};

const originalLight: ThemeColors = {
  roles: {
    text: '#1F2328',
    textSecondary: '#59636E',
    background: '#fff',
    surface: '#fff',
    border: '#D1D9E0',
    puzzleBorder: '#1F2328',
    puzzleInnerBorder: '#59636E',
    blue: '#0969DA',
    red: '#D1242F',
    green: '#1A7F37',
    yellow: '#9A6700',
  },
  regions: {
    red: '#D1242F',
    orange: '#B64618',
    yellow: '#9A6700',
    green: '#1A7F37',
    teal: '#31A18C',
    cyan: '#47c2e1',
    blue: '#0969DA',
    purple: '#8250DF',
    magenta: '#AA3A87',
  },
};

// ─── GITHUB ──────────────────────────────────────────────────────────────────────

const primerDark: ThemeColors = {
  roles: {
    text: '#e6edf3',
    textSecondary: '#9499A1',
    background: '#010409',
    surface: '#242630',
    border: '#474953',
    puzzleBorder: '#e6edf3',
    puzzleInnerBorder: '#9499A1',
    blue: '#58a6ff',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#9A6700',
  },
  regions: {
    red: '#ff7b72',
    orange: '#E98A4A',
    yellow: '#9A6700',
    green: '#3fb950',
    teal: '#3CBF90',
    cyan: '#39c5cf',
    blue: '#58a6ff',
    purple: '#a375ff',
    magenta: '#D178B9',
  },
};

const primerLight: ThemeColors = {
  roles: {
    text: '#1f2328',
    textSecondary: '#5F6267',
    background: '#f6f8fa',
    surface: '#f6f8fa',
    border: '#CFD2D4',
    puzzleBorder: '#1f2328',
    puzzleInnerBorder: '#5F6267',
    blue: '#0969da',
    red: '#cf222e',
    green: '#116329',
    yellow: '#9a6700',
  },
  regions: {
    red: '#cf222e',
    orange: '#B54517',
    yellow: '#9a6700',
    green: '#116329',
    teal: '#167056',
    cyan: '#1b7c83',
    blue: '#0969da',
    purple: '#6e40c9',
    magenta: '#9F317C',
  },
};

// ─── GRUVBOX ─────────────────────────────────────────────────────────────────────

const gruvboxDark: ThemeColors = {
  roles: {
    text: '#ebdbb2',
    textSecondary: '#9D937B',
    background: '#282828',
    surface: '#32312F',
    border: '#534F46',
    puzzleBorder: '#ebdbb2',
    puzzleInnerBorder: '#9D937B',
    blue: '#458588',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
  },
  regions: {
    red: '#cc241d',
    orange: '#D25F1F',
    yellow: '#d79921',
    green: '#98971a',
    teal: '#579179',
    cyan: '#689d6a',
    blue: '#458588',
    purple: '#8458a3',
    magenta: '#A83E60',
  },
};

const gruvboxLight: ThemeColors = {
  roles: {
    text: '#3c3836',
    textSecondary: '#756F61',
    background: '#fbf1c7',
    surface: '#fbf1c7',
    border: '#D9D0AD',
    puzzleBorder: '#3c3836',
    puzzleInnerBorder: '#756F61',
    blue: '#458588',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
  },
  regions: {
    red: '#cc241d',
    orange: '#D25F1F',
    yellow: '#d79921',
    green: '#98971a',
    teal: '#579179',
    cyan: '#689d6a',
    blue: '#458588',
    purple: '#8458a3',
    magenta: '#A83E60',
  },
};

// ─── ROSE PINE ───────────────────────────────────────────────────────────────────

const rosePineDefault: ThemeColors = {
  roles: {
    text: '#e0def4',
    textSecondary: '#9391A5',
    background: '#1f1d2e',
    surface: '#292738',
    border: '#494759',
    puzzleBorder: '#e0def4',
    puzzleInnerBorder: '#9391A5',
    blue: '#9ccfd8',
    red: '#eb6f92',
    green: '#31748f',
    yellow: '#f6c177',
  },
  regions: {
    red: '#eb6f92',
    orange: '#F19885',
    yellow: '#f6c177',
    green: '#31748f',
    teal: '#949B83',
    cyan: '#ebbcba',
    blue: '#9ccfd8',
    purple: '#ae8ce3',
    magenta: '#A5AEDE',
  },
};

const rosePineDawn: ThemeColors = {
  roles: {
    text: '#575279',
    textSecondary: '#9A95AA',
    background: '#fffaf3',
    surface: '#fffaf3',
    border: '#DAD5D8',
    puzzleBorder: '#575279',
    puzzleInnerBorder: '#9A95AA',
    blue: '#56949f',
    red: '#b4637a',
    green: '#286983',
    yellow: '#ea9d34',
  },
  regions: {
    red: '#b4637a',
    orange: '#CF8057',
    yellow: '#ea9d34',
    green: '#286983',
    teal: '#89835C',
    cyan: '#d7827e',
    blue: '#56949f',
    purple: '#8b6bb0',
    magenta: '#7180A8',
  },
};

// ─── SEOUL256 ────────────────────────────────────────────────────────────────────

const seoul256Dark: ThemeColors = {
  roles: {
    text: '#d0d0d0',
    textSecondary: '#949494',
    background: '#3a3a3a',
    surface: '#424242',
    border: '#5B5B5B',
    puzzleBorder: '#d0d0d0',
    puzzleInnerBorder: '#949494',
    blue: '#85add4',
    red: '#d68787',
    green: '#5f865f',
    yellow: '#d8af5f',
  },
  regions: {
    red: '#d68787',
    orange: '#D79B73',
    yellow: '#d8af5f',
    green: '#5f865f',
    teal: '#739B87',
    cyan: '#87afaf',
    blue: '#85add4',
    purple: '#afa0d4',
    magenta: '#C394AE',
  },
};

const seoul256Light: ThemeColors = {
  roles: {
    text: '#4e4e4e',
    textSecondary: '#787878',
    background: '#dadada',
    surface: '#dadada',
    border: '#C1C1C1',
    puzzleBorder: '#4e4e4e',
    puzzleInnerBorder: '#787878',
    blue: '#5f87ae',
    red: '#af5f5f',
    green: '#5f885f',
    yellow: '#af8760',
  },
  regions: {
    red: '#af5f5f',
    orange: '#AF7360',
    yellow: '#af8760',
    green: '#5f885f',
    teal: '#6773A6',
    cyan: '#5f8787',
    blue: '#5f87ae',
    purple: '#6f5f9e',
    magenta: '#8F5F7F',
  },
};

// ─── TOKYO NIGHT ─────────────────────────────────────────────────────────────────

const tokyoNightDefault: ThemeColors = {
  roles: {
    text: '#c0caf5',
    textSecondary: '#7E84A2',
    background: '#1a1b26',
    surface: '#222431',
    border: '#3E4153',
    puzzleBorder: '#c0caf5',
    puzzleInnerBorder: '#7E84A2',
    blue: '#7aa2f7',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
  },
  regions: {
    red: '#f7768e',
    orange: '#EC937B',
    yellow: '#e0af68',
    green: '#9ece6a',
    teal: '#8ECFB5',
    cyan: '#7dcfff',
    blue: '#7aa2f7',
    purple: '#9d7cd8',
    magenta: '#CA79B3',
  },
};

const tokyoNightDay: ThemeColors = {
  roles: {
    text: '#3760bf',
    textSecondary: '#7B94CF',
    background: '#e1e2e7',
    surface: '#e1e2e7',
    border: '#BCC5DE',
    puzzleBorder: '#3760bf',
    puzzleInnerBorder: '#7B94CF',
    blue: '#2e7de9',
    red: '#f52a65',
    green: '#587539',
    yellow: '#8c6c3e',
  },
  regions: {
    red: '#f52a65',
    orange: '#C14B52',
    yellow: '#8c6c3e',
    green: '#587539',
    teal: '#5362D3',
    cyan: '#007197',
    blue: '#2e7de9',
    purple: '#7847bd',
    magenta: '#B73991',
  },
};

// ─── Exports ───────────────────────────────────────────────────────────────────

export const PALETTES: Record<ThemeName, PaletteVariants> = {
  original: {
    label: 'Original',
    dark: originalDark,
    light: originalLight,
  },
  seoul256: {
    label: 'Seoul256',
    dark: seoul256Dark,
    light: seoul256Light,
  },
  primer: {
    label: 'Primer',
    dark: primerDark,
    light: primerLight,
  },
  rosePine: {
    label: 'Rosé Pine',
    dark: rosePineDefault,
    light: rosePineDawn,
  },
  gruvbox: {
    label: 'Gruvbox',
    dark: gruvboxDark,
    light: gruvboxLight,
  },
  tokyoNight: {
    label: 'Tokyo Night',
    dark: tokyoNightDefault,
    light: tokyoNightDay,
  },
};

export const PALETTE_NAMES = Object.keys(PALETTES) as ThemeName[];
