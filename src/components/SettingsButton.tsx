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
      width: 36,
      height: 36,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 8,
      opacity: 0.97,
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
    },
  });
