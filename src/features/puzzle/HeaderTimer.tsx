import React, { useEffect } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../shared/ui/Text';
import { usePuzzleStore } from './puzzleStore';
import { useTheme } from '../../shared/theme/useTheme';
import { formatElapsedTime } from '../../shared/lib/time';
import type { Theme } from '../../types';

export function HeaderTimer() {
  const { t } = useTranslation();
  const timeMs = usePuzzleStore(s => s.timeMs);
  const completed = usePuzzleStore(s => s.completed);
  const stars = usePuzzleStore(s => s.puzzle?.stars);
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

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

  return (
    <Text role="body" style={styles.timer}>
      {stars != null
        ? t('puzzle.timer', { count: stars, time: formatElapsedTime(timeMs) })
        : formatElapsedTime(timeMs)}
    </Text>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    timer: {
      fontVariant: ['tabular-nums'],
      color: theme.text,
    },
  });
