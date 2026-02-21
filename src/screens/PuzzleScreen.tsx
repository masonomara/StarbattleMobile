import React, { useEffect, useRef } from 'react';
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
import { packs } from '../packs';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import { persistProgress as persistProgressUtil } from '../utils/persistProgress';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';

export function PuzzleScreen({ route, navigation }: any) {
  const { packId, puzzleIndex } = route.params;
  const pack = packs.find(p => p.id === packId);
  const rawPuzzle = pack?.puzzles[puzzleIndex];
  const theme = useTheme();
  const styles = createStyles(theme);

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
  } = useZoom(gridSize, theme.cellSize);

  const boardAreaRef = useRef<View>(null);
  const boardLayout = useRef({ width: 0, height: 0 });
  const handleBoardAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    boardLayout.current = { width, height };
  };

  const { drawGesture } = useDrawGesture(
    gridSize,
    theme.cellSize,
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
      const puzzleId = `${packId}:${puzzleIndex}`;
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
    <View style={styles.container}>
      <Header
        absolute
        left={
          <Pressable
            style={styles.headerButton}
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
            theme={theme}
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

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
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
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
    },
  });
