import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';
import type { AppTextProps } from '../types';
import { useTheme } from '../hooks/useTheme';

// The app's Text wrapper. Pass `role` to apply a typographic role token
// (size/leading/weight/tracking) from the theme — this is the preferred path
// and keeps every instance of a role uniform. A `style` may still override any
// field (e.g. color, or fontWeight for emphasis) since it's applied last.
//
// Without `role`, we fall back to the legacy behaviour of deriving letterSpacing
// from the style's fontSize, so un-migrated call sites render exactly as before.
export function Text({ role, style, ...props }: AppTextProps) {
  const theme = useTheme();

  if (role) {
    return <RNText style={[theme.type[role], style]} {...props} />;
  }

  const flatStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = flatStyle?.fontSize ?? 14;
  return (
    <RNText style={[{ letterSpacing: -0.02 * fontSize }, style]} {...props} />
  );
}
