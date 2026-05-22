import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
} from 'react-native';
import ReAnimated from 'react-native-reanimated';
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
import { streakPacks, getPuzzlesForPack } from '../packs';
import { usePuzzleStore } from '../store';
import { useEntitlementsStore } from '../stores/entitlementsStore';
import type { RawPuzzle } from '../types/puzzle';
import { useSettingsStore } from '../stores/settingsStore';
import { saveProgress } from '../utils/progress';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';
import {
  getCurrentKey,
  getPuzzleIndex,
  archiveKeyToDate,
} from '../utils/streakDate';
import type { RootStackParamList } from '../types/navigation';
import type { DrawLayerHandle } from '../types/state';

export function PuzzleScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Puzzle'>) {
  const { packId, puzzleIndex, streakType } = route.params;
  const rawParams = route.params as {
    isArchive?: boolean;
    archiveKey?: string;
  };
  const isArchive = rawParams.isArchive;
  const archiveKey = rawParams.archiveKey;

  type PackData = {
    rawPuzzle: RawPuzzle;
    puzzleId: string;
    gridSize: number;
    packName: string;
    isLastPuzzle: boolean;
  };

  // Streak packs are bundled (sync)
  const streakPackData = useMemo<PackData | null>(() => {
    if (!streakType) return null;
    const pack = streakPacks[streakType];
    if (!pack) return null;
    const key =
      isArchive && archiveKey ? archiveKey : getCurrentKey(streakType);
    const date =
      isArchive && archiveKey
        ? archiveKeyToDate(streakType, archiveKey)
        : new Date();
    const idx = getPuzzleIndex(streakType, pack.puzzles.length, date);
    return {
      rawPuzzle: pack.puzzles[idx],
      puzzleId: isArchive
        ? `${streakType}:archive:${key}`
        : `${streakType}:${key}`,
      gridSize: pack.gridSize,
      packName: pack.name,
      isLastPuzzle: !isArchive,
    };
  }, [streakType, isArchive, archiveKey]);

  // Regular packs load from Supabase Storage (downloaded → bundled fallback)
  const [regularPackData, setRegularPackData] = useState<PackData | null>(null);

  useEffect(() => {
    if (streakType || !packId) return;
    setRegularPackData(null);
    const idx = puzzleIndex ?? 0;
    const catalog = useEntitlementsStore.getState().packCatalog;
    const meta = catalog.find(p => p.id === packId);
    getPuzzlesForPack(packId).then(puzzles => {
      const raw = puzzles?.[idx];
      if (!raw) { navigation.goBack(); return; }
      setRegularPackData({
        rawPuzzle: raw,
        puzzleId: `${packId}:${idx}`,
        gridSize: meta?.gridSize ?? parseInt(raw.sbn.split('x')[0], 10),
        packName: meta?.name ?? packId,
        isLastPuzzle: idx >= (meta?.puzzleCount ?? puzzles!.length) - 1,
      });
    }).catch(() => navigation.goBack());
  }, [packId, puzzleIndex, streakType, navigation]);

  const packData = streakPackData ?? regularPackData;

  const rawPuzzle = packData?.rawPuzzle;
  const puzzleId = packData?.puzzleId ?? '';
  const gridSize = packData?.gridSize ?? 0;
  const packName = packData?.packName ?? '';
  const isLastPuzzle = packData?.isLastPuzzle ?? true;

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
    navigation.setOptions({ statusBarHidden: !headerVisible, statusBarAnimation: 'fade' });
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
  } = useZoom(gridSize, theme.cellSize);

  const drawLayerRef = useRef<DrawLayerHandle>(null);

  const boardLayout = useRef({ width: 0, height: 0 });
  const handleBoardLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    boardLayout.current = { width, height };
  };

  const { drawGesture, tapGesture } = useDrawGesture(
    gridSize,
    theme.cellSize,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    boardLayout,
    drawLayerRef,
    () => setHeaderVisible(v => !v),
  );

  const gesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(drawGesture, Gesture.Exclusive(panGesture, tapGesture)),
  );

  useEffect(() => {
    if (!packData) {
      navigation.goBack();
      return;
    }
    if (!rawPuzzle) return;
    try {
      const parsed = parsePuzzle(rawPuzzle, puzzleId);
      loadPuzzle(parsed);
    } catch {
      navigation.goBack();
    }
  }, [packData, rawPuzzle, puzzleId, loadPuzzle, navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
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
    });
    return unsubscribe;
  }, [navigation]);

  if (!puzzle) {
    return (
      <View
        style={[
          {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.bg,
          },
        ]}
      >
        <ActivityIndicator color={theme.accent} />
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
            <Pressable
              style={styles.headerButton}
              onPress={() => navigation.goBack()}
              hitSlop={8}
            >
              <ChevronLeft size={26} color={theme.text} />
            </Pressable>
          </Animated.View>
        }
        center={
          <Animated.View style={{ opacity: alwaysShowTimer ? 1 : buttonOpacity }}>
            <HeaderTimer />
          </Animated.View>
        }
        right={
          <Animated.View
            style={{ opacity: buttonOpacity }}
            pointerEvents={headerVisible ? 'auto' : 'none'}
          >
            <SettingsButton />
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
          <ReAnimated.View
            style={animatedStyle}
          >
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
    container: { flex: 1, backgroundColor: theme.bg },
    boardArea: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerButton: {
      width: 48,
      height: 48,
      borderRadius: 100,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bg,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 8,
      zIndex: 0,
    },
  });
