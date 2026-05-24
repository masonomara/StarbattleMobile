import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { rgba } from '../themes/ansi';
import type { Theme, CircleButtonProps } from '../types';

export function CircleButton({
  onPress,
  children,
  hitSlop = 8,
}: CircleButtonProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Pressable onPress={onPress} hitSlop={hitSlop} style={styles.button}>
      {children}
    </Pressable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    button: {
      width: 48,
      height: 48,
      borderRadius: 100,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgba(theme.isDark ? theme.darkGray : theme.white, 1),
      shadowOffset: { width: 0, height: 4 },
      shadowColor: '#000000',
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 8,
    },
  });
