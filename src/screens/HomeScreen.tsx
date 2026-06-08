import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../components/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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
import {
  getCurrentKey,
  getStreakCells,
  STREAK_TYPES,
  STREAK_LABELS,
} from '../utils/streakDate';
import { useAuthStore } from '../stores/authStore';
import { startupTimer } from '../utils/startupTimer';
import { PuzzleThumbnail } from '../components/PuzzleThumbnail';
import { StreakProgressRow } from '../components/StreakProgressRow';
import { PackCard, PackCardSkeleton } from '../components/PackCard';
import { PulseBox, PulseProvider } from '../components/Pulse';
import type {
  Theme,
  PackCatalogItem,
  RootStackParamList,
  StreakType,
} from '../types';
import { SCREEN_HEADER_HEIGHT } from '../layout';

const HEADER_HEIGHT = SCREEN_HEADER_HEIGHT;

// Placeholder library cards rendered before the catalog syncs, so the list has
// a stable, populated-looking shape from first paint.
const SKELETON_PACK_COUNT = 4;
// Streak card thumbnail width as a fraction of the viewport (RN has no vw unit).
const STREAK_CARD_FRACTION = 0.62;
// Horizontal gap between streak cards (matches the carousel's contentContainer gap).
const STREAK_CARD_GAP = 20;
// Left inset of the streak carousel from the screen edge.
const STREAK_ROW_PADDING = 20;

// Star rating of each special, shown as the streak card's static subtitle (the
// progress row below it conveys streak state, so the subtitle just describes the
// puzzle and never changes with completion).
const STREAK_STAR_COUNT: Record<StreakType, number> = {
  daily: 4,
  weekly: 5,
  monthly: 6,
};

export function HomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const streakCardSize = windowWidth * STREAK_CARD_FRACTION;
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

  // Thumbnail puzzle previews for every pack (today's for streaks, first puzzle
  // for library). The screen renders immediately; each card's thumbnail fills in
  // as its preview resolves (PackCard shows a placeholder until then).
  const { packPreviews } = usePackPreviews(packCatalog);

  // Completion state: today's streak puzzle IDs and solved counts per library pack.
  // Reloads on screen focus so numbers update after the user solves a puzzle.
  const { completedPuzzleIds, completedPerPack, completedStreakKeys } =
    useCompletionData(packCatalog, userId);

  // Fixed-size placeholder that reserves a streak card's exact footprint while
  // its preview loads (or before the catalog arrives), so the carousel doesn't
  // pop in and shove the library list down. Mirrors streakCard's thumb/label/
  // meta heights and margins.
  const renderStreakSkeleton = (key: string) => (
    <View key={key} style={styles.streakCard}>
      <PulseBox
        width={streakCardSize}
        height={streakCardSize}
        radius={5}
        baseColor={theme.border}
      />
      <PulseBox
        width={120}
        height={36}
        radius={5}
        baseColor={theme.border}
        style={styles.streakLabelSkeleton}
      />
      <PulseBox
        width={110}
        height={22}
        radius={5}
        baseColor={theme.border}
        style={styles.streakMetaSkeleton}
      />
    </View>
  );

  return (
    <PulseProvider>
      <View style={styles.container}>
        {/* Floating header — shows a bottom border once the user has scrolled */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top },
            scrolled && styles.headerBorder,
          ]}
        >
          <Text role="largeTitle" serif style={styles.appTitle}>
            Home
          </Text>
          <View style={styles.headerRight}>
            <CircleButton
              onPress={() => useStreaksStore.getState().openStreaks()}
            >
              <Flame size={26} strokeWidth={2} color={theme.text} />
            </CircleButton>
            <CircleButton
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
            <Text
              serif
              role="title1"
              style={[
                styles.sectionLabel,
                {
                  marginLeft: 20,
                  marginRight: 20,
                  borderTopWidth: 0,
                  marginBottom: 26,
                  marginTop: -14.5,
                  paddingTop: 24,
                },
              ]}
            >
              Streaks
            </Text>

            <ScrollView
              style={styles.streakRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              // Snap each streak card to the left edge as it pauses.
              // Interval = card (thumbnail) width + the gap between cards, both
              // derived from the viewport so snapping stays aligned on every device.
              snapToInterval={streakCardSize + STREAK_CARD_GAP}
              snapToAlignment="start"
              decelerationRate="fast"
              contentContainerStyle={{
                paddingLeft: STREAK_ROW_PADDING,
                // Trailing space sized so the last card can snap all the way to
                // the start (same left inset as every other card) without
                // clamping early: viewport − card − left inset.
                paddingRight: Math.max(
                  STREAK_ROW_PADDING,
                  windowWidth - streakCardSize - STREAK_ROW_PADDING,
                ),
                gap: STREAK_CARD_GAP,
              }}
            >
              {streakPacks.length === 0
                ? STREAK_TYPES.map(type => renderStreakSkeleton(type))
                : streakPacks.map(pack => {
                    const type = pack.type!;
                    const preview = packPreviews[pack.id];
                    if (!preview) return renderStreakSkeleton(pack.id);

                    // puzzleId format matches keys stored by useCompletionData.
                    const puzzleId = `${pack.id}:${getCurrentKey(type)}`;
                    const isCompleted = completedPuzzleIds.has(puzzleId);

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
                          size={streakCardSize}
                          theme={theme}
                          coloredRegions={coloredRegions}
                        />
                        <Text role="callout" style={styles.streakLabel}>
                          {`${STREAK_LABELS[type]} Special`}
                        </Text>
                        <Text role="subhead" style={styles.streakMeta}>
                          {`${STREAK_STAR_COUNT[type]} star puzzle`}
                        </Text>
                        {/*<StreakProgressRow
                          cells={getStreakCells(type)}
                          completedKeys={completedStreakKeys[type]}
                          theme={theme}
                        />*/}
                      </Pressable>
                    );
                  })}
            </ScrollView>
          </View>

          {/* Puzzle library: free packs, then purchasable packs */}
          <View style={styles.packSection}>
            <Text
              serif
              role="title1"
              style={[styles.sectionLabel, { marginTop: 36, marginBottom: 24 }]}
            >
              Puzzle Library
            </Text>

            {packCatalog.length === 0 &&
              Array.from({ length: SKELETON_PACK_COUNT }, (_, i) => (
                <PackCardSkeleton key={`pack-skeleton-${i}`} theme={theme} />
              ))}

            {freePacks.map(pack =>
              packPreviews[pack.id] ? (
                <PackCard
                  key={pack.id}
                  name={pack.name}
                  meta={`${pack.stars} star puzzles`}
                  completed={completedPerPack[pack.id] ?? 0}
                  total={pack.puzzleCount}
                  preview={packPreviews[pack.id]}
                  onPress={() =>
                    navigation.navigate('Library', { packId: pack.id })
                  }
                  theme={theme}
                  coloredRegions={coloredRegions}
                />
              ) : (
                <PackCardSkeleton key={pack.id} theme={theme} />
              ),
            )}

            {paidPacks.map(pack => {
              const owned = hasPackAccess(pack.id);
              if (!packPreviews[pack.id]) {
                return <PackCardSkeleton key={pack.id} theme={theme} />;
              }
              // Owned packs show solve progress; locked packs show a lock.
              return (
                <PackCard
                  key={pack.id}
                  name={pack.name}
                  meta={`${pack.stars} star puzzles`}
                  locked={!owned}
                  completed={owned ? completedPerPack[pack.id] ?? 0 : undefined}
                  total={owned ? pack.puzzleCount : undefined}
                  preview={packPreviews[pack.id]}
                  onPress={() =>
                    navigation.navigate('Library', { packId: pack.id })
                  }
                  theme={theme}
                  coloredRegions={coloredRegions}
                />
              );
            })}
          </View>
        </ScrollView>
      </View>
    </PulseProvider>
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
      paddingHorizontal: 20,

      height: HEADER_HEIGHT + insets.top,
      backgroundColor: theme.background,
      // Default border color matches background so it's invisible until
      // headerBorder overrides it on scroll.
      borderBottomWidth: 1,
      borderBottomColor: theme.background,
    },
    headerBorder: {
      // borderBottomColor: theme.border,
    },
    appTitle: {
      color: theme.text,
    },
    headerRight: {
      flexDirection: 'row',
      gap: 12,
    },
    streakSection: {
      backgroundColor: theme.background,
    },
    packSection: {
      paddingTop: 0,
      backgroundColor: theme.background,
      paddingHorizontal: 20,
    },
    streakRow: {
      flexDirection: 'row',
      gap: 12,
      zIndex: 100,
      overflow: 'visible',
    },
    streakCard: {
      justifyContent: 'flex-start',
    },
    // Intentionally empty — placeholder for future completed-card styling.
    streakCardCompleted: {},
    // Position the shimmer label/meta bars to match the real card's streakLabel
    // (marginTop 16) and streakMeta (marginTop 7); each bar's own size is passed
    // to PulseBox, so a placeholder card is height-identical to a loaded one.
    streakLabelSkeleton: { marginTop: 16 },
    streakMetaSkeleton: { marginTop: 7 },
    streakLabel: {
      color: theme.text,
      fontWeight: 600,
      marginTop: 10,
    },
    streakMeta: {
      color: theme.textSecondary,
    },
    sectionLabel: {
      color: theme.text,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 12,
    },
  });
};
