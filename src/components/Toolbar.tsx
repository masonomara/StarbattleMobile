import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Theme } from '../theme';

type Props = {
  onUndo: () => void;
  onHint: () => void;
  canUndo: boolean;
  completed: boolean;
  theme: Theme;
};

export function Toolbar({ onUndo, onHint, canUndo, completed, theme }: Props) {
  return (
    <View style={styles.toolbar}>
      <Pressable
        onPress={onUndo}
        disabled={!canUndo || completed}
        style={[
          styles.button,
          { backgroundColor: theme.card },
          (!canUndo || completed) && styles.disabled,
        ]}
      >
        <Text style={[styles.buttonText, { color: theme.text }]}>Undo</Text>
      </Pressable>

      <Pressable
        onPress={onHint}
        disabled={completed}
        style={[
          styles.button,
          { backgroundColor: theme.card },
          completed && styles.disabled,
        ]}
      >
        <Text style={[styles.buttonText, { color: theme.text }]}>Hint</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 16,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  disabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
