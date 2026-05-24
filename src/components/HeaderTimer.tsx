import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from './Text';
import { usePuzzleStore } from '../store';
import { useTheme } from '../hooks/useTheme';
import { rgba } from '../themes/ansi';
import type { Theme } from '../types';

export function HeaderTimer() {
  const timeMs = usePuzzleStore(s => s.timeMs);
  const completed = usePuzzleStore(s => s.completed);
  const theme = useTheme();
  const styles = createStyles(theme);

  useEffect(() => {
    if (completed) return;
    // `let last` corrects for interval drift by measuring real elapsed time each tick.
    // Imperative getState() avoids a stale closure over the tick function reference.
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      usePuzzleStore.getState().tick(now - last);
      last = now;
    }, 1000);
    return () => clearInterval(id);
  }, [completed]);

  const min = Math.floor(timeMs / 60000);
  const sec = Math.floor((timeMs % 60000) / 1000);
  return (
    <Text style={styles.timer}>{`${min}:${String(sec).padStart(2, '0')}`}</Text>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    timer: {
      fontVariant: ['tabular-nums'],
      fontWeight: '600',
      fontSize: 17,
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
     
    },
  });
