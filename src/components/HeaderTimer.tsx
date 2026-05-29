import React, { useEffect } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { Text } from './Text';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useTheme } from '../hooks/useTheme';
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
    let active = true;
    const id = setInterval(() => {
      if (!active) return;
      const now = Date.now();
      usePuzzleStore.getState().tick(now - last);
      last = now;
    }, 1000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        last = Date.now();
        active = true;
      } else {
        active = false;
      }
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
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
      color: theme.text,
     
    },
  });
