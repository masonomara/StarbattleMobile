import React from 'react';
import { Text as RNText, StyleSheet, Platform } from 'react-native';
import type { TextStyle } from 'react-native';
import type { AppTextProps } from '../types';
import { useTheme } from '../hooks/useTheme';

// The platform's serif. iOS: Charter — a system serif registered by name (so RN's
// UIFont(name:) lookup resolves it) whose tone is close to Android's Noto Serif.
// Android: the generic 'serif' family (Noto Serif) — Android ships no named serifs
// (no Charter/Palatino/Georgia/Times), so a specific name would fall back to sans.
// The two platforms render different serif typefaces (both serif, not identical).
// (Apple's "New York" / SF Serif is NOT reachable here: it's only exposed via a
// UIFontDescriptor serif design trait, so fontFamily: 'New York' falls back to sans.)
const SERIF_FONT_FAMILY = Platform.select({ ios: 'Charter', android: 'serif' });

// The app's Text wrapper. Pass `role` to apply a typographic role token
// (size/leading/weight) from the theme — this is the preferred path and keeps
// every instance of a role uniform. Pass `serif` to render that text in the
// system serif (orthogonal to role — it only swaps the font family). A `style`
// may still override any field (e.g. color, fontWeight) since it's applied last.
//
// Without `role`, we fall back to the legacy behaviour of deriving letterSpacing
// from the style's fontSize, so un-migrated call sites render exactly as before.
export function Text({ role, serif, style, ...props }: AppTextProps) {
  const theme = useTheme();
  const serifStyle = serif ? { fontFamily: SERIF_FONT_FAMILY } : null;

  if (role) {
    return (
      <RNText style={[theme.type[role], serifStyle, style]} {...props} />
    );
  }

  const flatStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = flatStyle?.fontSize ?? 14;
  return (
    <RNText
      style={[{ letterSpacing: -0.02 * fontSize }, serifStyle, style]}
      {...props}
    />
  );
}
