import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Text } from '../components/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Check, Flame, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStreakPack, getPuzzlesForPack } from '../packs';
import { CircleButton } from '../components/CircleButton';
import { useSettingsStore } from '../stores/settingsStore';
import { useStreaksStore } from '../stores/streaksStore';
import { useTheme } from '../hooks/useTheme';
import { rgba } from '../themes/ansi';
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
            onPress={() => useStreaksStore.getState().openStreaks()}
          >
            <Flame
              size={24}
              color={rgba(theme.isDark ? theme.white : theme.black, 1)}
            />
          </CircleButton>
          <CircleButton
            onPress={() => useSettingsStore.getState().openSettings()}
          >
            <User
              size={24}
              color={rgba(theme.isDark ? theme.white : theme.black, 1)}
            />
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
              gap: 12,
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
                  onPress={() =>
                    navigation.navigate('Puzzle', { streakType: type })
                  }
                  key={type}
                  style={[
                    styles.streakCard,

                    // { backgroundColor: STREAK_TILE_COLORS[i] },
                    isCompleted && styles.streakCardCompleted,
                  ]}
                >
                  <View style={styles.streakTopRow}>
                    <View style={styles.streakThumbnailWrap}>
                      <PuzzleThumbnail
                        puzzle={preview}
                        size={240}
                        theme={theme}
                        coloredRegions={coloredRegions}
                      />
                    </View>
                    <View style={styles.streakCardHeader}>
                      <Text style={styles.streakLabel}>
                        {STREAK_LABELS[type]} Special
                      </Text>
                      <View style={styles.streakMetaRow}>
                        {isCompleted && (
                          <Check size={16} color="#22c55e" strokeWidth={2.5} />
                        )}
                        <Text style={styles.streakMeta}>
                          {streakCount > 0
                            ? `${streakCount} day streak`
                            : `Play ${STREAK_LABELS[type]} puzzle`}
                        </Text>
                      </View>
                    </View>
                  </View>
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

const createStyles = (
  theme: Theme,
  insets: { top: number; bottom: number },
) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: rgba(theme.isDark ? theme.black : theme.white, 1),
    },
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      height: 57 + insets.top,
      backgroundColor: rgba(theme.isDark ? theme.black : theme.white, 1),
    },
    appTitle: {
      fontSize: 24,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
      letterSpacing: -0.42,
    },
    headerRight: {
      flexDirection: 'row',
      gap: theme.spacingMd,
    },
    streakSection: {
      paddingTop: 32,
      backgroundColor: rgba(theme.isDark ? theme.black : theme.white, 1),
    },
    packSection: {
      paddingTop: 16,
      backgroundColor: rgba(theme.isDark ? theme.black : theme.white, 1),

      paddingHorizontal: 16,
    },
    streakRow: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      zIndex: 100,
      overflow: 'visible',
      marginBottom: 24,
    },
    streakCard: {
      borderRadius: 4,
      padding: 16,
      gap: 0,
      justifyContent: 'flex-start',

      borderWidth: 1,
      borderColor: rgba(theme.isDark ? theme.gray : theme.lightGray, 1),
    },
    streakCardCompleted: {
      opacity: 0.6,
    },
    streakTopRow: {
      flexDirection: 'column',
      gap: 16,
      alignItems: 'flex-start',
      width: '100%',
    },
    streakCardHeader: {
      flex: 1,
      justifyContent: 'flex-start',
    },
    streakLabel: {
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
      lineHeight: 37,
      fontSize: 30,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      letterSpacing: -0.42,
    },
    streakMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      marginBottom: 4,
    },
    streakMeta: {
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
      fontSize: 17,
      lineHeight: 22,
      fontWeight: 500,
    },
    streakThumbnailWrap: {
      overflow: 'hidden',
      backgroundColor: rgba(theme.isDark ? theme.gray : theme.gray, 1),
    },

    streakPlayButton: {
      borderRadius: 8,
      alignItems: 'center',
      height: 56,
      borderWidth: 2,
      justifyContent: 'center',
      borderColor: rgba(theme.isDark ? theme.white : theme.black, 1),
      backgroundColor: rgba(theme.isDark ? theme.black : theme.blue, 1),
    },
    streakPlayButtonText: {
      fontSize: 19,
      fontWeight: '600',
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
    },
    sectionLabel: {
      lineHeight: 30,

      marginBottom: 16,
      fontSize: 24,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
      letterSpacing: -0.33,
    },
    packCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderRadius: 4,
      marginBottom: 12,
      backgroundColor: rgba(theme.isDark ? theme.black : theme.white, 1),
      borderWidth: 1,
      borderColor: rgba(theme.isDark ? theme.gray : theme.lightGray, 1),
    },
    packThumb: {
      marginRight: 14,
    },
    packInfo: { flex: 1 },
    packName: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: 700,
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
      letterSpacing: -0.56,
    },
    packMeta: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: 500,
      color: rgba(theme.isDark ? theme.gray : theme.gray, 1),
      letterSpacing: -0.56,
      marginTop: 2,
    },
    packProgress: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(theme.blue, 1),
    },
    packPrice: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(theme.isDark ? theme.gray : theme.gray, 1),
    },
  });
};
