import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Flame, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStreakPack } from '../packs';
import { CircleButton } from '../components/CircleButton';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import {
  getCurrentKey,
  getActiveStreak,
  getPuzzleIndex,
  STREAK_TYPES,
  STREAK_LABELS,
} from '../utils/streakDate';
import {
  loadStreaks,
  getCompletedCountForPack,
  loadProgress,
} from '../utils/progress';
import { parsePuzzle } from '../utils/parsePuzzle';
import { PuzzleThumbnail } from '../components/PuzzleThumbnail';
import type { Theme } from '../types/theme';
import type { StreakType, Streak } from '../types/state';
import type { Pack, Puzzle } from '../types/puzzle';
import type { RootStackParamList } from '../types/navigation';

export function HomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);
  const isFocused = useIsFocused();
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const { packCatalog, hasPackAccess } = useEntitlements();

  const [loadedStreakPacks, setLoadedStreakPacks] = useState<
    Partial<Record<StreakType, Pack>>
  >({});
  const [streakPreviews, setStreakPreviews] = useState<
    Partial<Record<StreakType, Puzzle>>
  >({});

  useEffect(() => {
    async function loadPreviews() {
      const packsResult: Partial<Record<StreakType, Pack>> = {};
      const previewsResult: Partial<Record<StreakType, Puzzle>> = {};
      await Promise.all(
        STREAK_TYPES.map(async type => {
          const pack = await getStreakPack(type);
          if (!pack) return;
          packsResult[type] = pack;
          const idx = getPuzzleIndex(type, pack.puzzles.length);
          const key = getCurrentKey(type);
          previewsResult[type] = parsePuzzle(
            pack.puzzles[idx],
            `${type}:${key}`,
          );
        }),
      );
      setLoadedStreakPacks(packsResult);
      setStreakPreviews(previewsResult);
    }
    loadPreviews();
  }, []);

  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [completedPuzzleIds, setCompletedPuzzleIds] = useState<Set<string>>(
    new Set(),
  );
  const [completedPerPack, setCompletedPerPack] = useState<
    Record<string, number>
  >({});

  const freePacks = packCatalog.filter(p => p.isFree);
  const paidPacks = packCatalog.filter(p => !p.isFree);

  const load = useCallback(async () => {
    setStreaks(await loadStreaks());

    const completedEntries = await Promise.all(
      STREAK_TYPES.map(async type => {
        const puzzleId = `${type}:${getCurrentKey(type)}`;
        const prog = await loadProgress(puzzleId);
        return prog?.completed ? puzzleId : null;
      }),
    );
    setCompletedPuzzleIds(
      new Set(completedEntries.filter((id): id is string => id !== null)),
    );

    const counts: Record<string, number> = {};
    await Promise.all(
      packCatalog.map(async pack => {
        counts[pack.id] = await getCompletedCountForPack(
          pack.id,
          pack.puzzleCount,
        );
      }),
    );
    setCompletedPerPack(counts);
  }, [packCatalog]);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.appTitle}>Star Battle</Text>
        <View style={styles.headerRight}>
          <CircleButton onPress={() => navigation.navigate('Streaks')}>
            <Flame size={24} color={theme.text} />
          </CircleButton>
          <CircleButton
            onPress={() => useSettingsStore.getState().openSettings()}
          >
            <User size={24} color={theme.text} />
          </CircleButton>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: 57 + insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <View style={styles.streakSection}>
          <ScrollView
            style={styles.streakRow}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingRight: theme.spacingXl,
              paddingLeft: theme.spacingXl,
              gap: 20,
            }}
          >
            {STREAK_TYPES.map(type => {
              const pack = loadedStreakPacks[type];
              const preview = streakPreviews[type];
              if (!pack || !preview) return null;
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
                  <View style={styles.streakThumbnailWrap}>
                    <PuzzleThumbnail
                      puzzle={preview}
                      size={220}
                      theme={theme}
                      coloredRegions={coloredRegions}
                    />
                  </View>
                  <View style={styles.streakCardHeader}>
                    <Text style={styles.streakLabel}>
                      {STREAK_LABELS[type]} Special
                    </Text>
                    <Text style={styles.streakMeta}>
                      {pack.gridSize}×{pack.gridSize}
                    </Text>
                  </View>
                  {streakCount > 0 && (
                    <Text style={styles.streakCount}>{streakCount}</Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.packSection}>
          {freePacks.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Packs</Text>
              {freePacks.map(pack => {
                const completed = completedPerPack[pack.id] ?? 0;
                return (
                  <Pressable
                    key={pack.id}
                    style={styles.packCard}
                    onPress={() =>
                      navigation.navigate('Library', { packId: pack.id })
                    }
                  >
                    <View style={styles.packInfo}>
                      <Text style={styles.packName}>{pack.name}</Text>
                      <Text style={styles.packMeta}>
                        {pack.gridSize}×{pack.gridSize}
                      </Text>
                    </View>
                    <Text style={styles.packProgress}>
                      {completed}/{pack.puzzleCount}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          )}

          {paidPacks.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>More Packs</Text>
              {paidPacks.map(pack => {
                const hasAccess = hasPackAccess(pack.id);
                const completed = completedPerPack[pack.id] ?? 0;
                return (
                  <Pressable
                    key={pack.id}
                    style={styles.packCard}
                    onPress={() =>
                      navigation.navigate('Library', { packId: pack.id })
                    }
                  >
                    <View style={styles.packInfo}>
                      <Text style={styles.packName}>{pack.name}</Text>
                      <Text style={styles.packMeta}>
                        {pack.gridSize}×{pack.gridSize}
                      </Text>
                    </View>
                    {hasAccess ? (
                      <Text style={styles.packProgress}>
                        {completed}/{pack.puzzleCount}
                      </Text>
                    ) : (
                      <Text style={styles.packPrice}>
                        ${pack.priceUsd?.toFixed(2) ?? '—'}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacingXl,
      height: 57 + insets.top,
      backgroundColor: theme.bg,
    },
    appTitle: {
      fontSize: 28,
      fontFamily: 'Bitter',
      fontWeight: '600',
      color: theme.text,
    },
    headerRight: {
      flexDirection: 'row',
      gap: theme.spacingMd,
    },
    streakSection: {
      paddingTop: 34,
      backgroundColor: theme.bg,
    },
    packSection: {
      paddingTop: 34,
      backgroundColor: theme.bg,

      paddingHorizontal: theme.spacingXl,
    },
    streakRow: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      zIndex: 100,
      overflow: 'visible',
      marginBottom: 34,
    },
    streakCard: {
      borderRadius: 16,
      alignItems: 'center',
    },
    streakCardCompleted: {
      opacity: 0.6,
    },
    streakCardHeader: {
      width: '100%',
      alignItems: 'baseline',
    },
    streakLabel: {
      color: theme.text,
      lineHeight: 28,
      fontSize: 22,
      fontFamily: 'Bitter',
      fontWeight: '600',
      marginTop: 9,
    },
    streakMeta: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    streakThumbnailWrap: {
      borderRadius: 4,
      backgroundColor: theme.card,
    },
    streakCount: {
      fontSize: 18,
      fontWeight: theme.fontWeightSemibold,
      color: theme.accent,
      marginTop: theme.spacingMd,
    },
    sectionLabel: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
      marginBottom: theme.spacingMd,
    },
    packCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: theme.spacingXl,
      borderRadius: theme.radiusMd,
      marginBottom: theme.spacingMd,
      backgroundColor: theme.card,
      shadowColor: '#25292E',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: .1,
      shadowRadius: 4,
      elevation: 2,
    },
    packInfo: { flex: 1 },
    packName: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    packMeta: {
      fontSize: theme.fontSizeSubhead,
      marginTop: 4,
      color: theme.textSecondary,
    },
    packProgress: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.accent,
    },
    packPrice: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
    },
  });
