import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { PALETTES, tokens } from '../themes/palettes';
import type { PaletteColors } from '../themes/palettes';
import type { Theme } from '../types.ts';

export function buildTheme(colors: PaletteColors, isDark: boolean): Theme {
  return {
    isDark,
    ...colors,
    regionColors: [
      colors.darkRed,     colors.darkGreen,    colors.darkYellow,
      colors.darkBlue,    colors.darkMagenta,  colors.darkCyan,
      colors.darkRed,    colors.darkGreen,   colors.darkYellow,
      colors.darkBlue,   colors.darkMagenta, colors.darkCyan,
    ],
    regionColorAlpha: isDark ? 0.25 : 0.12,
    ...tokens,
  };
}

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themePref = useSettingsStore(s => s.settings.theme);
  const palette = useSettingsStore(s => s.settings.palette);

  const isDark =
    themePref === 'dark' ? true :
    themePref === 'light' ? false :
    systemScheme === 'dark';

  const colors = (PALETTES[palette] ?? PALETTES.original)[isDark ? 'dark' : 'light'];
  return buildTheme(colors, isDark);
}
