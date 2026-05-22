import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ellipsis } from 'lucide-react-native';
import { SettingsModal } from './SettingsModal';
import { useTheme, type Theme } from '../hooks/useTheme';

export function SettingsButton() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        hitSlop={8}
        style={styles.button}
      >
        <Ellipsis size={20} color={theme.text} />
      </Pressable>
      <SettingsModal visible={visible} onClose={() => setVisible(false)} />
    </>
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
