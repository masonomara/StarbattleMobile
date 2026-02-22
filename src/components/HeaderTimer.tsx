import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import { formatTime } from '../utils/formatTime';
import { useTheme, type Theme } from '../hooks/useTheme';

export function HeaderTimer() {
  const timeMs = usePuzzleStore(s => s.timeMs);
  const completed = usePuzzleStore(s => s.completed);
  const showTimer = useUserStore(s => s.settings.showTimer);
  const theme = useTheme();
  const styles = createStyles(theme);

  useEffect(() => {
    if (completed || !showTimer) return;
    const id = setInterval(() => usePuzzleStore.getState().tick(), 1000);
    return () => clearInterval(id);
  }, [completed, showTimer]);

  if (!showTimer) return null;

  return <Text style={styles.timer}>{formatTime(timeMs)}</Text>;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    timer: {
      fontSize: theme.fontSizeSm,
      fontVariant: ['tabular-nums'],
      fontWeight: 600,
      color: theme.text,
    },
  });
