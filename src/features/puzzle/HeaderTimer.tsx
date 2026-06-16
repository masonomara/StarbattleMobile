import React, { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
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
    <View style={styles.container}>
      <Text role="headline" style={styles.timer}>
        {t('puzzle.timer', { time: formatElapsedTime(timeMs) })}
      </Text>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
    },
    timer: {
      fontVariant: ['tabular-nums'],
      color: theme.text,
      letterSpacing: 0,
    },
  });
