import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  ActivityIndicator,
  AppState,
} from 'react-native';
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
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';
import { usePackData } from '../hooks/usePackData';
import { loadPackHints } from '../packs';
import { parsePuzzle } from '../utils/parsePuzzle';
import { saveProgress } from '../utils/progress';
import type { Theme, RootStackParamList, DrawLayerHandle } from '../types';

// Chrome heights used both in the board layout calculation and in the view
// padding. Centralizing them ensures handleBoardLayout and the JSX agree.
const HEADER_H = 48;
const TOOLBAR_H = 80;

export function PuzzleScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Puzzle'>) {
  // params is a discriminated union (see RootStackParamList in types.ts).
  // Narrowed with `'puzzleIndex' in params`: first variant = library pack,
  // second variant = streak pack (current day or archive).
  const params = route.params;
  const packId = params.packId;
  const puzzleIndex = 'puzzleIndex' in params ? params.puzzleIndex : undefined;
  const archiveKey = 'puzzleIndex' in params ? undefined : params.archiveKey;

  // Resolves route params into a fully loaded PackData object (null while loading).
  const packData = usePackData(packId, puzzleIndex, archiveKey, navigation);

  const {
    rawPuzzle,
    puzzleId = '',
    gridSize = 0,
    packName = '',
    isLastPuzzle = true,
    streakType,
    puzzleIndexInPack = 0,
  } = packData ?? {};

  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const setHints = usePuzzleStore(s => s.setHints);
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

  // Fade header buttons and status bar in/out when the user hides the chrome.
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

  // Stores the board's pixel dimensions and visual center. Populated once by
  // onLayout; stable across re-renders since it's a ref.
  const boardLayout = useRef({ width: 0, height: 0, centerY: 0 });

  const handleBoardLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const paddingTop = insets.top + HEADER_H;
    const paddingBottom = insets.bottom + TOOLBAR_H;
    // Visual center of the play area, accounting for asymmetric chrome.
    // Derivation: paddingTop + (height - paddingTop - paddingBottom) / 2
    //           = (height + paddingTop - paddingBottom) / 2
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

  // Gesture composition:
  //   Simultaneous — pinch-to-zoom runs alongside any other gesture.
  //   Race         — draw and (pan/tap) are mutually exclusive; first to move wins.
  //   Exclusive    — pan takes priority over tap; tap only fires if no pan occurs.
  const gesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(drawGesture, Gesture.Exclusive(panGesture, tapGesture)),
  );

  // Parse the raw puzzle SBN and load it into the store. `isReady` gates
  // rendering so nothing shows until the store has a valid puzzle object.
  useEffect(() => {
    if (!packData || !rawPuzzle) return;
    try {
      const parsed = parsePuzzle(rawPuzzle, puzzleId);
      loadPuzzle(parsed);
      setIsReady(true);
    } catch {
      navigation.goBack();
    }
  }, [packData, rawPuzzle, puzzleId, loadPuzzle, navigation]);

  // Load hints after the puzzle is ready. Runs independently of pack loading
  // so a slow hint fetch doesn't block puzzle rendering.
  useEffect(() => {
    if (!isReady || !packData) return;
    const { effectivePackId, puzzleIndexInPack: idx } = packData;
    loadPackHints(effectivePackId)
      .then(allHints => setHints(allHints[idx] ?? []))
      .catch(() => setHints([]));
  }, [isReady, packData, setHints]);

  // Save progress when the user navigates away. The `finally` ensures the
  // navigation action always dispatches even if the save fails.
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

  // Fire-and-forget save when the app moves to background or becomes inactive.
  // No `finally` here — we can't guarantee navigation state at this point.
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
          // Timer always shows when alwaysShowTimer is on; otherwise fades with header.
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
            {
              paddingTop: insets.top + HEADER_H,
              paddingBottom: insets.bottom + TOOLBAR_H,
            },
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
      {/* Toolbar fades with the header unless alwaysShowToolbar is on. */}
      <Animated.View
        style={{ opacity: alwaysShowToolbar ? 1 : buttonOpacity }}
        pointerEvents={alwaysShowToolbar || headerVisible ? 'auto' : 'none'}
      >
        <Toolbar isZoomed={isZoomed} onZoomReset={handleZoomReset} />
      </Animated.View>
      <WinBanner
        packId={packId}
        puzzleIndex={puzzleIndexInPack}
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
