import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, ChevronLeft, Lock } from 'lucide-react-native';
import { packs } from '../packs';
import { Header } from '../components/Header';
import { SettingsButton } from '../components/SettingsButton';
import { useTheme, type Theme } from '../hooks/useTheme';
import { getCompletedPuzzleIdsForPack } from '../utils/progress';
import type { RootStackParamList } from '../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function PuzzleCell({
  packId,
  index,
  onPress,
  styles,
  theme,
  completedSet,
}: {
  packId: string;
  index: number;
  onPress: (index: number) => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  completedSet: Set<string>;
}) {
  const puzzleId = `${packId}:${index}`;
  const isCompleted = completedSet.has(puzzleId);
  const prevCompleted =
    index === 0 || completedSet.has(`${packId}:${index - 1}`);

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
        style={[
          styles.puzzleNumber,
          status === 'completed'
            ? styles.puzzleNumberCompleted
            : status === 'locked'
            ? styles.puzzleNumberLocked
            : styles.puzzleNumberActive,
        ]}
      >
        {index + 1}
      </Text>
    </Pressable>
  );
}

export function LibraryScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Library'>) {
  const { packId } = route.params;
  const pack = packs.find(p => p.id === packId);
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();

  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!pack) return;
    getCompletedPuzzleIdsForPack(packId, pack.puzzles.length).then(setCompletedSet);
  }, [packId, pack]);

  if (!pack) return null;

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
        center={<Text style={styles.headerTitle}>{pack.name}</Text>}
        right={<SettingsButton />}
      />
      <FlatList
        data={pack.puzzles}
        renderItem={({ index }) => (
          <PuzzleCell
            packId={packId}
            index={index}
            onPress={i =>
              navigation.navigate('Puzzle', { packId, puzzleIndex: i })
            }
            styles={styles}
            theme={theme}
            completedSet={completedSet}
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
    puzzleNumber: { fontSize: 18, fontWeight: '700' },
    puzzleNumberCompleted: { color: theme.accent },
    puzzleNumberActive: { color: theme.text },
    puzzleNumberLocked: { color: theme.textSecondary },
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
      fontWeight: '600',
      color: theme.text,
    },
  });
