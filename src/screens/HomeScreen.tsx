import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Text } from '../components/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import Flame from 'lucide-react-native/dist/cjs/icons/flame';
import User from 'lucide-react-native/dist/cjs/icons/user';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStreakPack, getPuzzlesForPack } from '../packs';
import { CircleButton } from '../components/CircleButton';
import { useSettingsStore } from '../stores/settingsStore';
import { useStreaksStore } from '../stores/streaksStore';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import {
  getCurrentKey,
  getActiveStreak,
  getPuzzleIndex,
  STREAK_TYPES,
  STREAK_LABELS,
} from '../utils/streakDate';
import { loadStreaks, loadAllCompletionData } from '../utils/progress';
import { useAuthStore } from '../stores/authStore';
import { parsePuzzle } from '../utils/parsePuzzle';
import { startupTimer } from '../utils/startupTimer';
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
} from '../types';

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
  const userId = useAuthStore(s => s.user?.id);
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const { packCatalog, hasPackAccess } = useEntitlements();

  const [loadedStreakPacks, setLoadedStreakPacks] = useState<
    Partial<Record<StreakType, Pack>>
  >({});
  const [streakPreviews, setStreakPreviews] = useState<
    Partial<Record<StreakType, Puzzle>>
  >({});

  useEffect(() => {
    startupTimer.log('HomeScreen first mount');
  }, []);

  useEffect(() => {
    async function loadPreviews() {
      console.log('[SB:HOME] loadPreviews start');
      const packsResult: Partial<Record<StreakType, Pack>> = {};
      const previewsResult: Partial<Record<StreakType, Puzzle>> = {};
      try {
        await Promise.all(
          STREAK_TYPES.map(async type => {
            const pack = await getStreakPack(type);
            console.log(`[SB:HOME] ${type}: pack=${pack ? `v${pack.version} ${pack.puzzles.length}pz gridSize=${pack.gridSize}` : 'NULL'}`);
            if (!pack) return;
            packsResult[type] = pack;
            const idx = getPuzzleIndex(type, pack.puzzles.length);
            const puzzleAtIdx = pack.puzzles[idx];
            console.log(`[SB:HOME] ${type}: idx=${idx}, puzzle=${puzzleAtIdx ? Object.keys(puzzleAtIdx).join(',') : 'UNDEFINED'}`);
            const key = getCurrentKey(type);
            previewsResult[type] = parsePuzzle(puzzleAtIdx, `${type}:${key}`);
            console.log(`[SB:HOME] ${type}: parsePuzzle OK`);
          }),
        );
      } catch (e) {
        console.error('[SB:HOME] loadPreviews threw:', e);
      }
      console.log(`[SB:HOME] setState — packs: [${Object.keys(packsResult).join(',')}], previews: [${Object.keys(previewsResult).join(',')}]`);
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
          const rawPuzzles = await getPuzzlesForPack(pack.id, pack.storagePath);
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

  const freePacks = useMemo(() => packCatalog.filter(p => p.isFree), [packCatalog]);
  const paidPacks = useMemo(() => packCatalog.filter(p => !p.isFree), [packCatalog]);

  const load = useCallback(async () => {
    const [fetchedStreaks, allCompleted] = await Promise.all([
      loadStreaks(),
      loadAllCompletionData(),
    ]);

    setStreaks(fetchedStreaks);

    const completedIds = new Set<string>();
    for (const type of STREAK_TYPES) {
      const puzzleId = `${type}:${getCurrentKey(type)}`;
      if (allCompleted.has(puzzleId)) completedIds.add(puzzleId);
    }
    setCompletedPuzzleIds(completedIds);

    const counts: Record<string, number> = {};
    for (const pack of packCatalog) {
      let count = 0;
      for (let i = 0; i < pack.puzzleCount; i++) {
        if (allCompleted.has(`${pack.id}:${i}`)) count++;
      }
      counts[pack.id] = count;
    }
    setCompletedPerPack(counts);
  }, [packCatalog]);

  useEffect(() => {
    if (isFocused && userId) load();
  }, [isFocused, userId, load]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.appTitle}>Star Battle Free</Text>
        <View style={styles.headerRight}>
          <CircleButton
            onPress={() => useStreaksStore.getState().openStreaks()}
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
                  <PuzzleThumbnail
                    puzzle={preview}
                    size={260}
                    theme={theme}
                    coloredRegions={coloredRegions}
                  />

                  <Text style={styles.streakLabel}>
                    {STREAK_LABELS[type]} Special
                  </Text>
                  <View style={styles.streakMetaRow}>
                    {isCompleted && (
                      <View style={styles.streakCheckCircle}>
                        <Check size={17} color={theme.green} strokeWidth={3} />
                      </View>
                    )}
                    <Text style={styles.streakMeta}>
                      {isCompleted
                        ? `${streakCount} day streak`
                        : streakCount > 0
                          ? `Continue your ${streakCount} day streak`
                          : `Start your ${STREAK_LABELS[type]} streak`}
                    </Text>
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
      backgroundColor: theme.background,
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
      backgroundColor: theme.background,
    },
    appTitle: {
      fontSize: 25,
      lineHeight: 28,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -0.42,
    },
    headerRight: {
      flexDirection: 'row',
      gap: theme.spacingMd,
    },
    streakSection: {
      paddingTop: 24,
      backgroundColor: theme.background,
    },
    packSection: {
      paddingTop: 16,
      backgroundColor: theme.background,
      paddingHorizontal: 16,
    },
    streakRow: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      zIndex: 100,
      overflow: 'visible',
      marginBottom: 32,
    },
    streakCard: {
      borderRadius: 4,
      padding: 16,
      gap: 0,
      justifyContent: 'flex-start',

      borderWidth: 1,
      borderColor: theme.border,
    },
    streakCardCompleted: {},

    streakLabel: {
      color: theme.text,
      lineHeight: 36,
      fontSize: 33,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      letterSpacing: -0.42,
      textTransform: 'capitalize',
      marginTop: 16,
    },
    streakMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    streakMeta: {
      color: theme.text,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: 600,
      marginTop: 7,
    },
    streakCheckCircle: {
      width: 22,
      height: 22,
      borderRadius: 100,
      // backgroundColor: theme.green + "2E",
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 7,
    },
    streakThumbnailWrap: {
      overflow: 'hidden',
      backgroundColor: theme.textSecondary,
    },

    streakPlayButton: {
      borderRadius: 8,
      alignItems: 'center',
      height: 56,
      borderWidth: 2,
      justifyContent: 'center',
      borderColor: theme.text,
      backgroundColor: theme.isDark ? theme.background : theme.blue,
    },
    streakPlayButtonText: {
      fontSize: 19,
      fontWeight: '600',
      color: theme.text,
    },
    sectionLabel: {
      lineHeight: 28,

      marginBottom: 16,
      fontSize: 25,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -0.33,
    },
    packCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderRadius: 4,
      marginBottom: 12,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
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
      color: theme.blue,
    },
    packPrice: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
    },
  });
};
