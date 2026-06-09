import React from 'react';
import { Text as RNText, StyleSheet, Platform } from 'react-native';
import type { TextStyle } from 'react-native';
import type { AppTextProps } from '../../types';
import { useTheme } from '../theme/useTheme';
import { baseFont, displayFont, DISPLAY_ROLES } from '../theme/fonts';
import type { FontFamily } from '../theme/fonts';

// The platform's serif. iOS: Charter — a system serif registered by name (so RN's
// UIFont(name:) lookup resolves it) whose tone is close to Android's Noto Serif.
// Android: the generic 'serif' family (Noto Serif) — Android ships no named serifs
// (no Charter/Palatino/Georgia/Times), so a specific name would fall back to sans.
// The two platforms render different serif typefaces (both serif, not identical).
// (Apple's "New York" / SF Serif is NOT reachable here: it's only exposed via a
// UIFontDescriptor serif design trait, so fontFamily: 'New York' falls back to sans.)
const SERIF_FONT_FAMILY = Platform.select({ ios: 'Charter', android: 'serif' });

// Each family ships one face per weight, so we resolve the role/style fontWeight
// to the matching face and drop fontWeight (a custom family + fontWeight makes a
// platform synthesize a faux weight or mis-pick a face). The role tokens stay the
// source of truth for which weight each role uses; this just maps that weight
// onto the right file. Swap the typefaces in fonts.ts (baseFont / displayFont).
function faceForWeight(family: FontFamily, weight: TextStyle['fontWeight']): string {
  switch (String(weight ?? '400')) {
    case '500':
      return family.medium;
    case '600':
      return family.semibold;
    case '700':
    case 'bold':
      return family.bold;
    default:
      return family.regular; // 400 / normal / anything unmapped
  }
}

// The app's Text wrapper. Pass `role` to apply a typographic role token
// (size/leading/weight) from the theme — this is the preferred path and keeps
// every instance of a role uniform. Pass `serif` to render that text in the
// system serif (orthogonal to role — it only swaps the font family). A `style`
// may still override any field (e.g. color, fontSize) since it's applied last.
//
// Text uses the display font for DISPLAY_ROLES (big titles) and the base font for
// everything else. The serif path keeps the system serif (one family that honours
// fontWeight directly, so its weight is left intact). A caller that sets an
// explicit fontFamily in `style` is respected as-is and keeps its own fontWeight.
//
// Without `role`, we fall back to the legacy behaviour of deriving letterSpacing
// from the style's fontSize, so un-migrated call sites render exactly as before.
//
// Tracking is per-font: the display face (Bricolage Grotesque) is tracked at -2%
// of its size for titles, the base face (Karla) at -4%. letterSpacing is absolute
// points in RN, not a ratio, so we derive it per call from the effective
// fontSize. Applied first in every path so a `style` can still override it.
const DISPLAY_TRACKING_RATIO = -0.02;
const BASE_TRACKING_RATIO = -0.04;

export function Text({ role, serif, style, ...props }: AppTextProps) {
  const theme = useTheme();
  const base = role ? theme.type[role] : null;
  const flat = StyleSheet.flatten([base, style]) as TextStyle | undefined;
  // Display roles get the tight display tracking; everything else (base + serif) is 0.
  const ratio =
    role && DISPLAY_ROLES.has(role) ? DISPLAY_TRACKING_RATIO : BASE_TRACKING_RATIO;
  const tracking = { letterSpacing: ratio * (flat?.fontSize ?? 14) };

  // Serif: one family with real/synthetic weights — swap only the family and
  // leave fontWeight intact so bold serif still renders.
  if (serif) {
    const serifStyle = { fontFamily: SERIF_FONT_FAMILY };
    return (
      <RNText style={[tracking, base, serifStyle, style]} {...props} />
    );
  }

  // Respect an explicit family from the caller; otherwise pick the display or
  // base font by role, map the effective weight onto its face, and clear weight.
  const family = role && DISPLAY_ROLES.has(role) ? displayFont : baseFont;
  const fontStyle = flat?.fontFamily
    ? null
    : {
        fontFamily: faceForWeight(family, flat?.fontWeight),
        fontWeight: undefined as TextStyle['fontWeight'],
      };

  return (
    <RNText style={[tracking, base, style, fontStyle]} {...props} />
  );
}
