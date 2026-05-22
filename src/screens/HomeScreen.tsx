import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Flame, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { packs, streakPacks } from '../packs';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { getCurrentKey, getActiveStreak, getPuzzleIndex } from '../utils/streakDate';
import {
  loadStreaks,
  getCompletedCountForPack,
  loadProgress,
  getMostRecentInProgress,
} from '../utils/progress';
import { formatTime } from '../utils/formatTime';
import { parsePuzzle } from '../utils/parsePuzzle';
import { PuzzleThumbnail } from '../components/PuzzleThumbnail';
import type { StreakType, Streak } from '../types/state';
import type { PackCatalogItem } from '../types/user';
import type { RootStackParamList } from '../types/navigation';
import type { Puzzle } from '../types/puzzle';

const STREAK_TYPES: StreakType[] = ['daily', 'weekly', 'monthly'];

const STREAK_LABELS: Record<StreakType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

type PackDisplayItem = {
  id: string;
  name: string;
  gridSize: number;
  puzzleCount: number;
  isFree: boolean;
  priceUsd?: number;
  storagePath?: string;
};

type ContinueCard = {
  packId: string;
  puzzleIndex: number;
  packName: string;
  timeMs: number;
};

function packFromCatalog(item: PackCatalogItem): PackDisplayItem {
  return {
    id: item.id,
    name: item.name,
    gridSize: item.gridSize,
    puzzleCount: item.puzzleCount,
    isFree: item.isFree,
    priceUsd: item.priceUsd,
    storagePath: item.storagePath,
  };
}

export function HomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);
  const isFocused = useIsFocused();
  const { packCatalog, hasPackAccess } = useEntitlements();

  const streakPreviews = useMemo<Record<StreakType, Puzzle>>(() => {
    const result = {} as Record<StreakType, Puzzle>;
    for (const type of STREAK_TYPES) {
      const pack = streakPacks[type];
      const idx = getPuzzleIndex(type, pack.puzzles.length);
      const key = getCurrentKey(type);
      result[type] = parsePuzzle(pack.puzzles[idx], `${type}:${key}`);
    }
    return result;
  }, []);

  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [completedPuzzleIds, setCompletedPuzzleIds] = useState<Set<string>>(
    new Set(),
  );
  const [completedPerPack, setCompletedPerPack] = useState<
    Record<string, number>
  >({});
  const [continueCard, setContinueCard] = useState<ContinueCard | null>(null);

  const catalogMatchesBundled =
    packCatalog.length > 0 &&
    packCatalog.some(cp => packs.some(bp => bp.id === cp.id));

  const displayPacks: PackDisplayItem[] = catalogMatchesBundled
    ? packCatalog.map(packFromCatalog)
    : packs.map(p => ({
        id: p.id,
        name: p.name,
        gridSize: p.gridSize,
        puzzleCount: p.puzzles.length,
        isFree: true,
      }));

  const freePacks = displayPacks.filter(p => p.isFree);
  const paidPacks = displayPacks.filter(p => !p.isFree);

  function isPackAccessible(packId: string): boolean {
    if (packCatalog.length === 0) return true;
    return hasPackAccess(packId);
  }

  const load = useCallback(async () => {
    const rawStreaks = await loadStreaks();
    setStreaks(
      rawStreaks.map(r => ({
        type: r.type as StreakType,
        current: r.currentCount,
        lastCompletedKey: r.lastCompletedKey,
      })),
    );

    const completed = new Set<string>();
    for (const type of STREAK_TYPES) {
      const key = getCurrentKey(type);
      const puzzleId = `${type}:${key}`;
      const prog = await loadProgress(puzzleId);
      if (prog?.completed) completed.add(puzzleId);
    }
    setCompletedPuzzleIds(completed);

    const counts: Record<string, number> = {};
    for (const pack of displayPacks) {
      counts[pack.id] = await getCompletedCountForPack(
        pack.id,
        pack.puzzleCount,
      );
    }
    setCompletedPerPack(counts);

    const inProgress = await getMostRecentInProgress();
    if (inProgress) {
      const catalogPack = packCatalog.find(p => p.id === inProgress.packId);
      const bundledPack = packs.find(p => p.id === inProgress.packId);
      const packName =
        catalogPack?.name ?? bundledPack?.name ?? inProgress.packId;
      if (isPackAccessible(inProgress.packId)) {
        setContinueCard({
          packId: inProgress.packId,
          puzzleIndex: inProgress.puzzleIndex,
          packName,
          timeMs: inProgress.timeMs,
        });
      } else {
        setContinueCard(null);
      }
    } else {
      setContinueCard(null);
    }
  }, [packCatalog]);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.appTitle}>Star Battle</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('Streaks')}
            hitSlop={8}
          >
            <Flame size={22} color={theme.text} />
          </Pressable>
          <Pressable
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('Account')}
            hitSlop={8}
          >
            <User size={22} color={theme.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 57 + insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {continueCard && (
          <View style={styles.continueSection}>
            <Text style={styles.sectionLabel}>Continue Playing</Text>

            <Pressable
              style={styles.continueCard}
              onPress={() =>
                navigation.navigate('Puzzle', {
                  packId: continueCard.packId,
                  puzzleIndex: continueCard.puzzleIndex,
                })
              }
            >
              <View>
                <Text style={styles.continueLabel}>Continue</Text>
                <Text style={styles.continueName}>
                  {continueCard.packName} #{continueCard.puzzleIndex + 1}
                </Text>
              </View>
              <Text style={styles.continueTime}>
                {formatTime(continueCard.timeMs)}
              </Text>
            </Pressable>
          </View>
        )}
        <View style={styles.streakSection}>
          <Text style={styles.sectionLabel}>Streaks</Text>
          <ScrollView
            style={styles.streakRow}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingRight: theme.spacingXl,
              paddingLeft: theme.spacingXl,
              gap: theme.spacingMd,
            }}
          >
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
                  <View style={styles.streakCardHeader}>
                    <Text style={styles.streakLabel}>{STREAK_LABELS[type]}</Text>
                    <Text style={styles.streakMeta}>
                      {pack.gridSize}×{pack.gridSize}
                    </Text>
                  </View>
                  <View style={styles.streakThumbnailWrap}>
                    <PuzzleThumbnail
                      puzzle={streakPreviews[type]}
                      size={220}
                      theme={theme}
                    />
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
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    headerRight: {
      flexDirection: 'row',
      gap: theme.spacingMd,
    },
    headerIconButton: {
      width: 48,
      height: 48,
      borderRadius: 100,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: 1,
      borderColor: theme.bg,
    },
    scrollContent: {},
    continueCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: theme.spacingXl,
      borderRadius: theme.radiusMd,
      marginHorizontal: theme.spacingXl,
      marginBottom: theme.spacingXl,
      backgroundColor: theme.accent,
    },
    continueLabel: {
      fontSize: theme.fontSizeSm,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
      opacity: 0.8,
      marginBottom: 4,
    },
    continueName: {
      fontSize: theme.fontSizeMd,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
    },
    continueTime: {
      fontSize: theme.fontSizeSm,
      color: theme.onAccent,
      opacity: 0.8,
    },
    continueSection: {
      paddingTop: 34,
      paddingHorizontal: theme.spacingXl,
      backgroundColor: theme.bg,
    },
    streakSection: {
      paddingTop: 34,
      flexDirection: 'column',
      backgroundColor: theme.bg,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 56,
      elevation: 8,
    },
    packSection: {
      paddingTop: 34,
      backgroundColor: theme.bg,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 56,
      elevation: 8,
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
      padding: theme.spacingLg,
      paddingBottom: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.card,
      alignItems: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 2,
      zIndex: 70,
      width: 256,
    },
    streakCardCompleted: {
      opacity: 0.6,
    },
    streakCardHeader: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      marginBottom: theme.spacingMd,
    },
    streakLabel: {
      fontSize: theme.fontSizeMd,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    streakMeta: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    streakThumbnailWrap: {
      borderRadius: 4,
      overflow: 'hidden',
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
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
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
    packPrice: {
      fontSize: theme.fontSizeMd,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
    },
  });
