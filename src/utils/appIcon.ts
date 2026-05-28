import { Platform, TurboModuleRegistry } from 'react-native';
import type { ThemeName } from '../types';

// react-native-change-icon@5 dist/index.js uses NativeModules which is null in
// the new arch — access the TurboModule directly so it works regardless of arch.
const ChangeIconModule = TurboModuleRegistry.get<{
  getIcon: () => Promise<string>;
  changeIcon: (iconName: string) => Promise<string>;
}>('ChangeIcon');

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
  if (!ChangeIconModule) return;
  const iconName = targetIconName(palette, isDark);
  try {
    const current = await ChangeIconModule.getIcon();
    // getIcon() returns "Default" when the primary icon is active
    if (current === iconName) return;
    await ChangeIconModule.changeIcon(iconName);
    // The library resolves before iOS finishes — verify the change landed
    const after = await ChangeIconModule.getIcon();
    if (after !== iconName) {
      console.warn('[SB:ICON] icon did not change after call — current:', after, 'wanted:', iconName);
    } else {
      console.log('[SB:ICON] icon set:', iconName);
    }
  } catch (e) {
    console.warn('[SB:ICON] syncAppIcon failed:', iconName, e);
  }
}
