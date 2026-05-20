import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Header } from '../components/Header';
import { SettingsButton } from '../components/SettingsButton';
import { BoardView } from '../components/BoardView';
import { HeaderTimer } from '../components/HeaderTimer';
import { Toolbar } from '../components/Toolbar';
import { WinBanner } from '../components/WinBanner';
import { parsePuzzle } from '../utils/parsePuzzle';
import { packs, streakPacks } from '../packs';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import { saveProgress } from '../utils/progress';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';
import { getCurrentKey, getPuzzleIndex } from '../utils/streakDate';
import type { StreakType } from '../types/state';

export function PuzzleScreen({
  route,
  navigation,
}: {
  route: {
    params: {
      packId?: string;
      puzzleIndex?: number;
      streakType?: string;
    };
  };
  navigation: { goBack: () => void };
}) {
  const { packId, puzzleIndex, streakType } = route.params;

  const { rawPuzzle, puzzleId, gridSize, packName, isLastPuzzle } = (() => {
    if (streakType) {
      const pack = streakPacks[streakType as StreakType];
      const key = getCurrentKey(streakType as StreakType);
      const idx = getPuzzleIndex(streakType as StreakType, pack.puzzles.length);
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
  const completed = usePuzzleStore(s => s.completed);
  const hideToolbar = useUserStore(s => s.settings.hideToolbar);

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
      <WinBanner
        packId={packId ?? ''}
        puzzleIndex={puzzleIndex ?? 0}
        packName={packName}
        isLastPuzzle={isLastPuzzle}
        streakType={streakType as StreakType | undefined}
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
