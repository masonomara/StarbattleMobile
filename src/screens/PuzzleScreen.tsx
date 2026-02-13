import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BoardView } from '../components/BoardView';
import { Toolbar } from '../components/Toolbar';
import { getPack } from '../packs';
import { usePuzzleStore } from '../store';
import { useTheme } from '../theme';
import { formatTime } from '../utils/formatTime';
import type { RootStackParams } from '../navigation';

type Props = NativeStackScreenProps<RootStackParams, 'Puzzle'>;

export function PuzzleScreen({ route, navigation }: Props) {
  const { packId, puzzleIndex } = route.params;
  const pack = getPack(packId);
  const gamePuzzle = pack?.puzzles[puzzleIndex];

  const theme = useTheme();
  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const tapCell = usePuzzleStore(s => s.tapCell);
  const undo = usePuzzleStore(s => s.undo);
  const requestHint = usePuzzleStore(s => s.requestHint);
  const tick = usePuzzleStore(s => s.tick);
  const completed = usePuzzleStore(s => s.completed);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const canUndo = usePuzzleStore(s => s.moveLog.length > 0);
  const puzzle = usePuzzleStore(s => s.puzzle);

  useEffect(() => {
    if (!gamePuzzle) return;
    loadPuzzle(gamePuzzle);
  }, [gamePuzzle, loadPuzzle]);

  useEffect(() => {
    if (completed) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [completed, tick]);

  useEffect(() => {
    navigation.setOptions({
      title: pack?.name ?? '',
      headerRight: () => (
        <Text style={[styles.timer, { color: theme.textSecondary }]}>
          {formatTime(timeMs)}
        </Text>
      ),
    });
  }, [navigation, pack, timeMs, theme]);

  if (!puzzle) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <BoardView puzzle={puzzle} onCellPress={tapCell} />

      <Toolbar
        onUndo={undo}
        onHint={requestHint}
        canUndo={canUndo}
        completed={completed}
        theme={theme}
      />

      {completed && (
        <View style={[styles.winBanner, { backgroundColor: theme.accent }]}>
          <Text style={styles.winText}>Solved!</Text>
          <Text style={styles.winTime}>{formatTime(timeMs)}</Text>
          <Text onPress={() => navigation.goBack()} style={styles.nextButton}>
            Continue
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  timer: { fontSize: 16, fontVariant: ['tabular-nums'] },
  winBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    alignItems: 'center',
  },
  winText: { fontSize: 28, fontWeight: '700', color: '#FFF' },
  winTime: { fontSize: 16, color: '#FFF', marginTop: 4 },
  nextButton: {
    fontSize: 16,
    color: '#FFF',
    marginTop: 12,
    textDecorationLine: 'underline',
  },
});
