import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  TextStyle,
} from 'react-native';
import { Text } from '../components/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import Flame from 'lucide-react-native/dist/cjs/icons/flame';
import User from 'lucide-react-native/dist/cjs/icons/user';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleButton } from '../components/CircleButton';
import { useSettingsStore } from '../stores/settingsStore';
import { useStreaksStore } from '../stores/streaksStore';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { usePackPreviews } from '../hooks/usePackPreviews';
import { useCompletionData } from '../hooks/useCompletionData';
import { useStreakRows } from '../hooks/useStreakRows';
import {
  getCurrentKey,
  getActiveStreak,
  STREAK_TYPES,
  STREAK_UNIT,
} from '../utils/streakDate';
import { useAuthStore } from '../stores/authStore';
import { startupTimer } from '../utils/startupTimer';
import { PuzzleThumbnail } from '../components/PuzzleThumbnail';
import { PackCard } from '../components/PackCard';
import { useProductPrice } from '../hooks/useProductPrice';
import type {
  Theme,
  PackCatalogItem,
  Puzzle,
  RootStackParamList,
} from '../types';
import { SCREEN_HEADER_HEIGHT } from '../layout';

const HEADER_HEIGHT = SCREEN_HEADER_HEIGHT;

// PaidPackRow is its own component because useProductPrice is a hook — hooks
// cannot be called conditionally, so this component wraps the per-pack call
// that would otherwise live inside the paidPacks.map() callback.
function PaidPackRow({
  pack,
  completed,
  onPress,
  preview,
  theme,
  coloredRegions,
  priceStyle,
}: {
  pack: PackCatalogItem;
  completed: number;
  onPress: () => void;
  preview: Puzzle | undefined;
  theme: Theme;
  coloredRegions: boolean;
  priceStyle: TextStyle;
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
        <Text style={priceStyle}>
          {price ??
            (pack.priceUsd != null ? `$${pack.priceUsd.toFixed(2)}` : '—')}
        </Text>
      }
    />
  );
}

// Returns the subtitle shown beneath each streak card based on whether the
// user completed today's puzzle and their current streak length.
function getStreakLabel(
  isCompleted: boolean,
  streakCount: number,
  type: string,
  packName: string,
): string {
  if (isCompleted && streakCount > 0)
    return `${streakCount} ${STREAK_UNIT[type]} streak`;
  if (isCompleted) return 'Completed';
  if (streakCount > 0)
    return `Continue your ${streakCount} ${STREAK_UNIT[type]} streak`;
  return `Start your ${packName} streak`;
}

export function HomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);
  const userId = useAuthStore(s => s.user?.id);
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const { packCatalog, hasPackAccess } = useEntitlements();

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    startupTimer.log('HomeScreen first mount');
  }, []);

  // Categorize packs in a single pass rather than three separate filter calls.
  // Streak packs are sorted to match the canonical STREAK_TYPES order.
  const { streakPacks, freePacks, paidPacks } = useMemo(() => {
    const streak: PackCatalogItem[] = [];
    const free: PackCatalogItem[] = [];
    const paid: PackCatalogItem[] = [];
    for (const p of packCatalog) {
      if (p.type) streak.push(p);
      else if (p.isFree) free.push(p);
      else paid.push(p);
    }
    streak.sort(
      (a, b) => STREAK_TYPES.indexOf(a.type!) - STREAK_TYPES.indexOf(b.type!),
    );
    return { streakPacks: streak, freePacks: free, paidPacks: paid };
  }, [packCatalog]);

  // Thumbnail puzzle previews for every pack (today's for streaks, first puzzle for library).
  const packPreviews = usePackPreviews(packCatalog);

  // Completion state: today's streak puzzle IDs and solved counts per library pack.
  // Reloads on screen focus so numbers update after the user solves a puzzle.
  const { completedPuzzleIds, completedPerPack } = useCompletionData(
    packCatalog,
    userId,
  );

  // Live streak rows from PowerSync — updates reactively as data syncs.
  const streaks = useStreakRows(userId);

  return (
    <View style={styles.container}>
      {/* Floating header — shows a bottom border once the user has scrolled */}
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
          paddingTop: HEADER_HEIGHT + insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {/* Horizontal carousel of streak packs (daily, weekly, monthly) */}
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

              // puzzleId format matches keys stored by useCompletionData.
              const puzzleId = `${pack.id}:${getCurrentKey(type)}`;
              const isCompleted = completedPuzzleIds.has(puzzleId);
              const found = streaks.find(s => s.type === type);
              // getActiveStreak returns 0 if the streak wasn't maintained.
              const streakCount = found ? getActiveStreak(found, type) : 0;

              return (
                <Pressable
                  onPress={() =>
                    navigation.navigate('Puzzle', { packId: pack.id })
                  }
                  key={pack.id}
                  style={[
                    styles.streakCard,
                    // streakCardCompleted is intentionally empty — reserved for
                    // future visual differentiation of completed cards.
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
                      {getStreakLabel(
                        isCompleted,
                        streakCount,
                        type,
                        pack.name,
                      )}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Puzzle library: free packs, then purchasable packs */}
        <View style={styles.packSection}>
          <Text style={styles.sectionLabel}>Puzzle Library</Text>

          {freePacks.map(pack => (
            <PackCard
              key={pack.id}
              name={pack.name}
              meta={`${completedPerPack[pack.id] ?? 0}/${pack.puzzleCount}`}
              preview={packPreviews[pack.id]}
              onPress={() =>
                navigation.navigate('Library', { packId: pack.id })
              }
              theme={theme}
              coloredRegions={coloredRegions}
            />
          ))}

          {paidPacks.map(pack => {
            const completed = completedPerPack[pack.id] ?? 0;

            // Purchased packs render identically to free packs.
            if (hasPackAccess(pack.id)) {
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
                preview={packPreviews[pack.id]}
                theme={theme}
                coloredRegions={coloredRegions}
                priceStyle={styles.packPrice}
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
      height: HEADER_HEIGHT + insets.top,
      backgroundColor: theme.background,
      // Default border color matches background so it's invisible until
      // headerBorder overrides it on scroll.
      borderBottomWidth: 1,
      borderBottomColor: theme.background,
    },
    headerBorder: {
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
    // Intentionally empty — placeholder for future completed-card styling.
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
      fontWeight: '600',
      marginTop: 7,
    },
    streakCheckCircle: {
      width: 22,
      height: 22,
      borderRadius: 100,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 7,
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
