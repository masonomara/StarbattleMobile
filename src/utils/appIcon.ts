import { Platform } from 'react-native';
import { changeIcon } from 'react-native-change-icon';
import type { ThemeName } from '../types';

export async function syncAppIcon(
  palette: ThemeName,
  isDark: boolean,
): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const iconName = `AppIcon-${palette}-${isDark ? 'dark' : 'light'}`;
  try {
    await changeIcon(iconName);
  } catch {
    // Icon change is non-critical — silently ignore (e.g. simulator, same icon)
  }
}
