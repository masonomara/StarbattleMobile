import { Platform } from 'react-native';
import { changeIcon, getIcon } from 'react-native-change-icon';
import type { ThemeName } from '../types';

function iosMajorVersion(): number {
  if (Platform.OS !== 'ios') return 0;
  return parseInt(String(Platform.Version).split('.')[0], 10);
}

function targetIconName(palette: ThemeName, isDark: boolean): string {
  return iosMajorVersion() >= 26
    ? `AppIcon-${palette}`
    : `AppIcon-${palette}-${isDark ? 'dark' : 'light'}`;
}

export async function syncAppIcon(
  palette: ThemeName,
  isDark: boolean,
): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const iconName = targetIconName(palette, isDark);
  try {
    const current = await getIcon();
    // getIcon() returns "Default" when the primary icon is active
    if (current === iconName) return;
    await changeIcon(iconName);
    // The library resolves before iOS finishes — verify the change landed
    const after = await getIcon();
    if (after !== iconName) {
      console.warn('[appIcon] icon did not change after call — current:', after, 'wanted:', iconName);
    }
  } catch (e) {
    console.warn('[appIcon] syncAppIcon failed:', iconName, e);
  }
}
