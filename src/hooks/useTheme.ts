import { useColorScheme } from 'react-native';
import { Colors } from '../constants/theme';
import type { ThemeColors } from '../types';

export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    colors: isDark ? Colors.dark : Colors.light,
    isDark,
  };
}
