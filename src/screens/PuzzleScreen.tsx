import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, ActivityIndicator, AppState } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReAnimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChevronLeft from 'lucide-react-native/dist/cjs/icons/chevron-left';
import Ellipsis from 'lucide-react-native/dist/cjs/icons/ellipsis';
import { CircleButton } from '../components/CircleButton';
import { Header } from '../components/Header';
import { HeaderTimer } from '../components/HeaderTimer';
import { PuzzleCanvas } from '../components/PuzzleCanvas';
import { Toolbar } from '../components/Toolbar';
import { WinBanner } from '../components/WinBanner';
import { usePuzzleStore } from '../store';
import { useEntitlementsStore } from '../stores/entitlementsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';
import { getStreakPack, getPuzzlesForPack } from '../packs';
import {
  getCurrentKey,
  getPuzzleIndex,
  archiveKeyToDate,
} from '../utils/streakDate';
import { parsePuzzle } from '../utils/parsePuzzle';
import { saveProgress } from '../utils/progress';
import type {
  Theme,
  RawPuzzle,
  RootStackParamList,
  DrawLayerHandle,
} from '../types';

type PackData = {
  rawPuzzle: RawPuzzle;
  puzzleId: string;
  gridSize: number;
  packName: string;
  isLastPuzzle: boolean;
};

export function PuzzleScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Puzzle'>) {
  // params is a discriminated union (see RootStackParamList in types.ts).
  // TypeScript narrows each arm via the `in` operator — re-checking on each
  // line is required because a derived boolean variable wouldn't narrow the type.
  const params = route.params;
  const streakType = 'streakType' in params ? params.streakType : undefined;
  const packId = 'packId' in params ? params.packId : undefined;
  const puzzleIndex = 'packId' in params ? params.puzzleIndex : undefined;
  const archiveOptions = 'streakType' in params ? params.archiveOptions : undefined;
  const isArchive = archiveOptions?.isArchive;
  const archiveKey = archiveOptions?.archiveKey;

  const [packData, setPackData] = useState<PackData | null>(null);

  useEffect(() => {
    setPackData(null);
    if (streakType) {
      getStreakPack(streakType)
        .then(pack => {
          if (!pack) { navigation.goBack(); return; }
          const key =
            isArchive && archiveKey ? archiveKey : getCurrentKey(streakType);
          const date =
            isArchive && archiveKey
              ? archiveKeyToDate(streakType, archiveKey)
              : new Date();
          const idx = getPuzzleIndex(streakType, pack.puzzles.length, date);
          setPackData({
            rawPuzzle: pack.puzzles[idx],
            puzzleId: isArchive
              ? `${streakType}:archive:${key}`
              : `${streakType}:${key}`,
            gridSize: pack.gridSize,
            packName: pack.name,
            isLastPuzzle: !isArchive,
          });
        })
        .catch(() => navigation.goBack());
    } else if (packId) {
      const idx = puzzleIndex ?? 0;
      const catalog = useEntitlementsStore.getState().packCatalog;
      const meta = catalog.find(p => p.id === packId);
      getPuzzlesForPack(packId)
        .then(puzzles => {
          const raw = puzzles?.[idx];
          if (!raw) {
            navigation.goBack();
            return;
          }
          setPackData({
            rawPuzzle: raw,
            puzzleId: `${packId}:${idx}`,
            gridSize: meta?.gridSize ?? parseInt(raw.sbn.split('x')[0], 10),
            packName: meta?.name ?? packId,
            isLastPuzzle: idx >= (meta?.puzzleCount ?? puzzles!.length) - 1,
          });
        })
        .catch(() => navigation.goBack());
    }
  }, [streakType, isArchive, archiveKey, packId, puzzleIndex, navigation]);

  const {
    rawPuzzle,
    puzzleId = '',
    gridSize = 0,
    packName = '',
    isLastPuzzle = true,
  } = packData ?? {};

  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const puzzle = usePuzzleStore(s => s.puzzle);
  const cells = usePuzzleStore(s => s.cells);
  const errorCells = usePuzzleStore(s => s.errorCells);
  const hintGhosts = usePuzzleStore(s => s.hintGhosts);
  const alwaysShowToolbar = useSettingsStore(s => s.settings.alwaysShowToolbar);
  const alwaysShowTimer = useSettingsStore(s => s.settings.alwaysShowTimer);
  const openSettings = useSettingsStore(s => s.openSettings);
  const [isReady, setIsReady] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const buttonOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(buttonOpacity, {
      toValue: headerVisible ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [headerVisible, buttonOpacity]);

  useEffect(() => {
    navigation.setOptions({
      statusBarHidden: !headerVisible,
      statusBarAnimation: 'fade',
    });
  }, [headerVisible, navigation]);

  const {
    pinchGesture,
    panGesture,
    animatedStyle,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    isZoomed,
    handleZoomReset,
    lastGestureEndRef,
  } = useZoom(gridSize, theme.cellSize);

  const drawLayerRef = useRef<DrawLayerHandle>(null);

  const boardLayout = useRef({ width: 0, height: 0, centerY: 0 });
  const handleBoardLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const paddingTop = insets.top + 48;    // safe-area + header height
    const paddingBottom = insets.bottom + 80; // safe-area + toolbar height
    // Visual center of the play area, accounting for asymmetric chrome above/below.
    // Derivation: centerY = paddingTop + (height - paddingTop - paddingBottom) / 2
    //                     = (height + paddingTop - paddingBottom) / 2
    // Used by useDrawGesture to map pointer coordinates to grid cells.
    boardLayout.current = {
      width,
      height,
      centerY: (height + paddingTop - paddingBottom) / 2,
    };
  };

  const { drawGesture, tapGesture } = useDrawGesture(
    gridSize,
    theme.cellSize,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    boardLayout,
    drawLayerRef,
    lastGestureEndRef,
    () => setHeaderVisible(v => !v),
  );

  const gesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(drawGesture, Gesture.Exclusive(panGesture, tapGesture)),
  );

  useEffect(() => {
    if (!packData) return;
    if (!rawPuzzle) return;
    try {
      const parsed = parsePuzzle(rawPuzzle, puzzleId);
      loadPuzzle(parsed);
      setIsReady(true);
    } catch {
      navigation.goBack();
    }
  }, [packData, rawPuzzle, puzzleId, loadPuzzle, navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', e => {
      e.preventDefault();
      const state = usePuzzleStore.getState();
      if (state.puzzle) {
        saveProgress(
          state.puzzle.id,
          state.cells,
          state.autoMarks,
          state.timeMs,
          state.completed,
        ).finally(() => navigation.dispatch(e.data.action));
      } else {
        navigation.dispatch(e.data.action);
      }
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'background' || nextState === 'inactive') {
        const state = usePuzzleStore.getState();
        if (state.puzzle) {
          saveProgress(
            state.puzzle.id,
            state.cells,
            state.autoMarks,
            state.timeMs,
            state.completed,
          );
        }
      }
    });
    return () => sub.remove();
  }, []);

  if (!isReady || !puzzle) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.blue} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        left={
          <Animated.View
            style={{ opacity: buttonOpacity }}
            pointerEvents={headerVisible ? 'auto' : 'none'}
          >
            <CircleButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={26} color={theme.text} />
            </CircleButton>
          </Animated.View>
        }
        center={
          <Animated.View
            style={{ opacity: alwaysShowTimer ? 1 : buttonOpacity }}
          >
            <HeaderTimer />
          </Animated.View>
        }
        right={
          <Animated.View
            style={{ opacity: buttonOpacity }}
            pointerEvents={headerVisible ? 'auto' : 'none'}
          >
            <CircleButton onPress={openSettings}>
              <Ellipsis size={20} color={theme.text} />
            </CircleButton>
          </Animated.View>
        }
      />
      <GestureDetector gesture={gesture}>
        <View
          style={[
            styles.boardArea,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 80 },
          ]}
          onLayout={handleBoardLayout}
        >
          <ReAnimated.View style={animatedStyle}>
            <PuzzleCanvas
              ref={drawLayerRef}
              puzzle={puzzle}
              cells={cells}
              errorCells={errorCells}
              hintGhosts={hintGhosts}
              theme={theme}
              canvasSize={theme.cellSize * puzzle.size}
            />
          </ReAnimated.View>
        </View>
      </GestureDetector>
      <Animated.View
        style={{ opacity: alwaysShowToolbar ? 1 : buttonOpacity }}
        pointerEvents={alwaysShowToolbar || headerVisible ? 'auto' : 'none'}
      >
        <Toolbar isZoomed={isZoomed} onZoomReset={handleZoomReset} />
      </Animated.View>
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
    container: { flex: 1, backgroundColor: theme.background },
    loading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    boardArea: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
