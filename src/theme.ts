import { useColorScheme } from 'react-native';
import { usePuzzleStore } from './store';

export type Theme = {
  bg: string;
  card: string;
  text: string;
  textSecondary: string;
  regionBorder: string;
  innerBorder: string;
  cellBg: string;
  starColor: string;
  markColor: string;
  accent: string;
  error: string;
};

const light: Theme = {
  bg: '#FAFAFA',
  card: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#888888',
  regionBorder: '#000000',
  innerBorder: '#CCCCCC',
  cellBg: '#FFFFFF',
  starColor: '#F9A825',
  markColor: '#9E9E9E',
  accent: '#4CAF50',
  error: '#FFCDD2',
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
  markColor: '#757575',
  accent: '#66BB6A',
  error: '#4E342E',
};

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themeSetting = usePuzzleStore(s => s.settings.theme);

  if (themeSetting === 'light') return light;
  if (themeSetting === 'dark') return dark;
  return systemScheme === 'dark' ? dark : light;
}
