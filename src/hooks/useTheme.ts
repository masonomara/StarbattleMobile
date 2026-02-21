import { useColorScheme } from 'react-native';
import { useUserStore } from '../stores/userStore';
import type { Theme } from '../types/theme';

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themePref = useUserStore(s => s.settings.theme);

  if (themePref === 'light') return light;
  if (themePref === 'dark') return dark;
  return systemScheme === 'dark' ? dark : light;
}

const light: Theme = {
  isDark: false,
  bg: '#FFFFFF',
  card: '#FFFFFF',
  text: '#060607',
  textSecondary: '#4E5058',
  regionBorder: '#060607',
  innerBorder: '#828282',
  markColor: '#B52C21',
  accent: '#5865F2',
  onAccent: '#FFFFFF',
  highlight: '#EBEBEB',
  onHighlight: '#4E5058',
  shadow: '#EBEDEF',
};

const dark: Theme = {
  isDark: true,
  bg: '#1C1D23',
  card: '#212229',
  text: '#EBEDEF',
  textSecondary: '#C7C8CE',
  regionBorder: '#EBEDEF',
  innerBorder: '#838488',
  markColor: '#F57970',
  accent: '#5865F2',
  onAccent: '#FFFFFF',
  highlight: '#2E3038',
  onHighlight: '#C7C8CE',
  shadow: '#131318',
};
