import React, { memo, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Check, ChevronLeft, Lock } from 'lucide-react-native';
import { getPack } from '../packs';
import { useUserStore } from '../stores/userStore';
import { Header } from '../components/Header';
import {
  SPACING_LG,
  FONT_SIZE_LG,
  FONT_WEIGHT_SEMIBOLD,
} from '../utils/constants';
import { useTheme } from '../hooks/useTheme';
import { makePuzzleId } from '../utils/puzzleId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PuzzleCell = memo(function PuzzleCell({
  packId,
  index,
  onPress,
}: {
  packId: string;
  index: number;
  onPress: (index: number) => void;
}) {
  const theme = useTheme();
  const puzzleId = makePuzzleId(packId, index);
  const isCompleted = useUserStore(s => s.completedPuzzles.has(puzzleId));
  const prevCompleted = useUserStore(
    s => index === 0 || s.completedPuzzles.has(makePuzzleId(packId, index - 1)),
  );

  const status: 'completed' | 'active' | 'locked' = isCompleted
    ? 'completed'
    : prevCompleted
    ? 'active'
    : 'locked';

  return (
    <Pressable
      style={[
        styles.puzzleCell,
        {
          backgroundColor: theme.card,
          shadowColor: theme.shadow,
          borderColor: theme.regionBorder,
        },
        status === 'locked' && styles.locked,
      ]}
      onPress={() => onPress(index)}
      disabled={status === 'locked'}
    >
      {status !== 'active' && (
        <View style={styles.puzzleIcon}>
          {status === 'completed' ? (
            <Check size={32} color={theme.accent} />
          ) : (
            <Lock size={32} color={theme.textSecondary} />
          )}
        </View>
      )}
      <Text
        style={[
          styles.puzzleNumber,
          {
            color:
              status === 'completed'
                ? theme.accent
                : status === 'locked'
                ? theme.textSecondary
                : theme.text,
          },
        ]}
      >
        {index + 1}
      </Text>
    </Pressable>
  );
});

export function PackScreen({ route, navigation }: any) {
  const { packId } = route.params;
  const pack = getPack(packId);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const handlePuzzlePress = useCallback(
    (index: number) => {
      navigation.navigate('Puzzle', { packId, puzzleIndex: index });
    },
    [navigation, packId],
  );

  if (!pack) return null;

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
        center={
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {pack.name}
          </Text>
        }
      />
      <FlatList
        data={pack.puzzles}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ index }) => (
          <PuzzleCell
            packId={packId}
            index={index}
            onPress={handlePuzzlePress}
          />
        )}
        numColumns={5}
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: insets.bottom, paddingTop: insets.top },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: FONT_SIZE_LG, fontWeight: FONT_WEIGHT_SEMIBOLD },
  grid: {
    padding: SPACING_LG,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  puzzleCell: {
    aspectRatio: 1,
    height: 54,
    width: 54,
    margin: 8,
    borderWidth: 2.5,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  puzzleIcon: {
    position: 'absolute',
    opacity: 0.3,
  },
  puzzleNumber: { fontSize: 18, fontWeight: 700 },
  locked: { opacity: 0.5 },
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
  headerTitle: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: 600,
  },
});
