import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';
import type { AppTextProps } from '../../types';
import { useTheme } from '../theme/useTheme';
import { baseFont, displayFont, DISPLAY_ROLES } from '../theme/fonts';
import type { FontFamily } from '../theme/fonts';

// One face per weight: map fontWeight to its face and drop fontWeight, else the
// platform synthesizes a faux weight. Typefaces live in fonts.ts.
function faceForWeight(
  family: FontFamily,
  weight: TextStyle['fontWeight'],
): string {
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

// The app's Text wrapper. `role` applies a theme typography token
// (size/leading/weight); `style` is applied last so it can override anything.
// Display roles use the display font, the rest the base font; an explicit
// fontFamily in `style` is left alone. RN letterSpacing is absolute points, so
// tracking is derived per-call from the effective fontSize (display -2%, base -4%).
const DISPLAY_TRACKING_RATIO = -0.02;
const BASE_TRACKING_RATIO = -0.04;

export function Text({ role, style, ...props }: AppTextProps) {
  const theme = useTheme();
  const base = role ? theme.type[role] : null;
  const flat = StyleSheet.flatten([base, style]) as TextStyle | undefined;
  const ratio =
    role && DISPLAY_ROLES.has(role)
      ? DISPLAY_TRACKING_RATIO
      : BASE_TRACKING_RATIO;
  const tracking = { letterSpacing: ratio * (flat?.fontSize ?? 14) };

  // Explicit family wins; otherwise pick by role and resolve weight to its face.
  const family = role && DISPLAY_ROLES.has(role) ? displayFont : baseFont;
  const fontStyle = flat?.fontFamily
    ? null
    : {
        fontFamily: faceForWeight(family, flat?.fontWeight),
        fontWeight: undefined as TextStyle['fontWeight'],
      };

  return <RNText style={[tracking, base, style, fontStyle]} {...props} />;
}
