import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { PALETTES, tokens } from '../themes/palettes';
import type { Theme, ThemeColors } from '../types';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').slice(0, 6);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toTuple(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

function blend(fg: string, bg: string, alpha: number): string {
  const f = hexToRgb(fg), k = hexToRgb(bg);
  const r = Math.round(alpha * f.r + (1 - alpha) * k.r);
  const g = Math.round(alpha * f.g + (1 - alpha) * k.g);
  const b = Math.round(alpha * f.b + (1 - alpha) * k.b);
  return `${r}, ${g}, ${b}`;
}

export function buildTheme(colors: ThemeColors): Theme {
  const { roles, regions } = colors;

  const bg = hexToRgb(roles.background);
  const luminance = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255;
  const isDark = luminance < 0.5;

  return {
    isDark,
    black: isDark ? toTuple(roles.background) : toTuple(roles.text),
    white: isDark ? toTuple(roles.text) : toTuple(roles.background),
    red: toTuple(regions.red),
    green: toTuple(regions.green),
    yellow: toTuple(regions.yellow),
    blue: toTuple(roles.blue),
    magenta: toTuple(regions.magenta),
    cyan: toTuple(regions.cyan),
    gray: blend(roles.text, roles.background, isDark ? 0.40 : 0.45),
    lightGray: blend(roles.text, roles.background, isDark ? 0.25 : 0.30),
    regionColors: [
      toTuple(regions.red),
      toTuple(regions.green),
      toTuple(regions.yellow),
      toTuple(regions.blue),
      toTuple(regions.magenta),
      toTuple(regions.cyan),
      toTuple(regions.redBright),
      toTuple(regions.greenBright),
      toTuple(regions.yellowBright),
      toTuple(regions.blueBright),
      toTuple(regions.magentaBright),
      toTuple(regions.cyanBright),
    ],
    regionColorAlpha: isDark ? 0.15 : 0.10,
    ...tokens,
  };
}

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themePref = useSettingsStore(s => s.settings.theme);
  const palette = useSettingsStore(s => s.settings.palette);

  const isDark =
    themePref === 'dark' ? true
    : themePref === 'light' ? false
    : systemScheme === 'dark';

  const group = PALETTES[palette] ?? PALETTES.gruvbox;
  return buildTheme(isDark ? group.dark : group.light);
}
