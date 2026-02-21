import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ChevronLeft } from 'lucide-react-native';
import { Header } from '../components/Header';
import { BoardView } from '../components/BoardView';
import { HeaderTimer } from '../components/HeaderTimer';
import { Toolbar } from '../components/Toolbar';
import { WinBanner } from '../components/WinBanner';
import { parsePuzzle } from '../utils/parsePuzzle';
import { getPack } from '../packs';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import { persistProgress as persistProgressUtil } from '../utils/persistProgress';
import { useTheme } from '../hooks/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';
import { makePuzzleId } from '../utils/puzzleId';

export function PuzzleScreen({ route, navigation }: any) {
  const { packId, puzzleIndex } = route.params;
  const pack = getPack(packId);
  const rawPuzzle = pack?.puzzles[puzzleIndex];
  const theme = useTheme();

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const puzzle = usePuzzleStore(s => s.puzzle);
  const completed = usePuzzleStore(s => s.completed);
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

  useEffect(() => {
    if (!rawPuzzle) return;
    try {
      const puzzleId = makePuzzleId(packId, puzzleIndex);
      const parsed = parsePuzzle(rawPuzzle, puzzleId);
      loadPuzzle(parsed);
    } catch {
      navigation.goBack();
    }
  }, [rawPuzzle, packId, puzzleIndex, loadPuzzle, navigation, pack?.name]);

  useEffect(() => {
    if (completed || !puzzle) return;
    const persistTime = () => {
      const state = usePuzzleStore.getState();
      if (!state.completed && state.puzzle) {
        persistProgressUtil(
          state.puzzle,
          state.cells,
          state.autoMarks,
          state.timeMs,
          state.completed,
          false,
        );
      }
    };
    const id = setInterval(persistTime, 5000);
    return () => {
      clearInterval(id);
      persistTime();
    };
  }, [completed, puzzle]);

  if (!puzzle) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Header
        absolute
        left={
          <Pressable
            style={[
              styles.headerButton,
              { backgroundColor: theme.card, shadowColor: theme.shadow },
            ]}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <ChevronLeft size={26} color={theme.text} />
          </Pressable>
        }
        center={<HeaderTimer />}
      />
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
      {!hideToolbar && (
        <Toolbar isZoomed={isZoomed} onZoomReset={handleZoomReset} />
      )}
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
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
    opacity: 0.97,
  },
});
