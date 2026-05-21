import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Header } from '../components/Header';
import { SettingsButton } from '../components/SettingsButton';
import { PuzzleCanvas } from '../components/PuzzleCanvas';
import { HeaderTimer } from '../components/HeaderTimer';
import { Toolbar } from '../components/Toolbar';
import { WinBanner } from '../components/WinBanner';
import { parsePuzzle } from '../utils/parsePuzzle';
import { packs, streakPacks } from '../packs';
import { usePuzzleStore } from '../store';
import { useSettingsStore } from '../stores/settingsStore';
import { saveProgress } from '../utils/progress';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';
import { getCurrentKey, getPuzzleIndex } from '../utils/streakDate';
import type { RootStackParamList } from '../types/navigation';

export function PuzzleScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Puzzle'>) {
  const { packId, puzzleIndex, streakType } = route.params;

  const { rawPuzzle, puzzleId, gridSize, packName, isLastPuzzle } = (() => {
    if (streakType) {
      const pack = streakPacks[streakType];
      const key = getCurrentKey(streakType);
      const idx = getPuzzleIndex(streakType, pack.puzzles.length);
      return {
        rawPuzzle: pack.puzzles[idx],
        puzzleId: `${streakType}:${key}`,
        gridSize: pack.gridSize,
        packName: pack.name,
        isLastPuzzle: true,
      };
    }
    const pack = packs.find(p => p.id === packId)!;
    const idx = puzzleIndex ?? 0;
    return {
      rawPuzzle: pack.puzzles[idx],
      puzzleId: `${packId}:${idx}`,
      gridSize: pack.gridSize,
      packName: pack.name,
      isLastPuzzle: idx >= pack.puzzles.length - 1,
    };
  })();

  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const puzzle = usePuzzleStore(s => s.puzzle);
  const cells = usePuzzleStore(s => s.cells);
  const autoMarks = usePuzzleStore(s => s.autoMarks);
  const errorCells = usePuzzleStore(s => s.errorCells);
  const hintGhosts = usePuzzleStore(s => s.hintGhosts);
  const completed = usePuzzleStore(s => s.completed);
  const hideToolbar = useSettingsStore(s => s.settings.hideToolbar);

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

  const canvasLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const handleCanvasLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    canvasLayout.current = { x, y, width, height };
  };

  const { drawGesture, tapGesture } = useDrawGesture(
    gridSize,
    theme.cellSize,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    canvasLayout,
  );

  const gesture = Gesture.Simultaneous(
    Gesture.Simultaneous(pinchGesture, panGesture),
    Gesture.Race(drawGesture, tapGesture),
  );

  useEffect(() => {
    if (!rawPuzzle) return;
    try {
      const parsed = parsePuzzle(rawPuzzle, puzzleId);
      loadPuzzle(parsed);
    } catch {
      navigation.goBack();
    }
  }, [rawPuzzle, puzzleId, loadPuzzle, navigation]);

  useEffect(() => {
    if (completed || !puzzle) return;
    const persistTime = () => {
      const state = usePuzzleStore.getState();
      if (!state.completed && state.puzzle) {
        saveProgress(state.puzzle.id, state.cells, state.autoMarks, state.timeMs, false);
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
        right={<SettingsButton />}
      />
      <GestureDetector gesture={gesture}>
        <View
          style={[
            styles.boardArea,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 80 },
          ]}
        >
          <Animated.View
            style={{
              transform: [{ scale }, { translateX }, { translateY }],
            }}
            onLayout={handleCanvasLayout}
          >
            <PuzzleCanvas
              puzzle={puzzle}
              cells={cells}
              autoMarks={autoMarks}
              errorCells={errorCells}
              hintGhosts={hintGhosts}
              theme={theme}
              canvasSize={theme.cellSize * puzzle.size}
            />
          </Animated.View>
        </View>
      </GestureDetector>
      {!hideToolbar && (
        <Toolbar isZoomed={isZoomed} onZoomReset={handleZoomReset} />
      )}
      <WinBanner
        packId={packId ?? ''}
        puzzleIndex={puzzleIndex ?? 0}
        packName={packName}
        isLastPuzzle={isLastPuzzle}
        streakType={streakType}
      />
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
