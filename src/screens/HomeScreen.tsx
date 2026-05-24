import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Text } from '../components/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Flame, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStreakPack, getPuzzlesForPack } from '../packs';
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
import { useProductPrice } from '../hooks/useProductPrice';
import type {
  Theme,
  StreakType,
  Streak,
  Pack,
  Puzzle,
  PackCatalogItem,
  RootStackParamList,
} from '../types.ts';

function PaidPackRow({
  pack,
  completed,
  onPress,
  styles,
  preview,
  theme,
  coloredRegions,
}: {
  pack: PackCatalogItem;
  completed: number;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  preview: Puzzle | undefined;
  theme: Theme;
  coloredRegions: boolean;
}) {
  const price = useProductPrice(`starbattle_pack_${pack.id}`);
  return (
    <Pressable style={styles.packCard} onPress={onPress}>
      {preview && (
        <View style={styles.packThumb}>
          <PuzzleThumbnail
            puzzle={preview}
            size={48}
            theme={theme}
            coloredRegions={coloredRegions}
          />
        </View>
      )}
      <View style={styles.packInfo}>
        <Text style={styles.packName}>{pack.name}</Text>
        <Text style={styles.packMeta}>
          {completed}/{pack.puzzleCount}
        </Text>
      </View>
      <Text style={styles.packPrice}>
        {price ??
          (pack.priceUsd != null ? `$${pack.priceUsd.toFixed(2)}` : '—')}
      </Text>
    </Pressable>
  );
}

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

  const [packPreviews, setPackPreviews] = useState<Record<string, Puzzle>>({});

  useEffect(() => {
    async function loadPackPreviews() {
      const results: Record<string, Puzzle> = {};
      await Promise.all(
        packCatalog.map(async pack => {
          const rawPuzzles = await getPuzzlesForPack(pack.id);
          if (!rawPuzzles?.length) return;
          results[pack.id] = parsePuzzle(rawPuzzles[0], `${pack.id}:0`);
        }),
      );
      setPackPreviews(results);
    }
    loadPackPreviews();
  }, [packCatalog]);

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
        <Text style={styles.appTitle}>Star Battle Free</Text>
        <View style={styles.headerRight}>
          <CircleButton
            onPress={() => useSettingsStore.getState().openStreaks()}
          >
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
              paddingRight: 16,
              paddingLeft: 16,
              gap: 16,
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
                  {isCompleted && streakCount > 0 && (
                    <Text style={styles.streakCount}>{streakCount}</Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.packSection}>
          <Text style={styles.sectionLabel}>Puzzle Library</Text>
          {freePacks.map(pack => {
            const completed = completedPerPack[pack.id] ?? 0;
            const preview = packPreviews[pack.id];
            return (
              <Pressable
                key={pack.id}
                style={styles.packCard}
                onPress={() =>
                  navigation.navigate('Library', { packId: pack.id })
                }
              >
                {preview && (
                  <View style={styles.packThumb}>
                    <PuzzleThumbnail
                      puzzle={preview}
                      size={48}
                      theme={theme}
                      coloredRegions={coloredRegions}
                    />
                  </View>
                )}
                <View style={styles.packInfo}>
                  <Text style={styles.packName}>{pack.name}</Text>
                  <Text style={styles.packMeta}>
                    {completed}/{pack.puzzleCount}
                  </Text>
                </View>
                {/* <Text style={styles.packProgress}>
                  {completed}/{pack.puzzleCount}
                </Text> */}
              </Pressable>
            );
          })}

          {paidPacks.map(pack => {
            const hasAccess = hasPackAccess(pack.id);
            const completed = completedPerPack[pack.id] ?? 0;
            const preview = packPreviews[pack.id];
            if (hasAccess) {
              return (
                <Pressable
                  key={pack.id}
                  style={styles.packCard}
                  onPress={() =>
                    navigation.navigate('Library', { packId: pack.id })
                  }
                >
                  {preview && (
                    <View style={styles.packThumb}>
                      <PuzzleThumbnail
                        puzzle={preview}
                        size={48}
                        theme={theme}
                        coloredRegions={coloredRegions}
                      />
                    </View>
                  )}
                  <View style={styles.packInfo}>
                    <Text style={styles.packName}>{pack.name}</Text>
                    <Text style={styles.packMeta}>
                      {completed}/{pack.puzzleCount}
                    </Text>
                  </View>
                </Pressable>
              );
            }
            return (
              <PaidPackRow
                key={pack.id}
                pack={pack}
                completed={completed}
                onPress={() =>
                  navigation.navigate('Library', { packId: pack.id })
                }
                styles={styles}
                preview={preview}
                theme={theme}
                coloredRegions={coloredRegions}
              />
            );
          })}
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
      fontSize: 22,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -0.33,
    },
    headerRight: {
      flexDirection: 'row',
      gap: theme.spacingMd,
    },
    streakSection: {
      paddingTop: 32,
      backgroundColor: theme.bg,
    },
    packSection: {
      paddingTop: 16,
      backgroundColor: theme.bg,

      paddingHorizontal: 16,
    },
    streakRow: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      zIndex: 100,
      overflow: 'visible',
      marginBottom: 16,
    },
    streakCard: {
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.textSecondary + '33',
      padding: 16,
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
      lineHeight: 34,
      fontSize: 28,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      marginTop: 9,
      letterSpacing: -0.42,
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
      lineHeight: 30,

      marginBottom: 16,
      fontSize: 24,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -0.33,
    },
    packCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 17,
      borderRadius: 4,
      marginBottom: 12,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.textSecondary + '33',
    },
    packThumb: {
      marginRight: 14,
    },
    packInfo: { flex: 1 },
    packName: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: 700,
      color: theme.text,
      letterSpacing: -0.56,
    },
    packMeta: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: 500,
      color: theme.textSecondary,
      letterSpacing: -0.56,
      marginTop: 2,
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
