import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Check, ChevronLeft, Lock } from 'lucide-react-native';
import { getPack } from '../packs';
import { useUserStore } from '../stores/userStore';
import { Header } from '../components/Header';
import type { Theme } from '../types/theme';
import { useTheme } from '../hooks/useTheme';
import { makePuzzleId } from '../utils/puzzleId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PuzzleCell = memo(function PuzzleCell({
  packId,
  index,
  onPress,
  styles,
  theme,
}: {
  packId: string;
  index: number;
  onPress: (index: number) => void;
  styles: any;
  theme: Theme;
}) {
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
      style={[styles.puzzleCell, status === 'locked' && styles.locked]}
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
        style={
          status === 'completed'
            ? styles.puzzleNumberCompleted
            : status === 'locked'
            ? styles.puzzleNumberLocked
            : styles.puzzleNumberActive
        }
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
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const handlePuzzlePress = useCallback(
    (index: number) => {
      navigation.navigate('Puzzle', { packId, puzzleIndex: index });
    },
    [navigation, packId],
  );

  if (!pack) return null;

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
        center={<Text style={styles.headerTitle}>{pack.name}</Text>}
      />
      <FlatList
        data={pack.puzzles}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ index }) => (
          <PuzzleCell
            packId={packId}
            index={index}
            onPress={handlePuzzlePress}
            styles={styles}
            theme={theme}
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

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    title: { fontSize: theme.fontSizeLg, fontWeight: theme.fontWeightSemibold },
    grid: {
      padding: theme.spacingLg,
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
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
      borderColor: theme.regionBorder,
    },
    puzzleIcon: {
      position: 'absolute',
      opacity: 0.3,
    },
    puzzleNumber: { fontSize: 18, fontWeight: 700 },
    puzzleNumberCompleted: { fontSize: 18, fontWeight: 700, color: theme.accent },
    puzzleNumberActive: { fontSize: 18, fontWeight: 700, color: theme.text },
    puzzleNumberLocked: { fontSize: 18, fontWeight: 700, color: theme.textSecondary },
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
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
    },
    headerTitle: {
      fontSize: 16,
      fontVariant: ['tabular-nums'],
      fontWeight: 600,
      color: theme.text,
    },
  });
