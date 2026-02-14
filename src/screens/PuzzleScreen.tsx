import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GestureDetector } from 'react-native-gesture-handler';
import { BoardView } from '../components/BoardView';
import { Toolbar } from '../components/Toolbar';
import { WinBanner } from '../components/WinBanner';
import { parsePuzzle } from '../utils/parsePuzzle';
import { getPack } from '../packs';
import { usePuzzleStore } from '../store';
import { FONT_SIZE_MD } from '../utils/constants';
import { formatTime } from '../utils/formatTime';
import type { RootStackParams } from '../navigation';
import { useTheme } from '../utils/useTheme';
import { useZoom } from '../hooks/useZoom';

function Timer({ color }: { color: string }) {
  const timeMs = usePuzzleStore(s => s.timeMs);
  const completed = usePuzzleStore(s => s.completed);

  useEffect(() => {
    if (completed) return;
    const interval = setInterval(() => usePuzzleStore.getState().tick(), 1000);
    return () => clearInterval(interval);
  }, [completed]);

  return <Text style={[styles.timer, { color }]}>{formatTime(timeMs)}</Text>;
}

type Props = NativeStackScreenProps<RootStackParams, 'Puzzle'>;

export function PuzzleScreen({ route, navigation }: Props) {
  const { packId, puzzleIndex } = route.params;
  const pack = getPack(packId);
  const rawPuzzle = pack?.puzzles[puzzleIndex];
  const theme = useTheme();

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const puzzle = usePuzzleStore(s => s.puzzle);

  const { gesture, scale, translateX, translateY, isZoomed, handleZoomReset } =
    useZoom();

  useEffect(() => {
    if (!rawPuzzle) return;
    const puzzleId = `${packId}:${puzzleIndex}`;
    const parsed = parsePuzzle(rawPuzzle, puzzleId);
    loadPuzzle(parsed);
  }, [rawPuzzle, packId, puzzleIndex, loadPuzzle, navigation, pack?.name]);

  const renderTimer = useCallback(
    () => <Timer color={theme.textSecondary} />,
    [theme.textSecondary],
  );

  useEffect(() => {
    navigation.setOptions({ headerRight: renderTimer });
  }, [navigation, renderTimer]);

  if (!puzzle) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <GestureDetector gesture={gesture}>
        <View style={styles.boardArea}>
          <BoardView
            puzzle={puzzle}
            scale={scale}
            translateX={translateX}
            translateY={translateY}
          />
        </View>
      </GestureDetector>
      <Toolbar isZoomed={isZoomed} onZoomReset={handleZoomReset} />
      <WinBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  boardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  timer: { fontSize: FONT_SIZE_MD, fontVariant: ['tabular-nums'] },
});
