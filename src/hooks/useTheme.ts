import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { PALETTES, tokens } from '../themes/palettes';
import type { Theme, ThemeColors } from '../types';

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '').slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function buildTheme(colors: ThemeColors): Theme {
  const { roles, regions } = colors;
  const isDark = hexLuminance(roles.background) < 0.5;
  return {
    isDark,
    background: roles.background,
    text: roles.text,
    textSecondary: roles.textSecondary,
    surface: roles.surface,
    border: roles.border,
    puzzleBorder: roles.puzzleBorder,
    puzzleInnerBorder: roles.puzzleInnerBorder,
    blue: roles.blue,
    red: roles.red,
    green: roles.green,
    yellow: roles.yellow,
    regionColors: [
      regions.red, regions.green, regions.yellow, regions.blue,
      regions.magenta, regions.cyan,
      regions.redBright, regions.greenBright, regions.yellowBright,
      regions.blueBright, regions.magentaBright, regions.cyanBright,
    ],
    regionColorAlpha: isDark ? 0.15 : 0.15,
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
