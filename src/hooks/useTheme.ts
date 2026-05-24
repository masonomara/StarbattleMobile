import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { PALETTES } from '../themes/palettes';
import type { Theme } from '../types.ts';

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themePref = useSettingsStore(s => s.settings.theme);
  const palette = useSettingsStore(s => s.settings.palette);

  const isDark =
    themePref === 'dark' ? true :
    themePref === 'light' ? false :
    systemScheme === 'dark';

  const pair = PALETTES[palette] ?? PALETTES.original;
  return isDark ? pair.dark : pair.light;
}
