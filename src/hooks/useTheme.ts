import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { PALETTES, tokens } from '../themes/palettes';
import type { PaletteColors } from '../themes/palettes';
import type { Theme } from '../types';

export function buildTheme(colors: PaletteColors, isDark: boolean): Theme {
  return {
    isDark,
    ...colors,
    regionColors: [
      colors.red,
      colors.green,
      colors.yellow,
      colors.blue,
      colors.magenta,
      colors.cyan,
    ],
    regionColorAlpha: isDark ? 0.20 : 0.15,
    ...tokens,
  };
}

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themePref = useSettingsStore(s => s.settings.theme);
  const palette = useSettingsStore(s => s.settings.palette);

  const isDark =
    themePref === 'dark'
      ? true
      : themePref === 'light'
      ? false
      : systemScheme === 'dark';

  const colors = (PALETTES[palette] ?? PALETTES.original)[
    isDark ? 'dark' : 'light'
  ];
  return buildTheme(colors, isDark);
}
