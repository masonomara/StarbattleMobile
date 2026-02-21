import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import { formatTime } from '../utils/formatTime';
import { useTheme } from '../hooks/useTheme';
import { FONT_SIZE_SM } from '../utils/constants';
import type { Theme } from '../types/theme';

export function HeaderTimer() {
  const timeMs = usePuzzleStore(s => s.timeMs);
  const showTimer = useUserStore(s => s.settings.showTimer);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!showTimer) return null;

  return <Text style={styles.timer}>{formatTime(timeMs)}</Text>;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    timer: {
      fontSize: FONT_SIZE_SM,
      fontVariant: ['tabular-nums'],
      fontWeight: 600,
      color: theme.text,
    },
  });
