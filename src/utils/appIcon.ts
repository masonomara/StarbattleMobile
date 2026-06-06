import { NativeModules, Platform } from 'react-native';
import type { AppIconName, AppIconNativeModule, ThemeName } from '../types';

// Maps the user's selected color palette to an alternate iOS app-icon name.
//
// There are only 6 icon families but the primary `AppIcon` IS the "original"
// theme's artwork, so `original` maps to `null` (= reset to primary) rather than
// declaring a redundant alternate. The remaining five palettes each map 1:1 to an
// `AppIcon-<palette>` alternate declared in Info.plist / shipped as a `.icon` file.
//
// Light/dark appearance is handled automatically at the OS level: each `.icon`
// file bakes in light/dark/tinted `fill-specializations`, so we never switch
// icons for an appearance change — only for a palette change.
const PALETTE_TO_ICON: Record<ThemeName, AppIconName> = {
  original: null,
  gruvbox: 'AppIcon-gruvbox',
  primer: 'AppIcon-primer',
  rosePine: 'AppIcon-rosePine',
  seoul256: 'AppIcon-seoul256',
  tokyoNight: 'AppIcon-tokyoNight',
};

// Our native module represents the primary (non-alternate) icon as the sentinel
// string "Default" in both getIcon() and setIcon().
const PRIMARY_ICON = 'Default';

// Resolved once. Undefined on Android or any build where the module isn't linked.
const nativeModule = NativeModules.AppIconModule as AppIconNativeModule | undefined;

export function iconNameForPalette(palette: ThemeName): AppIconName {
  return PALETTE_TO_ICON[palette] ?? null;
}

// Applies the app icon for the given palette. iOS-only, fire-and-forget, and
// never throws — a failed icon swap must never crash or block theme selection.
//
// Only calls the native setter when the icon actually needs to change. This
// matters because iOS shows a system alert ("You have changed the icon for…")
// every time setAlternateIconName runs. The native side also no-ops redundant
// calls, but we short-circuit here too to avoid the round-trip.
export async function applyThemeAppIcon(palette: ThemeName): Promise<void> {
  if (Platform.OS !== 'ios' || !nativeModule) return;

  try {
    const target = iconNameForPalette(palette);
    // getIcon() resolves to the alternate name, or "Default" for the primary icon.
    const current = await nativeModule.getIcon();
    const currentNormalized = current === PRIMARY_ICON ? null : current;

    if (currentNormalized === target) return;

    // setIcon("Default") resets to the primary icon.
    await nativeModule.setIcon(target ?? PRIMARY_ICON);
  } catch {
    // Swallow: unsupported device, "icon already used" race, or native error.
    // Theme selection must succeed regardless of the icon swap.
  }
}
