import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ellipsis } from 'lucide-react-native';
import { BoardView } from '../components/BoardView';
import { SettingsModal } from '../components/SettingsModal';
import { Toolbar } from '../components/Toolbar';
import { WinBanner } from '../components/WinBanner';
import { parsePuzzle } from '../utils/parsePuzzle';
import { getPack } from '../packs';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import type { RootStackParams } from '../navigation';
import { useTheme } from '../utils/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';
import { formatTime } from '../utils/formatTime';
import { FONT_SIZE_SM } from '../utils/constants';

type Props = NativeStackScreenProps<RootStackParams, 'Puzzle'>;

export function PuzzleScreen({ route, navigation }: Props) {
  const { packId, puzzleIndex } = route.params;
  const pack = getPack(packId);
  const rawPuzzle = pack?.puzzles[puzzleIndex];
  const theme = useTheme();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const puzzle = usePuzzleStore(s => s.puzzle);
  const completed = usePuzzleStore(s => s.completed);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const tick = usePuzzleStore(s => s.tick);
  const showTimer = useUserStore(s => s.settings.showTimer);

  const gridSize = pack?.gridSize ?? 5;

  const {
    pinchGesture,
    panGesture,
    scale,
    translateX,
    translateY,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    isZoomed,
    handleZoomReset,
  } = useZoom(gridSize);

  const boardAreaRef = useRef<View>(null);
  const boardLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const handleBoardAreaLayout = useCallback(() => {
    boardAreaRef.current?.measureInWindow((x, y, w, h) => {
      boardLayout.current = { x, y, width: w, height: h };
    });
  }, []);

  const { drawGesture } = useDrawGesture(
    gridSize,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    boardLayout,
  );

  const gesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(drawGesture, panGesture),
  );

  // Drive the timer — tick every second while puzzle is active
  useEffect(() => {
    if (completed || !puzzle) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [completed, puzzle, tick]);

  useEffect(() => {
    if (!rawPuzzle) return;
    const puzzleId = `${packId}:${puzzleIndex}`;
    const parsed = parsePuzzle(rawPuzzle, puzzleId);
    loadPuzzle(parsed);
  }, [rawPuzzle, packId, puzzleIndex, loadPuzzle, navigation, pack?.name]);

  // Persist time periodically and on unmount so it survives backgrounding/navigation
  useEffect(() => {
    if (completed || !puzzle) return;
    const persistTime = () => {
      const state = usePuzzleStore.getState();
      if (!state.completed && state.puzzle) {
        useUserStore.getState().saveProgress({
          puzzleId: state.puzzle.id,
          cells: state.cells,
          autoMarksNeighbors: [...state.autoMarksNeighbors],
          autoMarksRowsCols: [...state.autoMarksRowsCols],
          autoMarksRegions: [...state.autoMarksRegions],
          timeMs: state.timeMs,
          completed: false,
          updatedAt: Date.now(),
        });
      }
    };
    const id = setInterval(persistTime, 5000);
    return () => {
      clearInterval(id);
      persistTime();
    };
  }, [completed, puzzle]);

  const renderHeaderTitle = useCallback(
    () =>
      showTimer && !completed ? (
        <Text style={[styles.headerTimer, { color: theme.text }]}>
          {formatTime(timeMs)}
        </Text>
      ) : null,
    [showTimer, completed, theme.text, timeMs],
  );

  const renderHeaderRight = useCallback(
    () => (
      <Pressable onPress={() => setSettingsVisible(true)} hitSlop={8}>
        <Ellipsis size={20} color={theme.text} />
      </Pressable>
    ),
    [theme.text],
  );

  useEffect(() => {
    navigation.setOptions({
      headerTitle: renderHeaderTitle,
      headerRight: renderHeaderRight,
    });
  }, [navigation, renderHeaderTitle, renderHeaderRight]);

  if (!puzzle) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <GestureDetector gesture={gesture}>
        <View
          ref={boardAreaRef}
          style={styles.boardArea}
          onLayout={handleBoardAreaLayout}
        >
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
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  boardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTimer: {
    fontSize: FONT_SIZE_SM,
    fontVariant: ['tabular-nums'],
  },
});
