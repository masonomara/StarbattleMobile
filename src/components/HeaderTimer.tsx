import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import { formatTime } from '../utils/formatTime';
import { useTheme } from '../hooks/useTheme';
import { FONT_SIZE_SM } from '../utils/constants';

export function HeaderTimer() {
  const timeMs = usePuzzleStore(s => s.timeMs);
  const showTimer = useUserStore(s => s.settings.showTimer);
  const theme = useTheme();

  if (!showTimer) return null;

  return (
    <Text style={[styles.timer, { color: theme.text }]}>
      {formatTime(timeMs)}
    </Text>
  );
}

const styles = StyleSheet.create({
  timer: {
    fontSize: FONT_SIZE_SM,
    fontVariant: ['tabular-nums'],
    fontWeight: 600,
  },
});
