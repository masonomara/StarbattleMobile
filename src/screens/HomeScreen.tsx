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
  STREAK_UNIT,
} from '../utils/streakDate';
import { loadAllCompletionData } from '../utils/progress';
import { db } from '../powersync/AppSchema';
import { useAuthStore } from '../stores/authStore';
import { parsePuzzle } from '../utils/parsePuzzle';
import { startupTimer } from '../utils/startupTimer';
import { PuzzleThumbnail } from '../components/PuzzleThumbnail';
import { PackCard } from '../components/PackCard';
import { useProductPrice } from '../hooks/useProductPrice';
import type {
  Theme,
  Streak,
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
    <PackCard
      name={pack.name}
      meta={`${completed}/${pack.puzzleCount}`}
      preview={preview}
      onPress={onPress}
      theme={theme}
      coloredRegions={coloredRegions}
      right={
        <Text style={styles.packPrice}>
          {price ??
            (pack.priceUsd != null ? `$${pack.priceUsd.toFixed(2)}` : '—')}
        </Text>
      }
    />
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

  const [packPreviews, setPackPreviews] = useState<Record<string, Puzzle>>({});

  useEffect(() => {
    startupTimer.log('HomeScreen first mount');
  }, []);

  useEffect(() => {
    async function loadPackPreviews() {
      const results: Record<string, Puzzle> = {};
      await Promise.all(
        packCatalog.map(async pack => {
          if (pack.type) {
            const streakPack = await getStreakPack(pack.type);
            if (!streakPack) return;
            const idx = getPuzzleIndex(pack.type, streakPack.puzzles.length);
            results[pack.id] = parsePuzzle(
              streakPack.puzzles[idx],
              `${pack.id}:${getCurrentKey(pack.type)}`,
            );
          } else {
            const rawPuzzles = await getPuzzlesForPack(
              pack.id,
              pack.storagePath,
            );
            if (!rawPuzzles?.length) return;
            results[pack.id] = parsePuzzle(rawPuzzles[0], `${pack.id}:0`);
          }
        }),
      );
      setPackPreviews(results);
    }
    loadPackPreviews();
  }, [packCatalog]);

  const [scrolled, setScrolled] = useState(false);
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [completedPuzzleIds, setCompletedPuzzleIds] = useState<Set<string>>(
    new Set(),
  );
  const [completedPerPack, setCompletedPerPack] = useState<
    Record<string, number>
  >({});

  const streakPacks = useMemo(
    () =>
      packCatalog
        .filter(p => !!p.type)
        .sort(
          (a, b) =>
            STREAK_TYPES.indexOf(a.type!) - STREAK_TYPES.indexOf(b.type!),
        ),
    [packCatalog],
  );
  const freePacks = useMemo(
    () => packCatalog.filter(p => !p.type && p.isFree),
    [packCatalog],
  );
  const paidPacks = useMemo(
    () => packCatalog.filter(p => !p.type && !p.isFree),
    [packCatalog],
  );

  const load = useCallback(async () => {
    const allCompleted = await loadAllCompletionData();

    const completedIds = new Set<string>();
    for (const pack of packCatalog) {
      if (!pack.type) continue;
      const puzzleId = `${pack.id}:${getCurrentKey(pack.type)}`;
      if (allCompleted.has(puzzleId)) completedIds.add(puzzleId);
    }
    setCompletedPuzzleIds(completedIds);

    const counts: Record<string, number> = {};
    for (const pack of packCatalog) {
      if (pack.type) continue;
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

  useEffect(() => {
    if (!userId) return;

    const applyRows = (
      rows: {
        type: string;
        current_count: number;
        last_completed_key: string;
      }[],
    ) => {
      setStreaks(
        rows.map(r => ({
          type: r.type as Streak['type'],
          current: r.current_count,
          lastCompletedKey: r.last_completed_key,
        })),
      );
    };

    db.getAll<{
      type: string;
      current_count: number;
      last_completed_key: string;
    }>(
      'SELECT type, current_count, last_completed_key FROM streaks WHERE user_id = ?',
      [userId],
    ).then(applyRows);

    const controller = new AbortController();
    db.watch(
      'SELECT type, current_count, last_completed_key FROM streaks WHERE user_id = ?',
      [userId],
      {
        onResult: result => applyRows(result.rows?._array ?? []),
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [userId]);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top },
          scrolled && styles.headerBorder,
        ]}
      >
        <Text style={styles.appTitle}>Star Battle Free</Text>
        <View style={styles.headerRight}>
          <CircleButton
            ghost
            onPress={() => useStreaksStore.getState().openStreaks()}
          >
            <Flame size={26} strokeWidth={2} color={theme.text} />
          </CircleButton>
          <CircleButton
            ghost
            onPress={() => useSettingsStore.getState().openSettings()}
          >
            <User size={26} strokeWidth={2} color={theme.text} />
          </CircleButton>
        </View>
      </View>

      <ScrollView
        onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 0)}
        scrollEventThrottle={16}
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
            {streakPacks.map(pack => {
              const type = pack.type!;
              const preview = packPreviews[pack.id];
              if (!preview) return null;
              const key = getCurrentKey(type);
              const puzzleId = `${pack.id}:${key}`;
              const isCompleted = completedPuzzleIds.has(puzzleId);
              const found = streaks.find(s => s.type === type);
              const streakCount = found ? getActiveStreak(found, type) : 0;

              return (
                <Pressable
                  onPress={() =>
                    navigation.navigate('Puzzle', { packId: pack.id })
                  }
                  key={pack.id}
                  style={[
                    styles.streakCard,
                    isCompleted && styles.streakCardCompleted,
                  ]}
                >
                  <PuzzleThumbnail
                    puzzle={preview}
                    size={260}
                    theme={theme}
                    coloredRegions={coloredRegions}
                  />

                  <Text style={styles.streakLabel}>{pack.name}</Text>
                  <View style={styles.streakMetaRow}>
                    {isCompleted && (
                      <View style={styles.streakCheckCircle}>
                        <Check size={17} color={theme.green} strokeWidth={3} />
                      </View>
                    )}
                    <Text style={styles.streakMeta}>
                      {isCompleted && streakCount > 0
                        ? `${streakCount} ${STREAK_UNIT[type]} streak`
                        : isCompleted
                        ? `Completed`
                        : streakCount > 0
                        ? `Continue your ${streakCount} ${STREAK_UNIT[type]} streak`
                        : `Start your ${pack.name} streak`}
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
            return (
              <PackCard
                key={pack.id}
                name={pack.name}
                meta={`${completed}/${pack.puzzleCount}`}
                preview={packPreviews[pack.id]}
                onPress={() =>
                  navigation.navigate('Library', { packId: pack.id })
                }
                theme={theme}
                coloredRegions={coloredRegions}
              />
            );
          })}

          {paidPacks.map(pack => {
            const hasAccess = hasPackAccess(pack.id);
            const completed = completedPerPack[pack.id] ?? 0;
            if (hasAccess) {
              return (
                <PackCard
                  key={pack.id}
                  name={pack.name}
                  meta={`${completed}/${pack.puzzleCount}`}
                  preview={packPreviews[pack.id]}
                  onPress={() =>
                    navigation.navigate('Library', { packId: pack.id })
                  }
                  theme={theme}
                  coloredRegions={coloredRegions}
                />
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
                preview={packPreviews[pack.id]}
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
      borderBottomWidth: 1,
      borderBottomColor: theme.background,
    },
    headerBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
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
      gap: 8,
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
    packPrice: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
    },
  });
};
