import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import type { TextProps, TextStyle } from 'react-native';

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
