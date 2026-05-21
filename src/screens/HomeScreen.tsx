import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { packs, streakPacks } from '../packs';
import { Header } from '../components/Header';
import { SettingsButton } from '../components/SettingsButton';
import { useTheme, type Theme } from '../hooks/useTheme';
import { getCurrentKey, getActiveStreak } from '../utils/streakDate';
import { loadStreaks, getCompletedCountForPack, loadProgress } from '../utils/progress';
import type { StreakType, Streak } from '../types/state';
import type { RootStackParamList } from '../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STREAK_TYPES: StreakType[] = ['daily', 'weekly', 'monthly'];

const STREAK_LABELS: Record<StreakType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export function HomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);

  const [completedPerPack, setCompletedPerPack] = useState<Record<string, number>>({});
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [completedPuzzleIds, setCompletedPuzzleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const rawStreaks = await loadStreaks();
      setStreaks(
        rawStreaks.map(r => ({
          type: r.type as StreakType,
          current: r.currentCount,
          lastCompletedKey: r.lastCompletedKey,
        })),
      );

      const counts: Record<string, number> = {};
      for (const pack of packs) {
        counts[pack.id] = await getCompletedCountForPack(pack.id, pack.puzzles.length);
      }
      setCompletedPerPack(counts);

      const completed = new Set<string>();
      for (const type of STREAK_TYPES) {
        const key = getCurrentKey(type);
        const puzzleId = `${type}:${key}`;
        const prog = await loadProgress(puzzleId);
        if (prog?.completed) completed.add(puzzleId);
      }
      setCompletedPuzzleIds(completed);
    }
    load();
  }, []);

  return (
    <View style={styles.container}>
      <Header right={<SettingsButton />} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.streakRow}>
          {STREAK_TYPES.map(type => {
            const pack = streakPacks[type];
            const key = getCurrentKey(type);
            const puzzleId = `${type}:${key}`;
            const isCompleted = completedPuzzleIds.has(puzzleId);
            const found = streaks.find(s => s.type === type);
            const streakCount = found ? getActiveStreak(found, type) : 0;

            return (
              <Pressable
                key={type}
                style={[
                  styles.streakCard,
                  isCompleted && styles.streakCardCompleted,
                ]}
                onPress={() =>
                  navigation.navigate('Puzzle', { streakType: type })
                }
              >
                <Text style={styles.streakLabel}>
                  {STREAK_LABELS[type]} Challenge
                </Text>
                <Text style={styles.streakMeta}>
                  {pack.gridSize}x{pack.gridSize}
                </Text>
                {isCompleted && (
                  <Text style={styles.streakCount}>Streak: {streakCount}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {packs.map(pack => (
          <Pressable
            key={pack.id}
            style={styles.packCard}
            onPress={() => navigation.navigate('Library', { packId: pack.id })}
          >
            <View style={styles.packInfo}>
              <Text style={styles.packName}>{pack.name}</Text>
              <Text style={styles.packMeta}>
                {pack.gridSize}x{pack.gridSize}
              </Text>
            </View>
            <Text style={styles.packProgress}>
              {completedPerPack[pack.id] ?? 0}/{pack.puzzles.length}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scrollContent: {
      paddingHorizontal: theme.spacingXl,
      marginTop: insets.top + 60,
      marginBottom: insets.bottom,
    },
    title: {
      fontSize: theme.fontSizeLg,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    streakRow: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      marginBottom: theme.spacingXl,
    },
    streakCard: {
      flex: 1,
      padding: theme.spacingLg,
      borderRadius: 4,
      backgroundColor: theme.card,
      alignItems: 'center',
      aspectRatio: 3 / 4,
    },
    streakCardCompleted: {
      opacity: 0.6,
    },
    streakLabel: {
      fontSize: 14,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    streakMeta: {
      fontSize: theme.fontSizeSm,
      color: theme.textSecondary,
      marginTop: 4,
    },
    streakCount: {
      fontSize: theme.fontSizeSm,
      fontWeight: theme.fontWeightSemibold,
      color: theme.accent,
      marginTop: 4,
    },
    packCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: theme.spacingXl,
      borderRadius: theme.radiusMd,
      marginBottom: theme.spacingMd,
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
    },
    packInfo: { flex: 1 },
    packName: {
      fontSize: theme.fontSizeLg,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    packMeta: {
      fontSize: theme.fontSizeSm,
      marginTop: 4,
      color: theme.textSecondary,
    },
    packProgress: {
      fontSize: theme.fontSizeMd,
      fontWeight: theme.fontWeightSemibold,
      color: theme.accent,
    },
  });
