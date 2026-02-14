import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GestureDetector } from 'react-native-gesture-handler';
import { Settings } from 'lucide-react-native';
import { BoardView } from '../components/BoardView';
import { SettingsModal } from '../components/SettingsModal';
import { Toolbar } from '../components/Toolbar';
import { WinBanner } from '../components/WinBanner';
import { parsePuzzle } from '../utils/parsePuzzle';
import { getPack } from '../packs';
import { usePuzzleStore } from '../store';
import type { RootStackParams } from '../navigation';
import { useTheme } from '../utils/useTheme';
import { useZoom } from '../hooks/useZoom';

type Props = NativeStackScreenProps<RootStackParams, 'Puzzle'>;

export function PuzzleScreen({ route, navigation }: Props) {
  const { packId, puzzleIndex } = route.params;
  const pack = getPack(packId);
  const rawPuzzle = pack?.puzzles[puzzleIndex];
  const theme = useTheme();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const puzzle = usePuzzleStore(s => s.puzzle);

  const { gesture, scale, translateX, translateY, isZoomed, handleZoomReset } =
    useZoom(pack?.gridSize ?? 5);

  useEffect(() => {
    if (!rawPuzzle) return;
    const puzzleId = `${packId}:${puzzleIndex}`;
    const parsed = parsePuzzle(rawPuzzle, puzzleId);
    loadPuzzle(parsed);
  }, [rawPuzzle, packId, puzzleIndex, loadPuzzle, navigation, pack?.name]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => setSettingsVisible(true)} hitSlop={8}>
          <Settings size={20} color={theme.text} />
        </Pressable>
      ),
    });
  }, [navigation, theme.text]);

  if (!puzzle) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <GestureDetector gesture={gesture}>
        <View style={styles.boardArea}>
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
});
