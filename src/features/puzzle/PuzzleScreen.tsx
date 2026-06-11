import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  ActivityIndicator,
  AppState,
  Pressable,
} from 'react-native';
import { Text } from '../../shared/ui/Text';
import type { LayoutChangeEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReAnimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChevronLeft from 'lucide-react-native/dist/cjs/icons/chevron-left';
import Ellipsis from 'lucide-react-native/dist/cjs/icons/ellipsis';
import { CircleButton } from '../../shared/ui/CircleButton';
import { Header } from '../../shared/ui/Header';
import { HeaderTimer } from './HeaderTimer';
import { PuzzleCanvas } from './PuzzleCanvas';
import { Toolbar } from './Toolbar';
import { WinBanner } from './WinBanner';
import { usePuzzleStore } from './puzzleStore';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { useAuthStore } from '../../shared/stores/authStore';
import { useTheme } from '../../shared/theme/useTheme';
import { useZoom } from './useZoom';
import { useDrawGesture } from './useDrawGesture';
import { usePackData } from './usePackData';
import { useStreakRows } from '../../shared/hooks/useStreakRows';
import { loadPackHints } from '../../packs/packCache';
import { mark, time } from '../../shared/lib/perfLog';
import { TUTORIAL_PUZZLE } from './tutorial/tutorialPuzzle';
import { tutorialMessage } from './tutorial/tutorialMessage';
import { parsePuzzle } from '../../shared/lib/parsePuzzle';
import { saveProgress } from '../../shared/lib/progress';
import { getActiveStreak } from '../../shared/lib/streakDate';
import type { Theme, RootStackParamList, DrawLayerHandle } from '../../types';

// Chrome heights used both in the board layout calculation and in the view
// padding. Centralizing them ensures handleBoardLayout and the JSX agree.
const HEADER_H = 48;
const TOOLBAR_H = 80;

// The 'Tutorial' route renders this same screen so the tutorial inherits zoom,
// pan, haptics, the toolbar, and the win banner. All tutorial-only behavior is
// gated behind `isTutorial`; the real 'Puzzle' path is unchanged.
export function PuzzleScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Puzzle' | 'Tutorial'>) {
  const isTutorial = route.name === 'Tutorial';
  // route.params is `PuzzleParams | undefined` (undefined for the tutorial route).
  const params = route.params;
  const packId = params ? params.packId : '';
  const puzzleIndex =
    params && 'puzzleIndex' in params ? params.puzzleIndex : undefined;
  const archiveKey =
    params && !('puzzleIndex' in params) ? params.archiveKey : undefined;

  // Resolves route params into a fully loaded PackData object (null while
  // loading). Skipped for the tutorial — it has no pack to resolve.
  const packData = usePackData(
    packId,
    puzzleIndex,
    archiveKey,
    navigation,
    isTutorial,
  );

  const {
    rawPuzzle,
    puzzleId = '',
    packName = '',
    isLastPuzzle = true,
    streakType,
    puzzleIndexInPack = 0,
    effectivePackId,
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
  const completeTutorial = useSettingsStore(s => s.completeTutorial);

  // Per-puzzle board size — must match what the canvas renders
  // (theme.cellSize * puzzle.size). A pack can mix board sizes, so the gesture
  // layer keys off the loaded puzzle, not pack catalog metadata. Falls back to
  // the pack's gridSize only while the puzzle is still loading.
  const boardSize = isTutorial
    ? TUTORIAL_PUZZLE.size
    : puzzle?.size ?? packData?.gridSize ?? 0;

  const userId = useAuthStore(s => s.user?.id);
  const { streaks: streakRows } = useStreakRows(userId);
  const streakRow = streakType
    ? streakRows.find(s => s.type === streakType)
    : undefined;
  const streakCount = streakRow ? getActiveStreak(streakRow, streakType!) : 0;

  const [isReady, setIsReady] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const buttonOpacity = useRef(new Animated.Value(1)).current;

  function finishTutorial() {
    completeTutorial();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }

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
  } = useZoom(boardSize, theme.cellSize);

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
    boardSize,
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

  // One-shot mount marker so the puzzle-open timeline can be located in the log.
  const mountedRef = useRef(false);
  if (!mountedRef.current) {
    mountedRef.current = true;
    mark('PZSCREEN', `mount ${isTutorial ? 'tutorial' : packId}`);
  }

  // Load the puzzle into the store. Tutorial loads its fixed puzzle; the real
  // path parses the resolved pack puzzle once packData is ready.
  useEffect(() => {
    if (isTutorial) {
      loadPuzzle(TUTORIAL_PUZZLE);
      setIsReady(true);
      return;
    }
    if (!packData || !rawPuzzle) return;
    try {
      const endParse = time('PZSCREEN', `parsePuzzle ${puzzleId}`);
      const parsed = parsePuzzle(rawPuzzle, puzzleId);
      endParse();
      loadPuzzle(parsed);
      setIsReady(true);
      mark('PZSCREEN', `isReady=true — board can render for ${puzzleId}`);
    } catch {
      navigation.goBack();
    }
  }, [isTutorial, packData, rawPuzzle, puzzleId, loadPuzzle, navigation]);

  // Hints load from the disk-cached "{packId}-hints.json" (real packs only).
  // setHints([]) on failure clears hintsLoading so the toolbar spinner never hangs.
  useEffect(() => {
    if (isTutorial || !isReady || !effectivePackId) return;
    let cancelled = false;
    // Wall-clock of the full hints load (disk readFile + JSON.parse, both on the
    // JS thread). Correlate this span with [SB:STALL] lines: if a stall lands
    // inside it, the hints read is what froze gameplay on puzzle open.
    const endLoad = time('PZSCREEN', `loadPackHints ${effectivePackId}`);
    loadPackHints(effectivePackId)
      .then(all => {
        endLoad();
        if (!cancelled) setHints(all[puzzleIndexInPack] ?? []);
      })
      .catch(() => {
        endLoad('failed');
        if (!cancelled) setHints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isTutorial, isReady, effectivePackId, puzzleIndexInPack, setHints]);

  // Save progress when the user navigates away. The `finally` ensures the
  // navigation action always dispatches even if the save fails. saveProgress
  // no-ops for the tutorial id, so the tutorial writes nothing.
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
          isTutorial ? undefined : (
            <Animated.View
              style={{ opacity: buttonOpacity }}
              pointerEvents={headerVisible ? 'auto' : 'none'}
            >
              <CircleButton onPress={() => navigation.goBack()}>
                <ChevronLeft size={26} color={theme.text} />
              </CircleButton>
            </Animated.View>
          )
        }
        center={
          isTutorial ? (
            <Text role="subhead" style={styles.tutorialText}>
              {tutorialMessage(cells, puzzle)}
            </Text>
          ) : (
            // Timer always shows when alwaysShowTimer is on; otherwise fades with header.
            <Animated.View
              style={{ opacity: alwaysShowTimer ? 1 : buttonOpacity }}
            >
              <HeaderTimer />
            </Animated.View>
          )
        }
        right={
          isTutorial ? (
            <Pressable
              onPress={finishTutorial}
              hitSlop={12}
              style={styles.skipButton}
            >
              <Text role="subhead" style={styles.skip}>
                Skip
              </Text>
            </Pressable>
          ) : (
            <Animated.View
              style={{ opacity: buttonOpacity }}
              pointerEvents={headerVisible ? 'auto' : 'none'}
            >
              <CircleButton onPress={openSettings}>
                <Ellipsis size={20} color={theme.text} />
              </CircleButton>
            </Animated.View>
          )
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
        <Toolbar
          isZoomed={isZoomed}
          onZoomReset={handleZoomReset}
          hintDisabledMessage={
            isTutorial ? 'Hints not available for the tutorial' : undefined
          }
        />
      </Animated.View>
      <WinBanner
        packId={packId}
        puzzleIndex={puzzleIndexInPack}
        packName={packName}
        isLastPuzzle={isLastPuzzle}
        streakType={streakType}
        streakCount={streakCount}
        tutorial={isTutorial}
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
    tutorialText: {
      color: theme.text,
      textAlign: 'center',
      fontWeight: '600',
    },
    skip: {
      color: theme.text,
    },
    skipButton: {
      backgroundColor: theme.surface,
      width: 48,
      height: 48,
      borderRadius: 100,
      alignItems: 'center',
      justifyContent: 'center',
      display: 'flex',
      shadowOffset: { width: 0, height: 4 },
      shadowColor: '#000000',
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 8,
    },
  });
