import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/useTheme';
import type { Theme, CircleButtonProps } from '../../types';

export function CircleButton({
  onPress,
  children,
  hitSlop = 8,
  ghost = false,
}: CircleButtonProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      style={[styles.button, ghost && styles.ghost]}
    >
      {children}
    </Pressable>
  );
}

// NOTE: shadowColor here is '#000000' while Toolbar and WinBanner use '#25292E'.
// Standardise to one value (or add a `shadowColor` token to Theme) so shadows
// are visually consistent across components.
const createStyles = (theme: Theme) =>
  StyleSheet.create({
    button: {
      width: 48,
      height: 48,
      borderRadius: 100,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      shadowOffset: { width: 0, height: 4 },
      shadowColor: '#000000',
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 4,
    },
    ghost: {
      backgroundColor: 'transparent',
      shadowOpacity: 0,
      elevation: 0,
    },
  });
