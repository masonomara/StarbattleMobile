import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import type { TextProps, TextStyle } from 'react-native';

// NOTE: StyleSheet.flatten() is called on every render to derive letterSpacing.
// For a leaf component rendered this frequently this adds minor overhead.
// An alternative: accept letterSpacing as a prop with a sensible default and let
// callers override it, avoiding the flatten cost entirely. Or precompute a static
// map of common font sizes to their letterSpacing values.
export function Text({ style, ...props }: TextProps) {
  const flatStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = flatStyle?.fontSize ?? 14;
  return (
    <RNText
      style={[styles.base, { letterSpacing: -0.02 * fontSize }, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: 'Karla',
  },
});
