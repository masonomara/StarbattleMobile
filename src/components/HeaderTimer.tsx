import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { usePuzzleStore } from '../store';
import { useTheme } from '../hooks/useTheme';
import { formatTime } from '../utils/formatTime';

export function HeaderTimer() {
  const timeMs = usePuzzleStore(s => s.timeMs);
  const completed = usePuzzleStore(s => s.completed);
  const theme = useTheme();

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

  return (
    <Text
      style={[
        styles.timer,
        { fontSize: theme.fontSizeSubhead, color: theme.text },
      ]}
    >
      {formatTime(timeMs)}
    </Text>
  );
}

const styles = StyleSheet.create({
  timer: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
});
