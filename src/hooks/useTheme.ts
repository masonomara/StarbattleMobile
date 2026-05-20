import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';

export type Theme = {
  isDark: boolean;
  bg: string;
  card: string;
  text: string;
  textSecondary: string;
  regionBorder: string;
  innerBorder: string;
  markColor: string;
  accent: string;
  onAccent: string;
  highlight: string;
  onHighlight: string;
  shadow: string;
  spacingMd: number;
  spacingLg: number;
  spacingXl: number;
  radiusMd: number;
  fontSizeSm: number;
  fontSizeMd: number;
  fontSizeLg: number;
  fontWeightSemibold: '600';
  cellSize: number;
};

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themePref = useSettingsStore(s => s.settings.theme);

  if (themePref === 'light') return light;
  if (themePref === 'dark') return dark;
  return systemScheme === 'dark' ? dark : light;
}

const tokens = {
  spacingMd: 12,
  spacingLg: 16,
  spacingXl: 24,
  radiusMd: 12,
  fontSizeSm: 14,
  fontSizeMd: 16,
  fontSizeLg: 18,
  fontWeightSemibold: '600' as const,
  cellSize: 32,
};

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
  ...tokens,
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
  ...tokens,
};
