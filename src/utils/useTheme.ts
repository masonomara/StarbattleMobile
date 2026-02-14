import { useColorScheme } from 'react-native';
import { useUserStore } from '../stores/userStore';

export type Theme = {
  bg: string;
  card: string;
  text: string;
  textSecondary: string;
  regionBorder: string;
  innerBorder: string;
  cellBg: string;
  starColor: string;
  starErrorColor: string;
  markColor: string;
  accent: string;
  accentMuted: string;
  onAccent: string;
  shadow: string;
};

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themePref = useUserStore(s => s.settings.theme);

  if (themePref === 'light') return light;
  if (themePref === 'dark') return dark;
  return systemScheme === 'dark' ? dark : light;
}

const light: Theme = {
  bg: '#eeece7',
  card: '#eeece7',
  text: '#000000',
  textSecondary: '#888888',
  regionBorder: '#000000',
  innerBorder: '#000000',
  cellBg: '#eeece7',
  starColor: '#1A1A1A',
  starErrorColor: '#B7404E',
  markColor: '#B7404E',
  accent: '#4CAF50',
  accentMuted: '#4CAF5020',
  onAccent: '#eeece7',
  shadow: '#000000',
};

const dark: Theme = {
  bg: '#121212',
  card: '#1E1E1E',
  text: '#E0E0E0',
  textSecondary: '#888888',
  regionBorder: '#CCCCCC',
  innerBorder: '#444444',
  cellBg: '#2A2A2A',
  starColor: '#FFD54F',
  starErrorColor: '#F87171',
  markColor: '#757575',
  accent: '#66BB6A',
  accentMuted: '#66BB6A20',
  onAccent: '#FFFFFF',
  shadow: '#000000',
};
