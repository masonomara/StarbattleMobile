import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ellipsis } from 'lucide-react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import type { Theme } from '../types/theme';

// The modal itself lives at the navigation root — this button just signals the store to open it.
export function SettingsButton() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const openSettings = useSettingsStore(s => s.openSettings);

  return (
    <Pressable onPress={openSettings} hitSlop={8} style={styles.button}>
      <Ellipsis size={20} color={theme.text} />
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
      backgroundColor: theme.bg,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 8,
      zIndex: 0,
    },
  });
