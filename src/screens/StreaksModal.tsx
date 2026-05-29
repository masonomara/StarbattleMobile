import React, { useState, useEffect } from 'react';
import { Modal, View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '../components/Text';
import { PackCard } from '../components/PackCard';
import X from 'lucide-react-native/dist/cjs/icons/x';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header } from '../components/Header';
import { useSettingsStore } from '../stores/settingsStore';
import { useStreaksStore } from '../stores/streaksStore';
import { useTheme } from '../hooks/useTheme';
import { loadStreaks, getPastArchive } from '../utils/progress';
import { getStreakPack } from '../packs';
import { parsePuzzle } from '../utils/parsePuzzle';
import {
  getCurrentKey,
  getActiveStreak,
  getPuzzleIndex,
  archiveKeyToDate,
  STREAK_TYPES,
  STREAK_LABELS,
} from '../utils/streakDate';
import type {
  Theme,
  StreakType,
  Streak,
  Puzzle,
  RootStackParamList,
} from '../types';

const STREAK_TILE_COLORS = ['#8FD6AE', '#81D0E7', '#D3C2FA'];

const ARCHIVE_NAMES: Record<StreakType, string> = {
  daily: 'Past Daily Puzzles',
  weekly: 'Past Weekly Puzzles',
  monthly: 'Past Monthly Puzzles',
};

export function StreaksModal() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const streaksModalVisible = useStreaksStore(s => s.streaksModalVisible);
  const closeStreaks = useStreaksStore(s => s.closeStreaks);

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [archiveCounts, setArchiveCounts] = useState<Record<StreakType, number>>(
    { daily: 0, weekly: 0, monthly: 0 },
  );
  const [thumbnails, setThumbnails] = useState<
    Partial<Record<StreakType, Puzzle>>
  >({});

  useEffect(() => {
    if (!streaksModalVisible) return;

    async function load() {
      const [rawStreaks, dailyArchive, weeklyArchive, monthlyArchive] =
        await Promise.all([
          loadStreaks(),
          getPastArchive('daily', getCurrentKey('daily')),
          getPastArchive('weekly', getCurrentKey('weekly')),
          getPastArchive('monthly', getCurrentKey('monthly')),
        ]);

      setStreaks(rawStreaks);
      setArchiveCounts({
        daily: dailyArchive.length,
        weekly: weeklyArchive.length,
        monthly: monthlyArchive.length,
      });

      // Load a thumbnail for each type using the most-recent archive entry's
      // puzzle. Falls back to the current key if the archive is empty.
      const archiveByType = {
        daily: dailyArchive,
        weekly: weeklyArchive,
        monthly: monthlyArchive,
      };
      const thumbResults: Partial<Record<StreakType, Puzzle>> = {};
      await Promise.all(
        STREAK_TYPES.map(async type => {
          try {
            const pack = await getStreakPack(type);
            if (!pack) return;
            const recentEntry = archiveByType[type][0];
            const date = recentEntry
              ? archiveKeyToDate(type, recentEntry.dateKey)
              : new Date();
            const idx = getPuzzleIndex(type, pack.puzzles.length, date);
            thumbResults[type] = parsePuzzle(
              pack.puzzles[idx],
              `${type}:thumb`,
            );
          } catch {}
        }),
      );
      setThumbnails(thumbResults);
    }

    load();
  }, [streaksModalVisible]);

  return (
    <Modal
      visible={streaksModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeStreaks}
    >
      <View style={styles.container}>
        <Header
          absolute={false}
          center={<Text style={styles.headerTitle}>Streaks</Text>}
          right={
            <Pressable onPress={closeStreaks} hitSlop={8}>
              <X size={24} color={theme.text} />
            </Pressable>
          }
        />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.streakGrid}>
            {STREAK_TYPES.map((type, i) => {
              const found = streaks.find(s => s.type === type);
              const count = found ? getActiveStreak(found, type) : 0;
              return (
                <View
                  key={type}
                  style={[
                    styles.streakTile,
                    { backgroundColor: STREAK_TILE_COLORS[i] },
                  ]}
                >
                  <Text style={styles.streakCount}>{count}</Text>
                  <Text style={styles.streakLabel}>{STREAK_LABELS[type]}</Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Past Puzzles</Text>

          {STREAK_TYPES.map(type => {
            const count = archiveCounts[type];
            const preview = thumbnails[type];
            const isEmpty = count === 0;
            return (
              <PackCard
                key={type}
                name={ARCHIVE_NAMES[type]}
                meta={isEmpty ? 'Coming soon' : `${count} available`}
                preview={preview}
                disabled={isEmpty}
                onPress={() => {
                  closeStreaks();
                  navigation.navigate('ArchivePack', { type });
                }}
                theme={theme}
                coloredRegions={coloredRegions}
              />
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: theme.spacingXl,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingHorizontal: theme.spacingXl,
      paddingBottom: theme.spacingXl,
    },
    headerTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    streakGrid: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      marginBottom: theme.spacingXl,
      marginTop: theme.spacingLg,
    },
    streakTile: {
      flex: 1,
      borderRadius: theme.radiusMd,
      padding: theme.spacingLg,
      alignItems: 'center',
      shadowOffset: { width: 0, height: 4 },
      shadowColor: '#25292E',
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 8,
    },
    streakCount: {
      lineHeight: 36,
      fontSize: 33,
      fontWeight: '900',
      color: theme.blue,
    },
    streakLabel: {
      fontSize: theme.fontSizeSubhead,
      color: theme.textSecondary,
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
      marginBottom: theme.spacingLg,
    },
  });
};
