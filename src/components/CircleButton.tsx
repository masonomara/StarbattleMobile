import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { Theme } from '../types/theme';
import type { CircleButtonProps } from '../types/components';

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
      backgroundColor: theme.card,
      shadowOffset: { width: 0, height: 4 },
      shadowColor: theme.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 8,
    },
  });
