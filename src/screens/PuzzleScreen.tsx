import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ellipsis } from 'lucide-react-native';
import { BoardView } from '../components/BoardView';
import { HeaderTimer } from '../components/HeaderTimer';
import { SettingsModal } from '../components/SettingsModal';
import { Toolbar } from '../components/Toolbar';
import { WinBanner } from '../components/WinBanner';
import { parsePuzzle } from '../utils/parsePuzzle';
import { getPack } from '../packs';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import { persistProgress as persistProgressUtil } from '../utils/persistProgress';
import type { RootStackParams } from '../types/navigation';
import { useTheme } from '../utils/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';
import { makePuzzleId } from '../utils/puzzleId';

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
  const tick = usePuzzleStore(s => s.tick);
  const hideToolbar = useUserStore(s => s.settings.hideToolbar);

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
  const boardLayout = useRef({ width: 0, height: 0 });
  const handleBoardAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    boardLayout.current = { width, height };
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
    const puzzleId = makePuzzleId(packId, puzzleIndex);
    const parsed = parsePuzzle(rawPuzzle, puzzleId);
    loadPuzzle(parsed);
  }, [rawPuzzle, packId, puzzleIndex, loadPuzzle, navigation, pack?.name]);

  useEffect(() => {
    if (completed || !puzzle) return;
    const persistTime = () => {
      const state = usePuzzleStore.getState();
      if (!state.completed && state.puzzle) {
        persistProgressUtil(
          state.puzzle, state.cells, state.autoMarks, state.timeMs, state.completed, false,
        );
      }
    };
    const id = setInterval(persistTime, 5000);
    return () => {
      clearInterval(id);
      persistTime();
    };
  }, [completed, puzzle]);

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
      headerTitle: () => <HeaderTimer />,
      headerRight: renderHeaderRight,
    });
  }, [navigation, renderHeaderRight]);

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
      {!hideToolbar && <Toolbar isZoomed={isZoomed} onZoomReset={handleZoomReset} />}
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
});
