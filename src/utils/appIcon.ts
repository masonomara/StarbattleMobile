import { Platform } from 'react-native';
import { changeIcon } from 'react-native-change-icon';
import type { ThemeName } from '../types';

function iosMajorVersion(): number {
  if (Platform.OS !== 'ios') return 0;
  return parseInt(String(Platform.Version).split('.')[0], 10);
}

export async function syncAppIcon(
  palette: ThemeName,
  isDark: boolean,
): Promise<void> {
  if (Platform.OS !== 'ios') return;
  // iOS 26+: use layered .icon — OS handles dark/tinted/clear automatically.
  // iOS <26: use flat PNG appiconset matched to current mode.
  const iconName =
    iosMajorVersion() >= 26
      ? `AppIcon-${palette}`
      : `AppIcon-${palette}-${isDark ? 'dark' : 'light'}`;
  try {
    await changeIcon(iconName);
  } catch {
    // Non-critical — silently ignore (simulator, same icon already set, etc.)
  }
}
