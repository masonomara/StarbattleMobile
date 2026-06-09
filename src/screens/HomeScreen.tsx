import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  Animated,
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
import { Haptics } from 'react-native-nitro-haptics';
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
const STREAK_CARD_FRACTION = 0.8;
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
  const hapticsEnabled = useSettingsStore(s => s.settings.haptics);
  const { packCatalog, hasPackAccess } = useEntitlements();

  const [scrolled, setScrolled] = useState(false);

  // Distance between consecutive snap points (one card + the gap after it).
  const streakInterval = streakCardSize + STREAK_CARD_GAP;

  // Which streak special the carousel is currently parked on (daily/weekly/
  // monthly). Drives the header indicator. The ref mirrors it so the scroll
  // handler can detect a *change* without depending on render state.
  const [activeStreakIndex, setActiveStreakIndex] = useState(0);
  const activeStreakIndexRef = useRef(0);

  // Live horizontal scroll offset of the carousel, mapped natively so the header
  // row's opacity tracks the drag every frame (not gated by the JS thread).
  const scrollX = useRef(new Animated.Value(0)).current;

  // Fade the header progress row out as the carousel passes the midpoint between
  // two cards and back in as the next card settles — a soft crossfade whose
  // trough lines up with where the rendered cells swap (so the swap is unseen).
  const headerProgressOpacity = useMemo(
    () =>
      Animated.modulo(scrollX, streakInterval).interpolate({
        inputRange: [0, streakInterval / 2, streakInterval],
        outputRange: [1, 0, 1],
      }),
    [scrollX, streakInterval],
  );

  // Update the active special as the carousel snaps between cards, bumping a
  // light haptic on each crossing. Rounding to the nearest card means the swap
  // fires as the user drags past the midpoint — the opacity trough — so the
  // content changes while the row is invisible.
  const handleStreakScroll = (e: {
    nativeEvent: { contentOffset: { x: number } };
  }) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / streakInterval);
    if (
      index !== activeStreakIndexRef.current &&
      index >= 0 &&
      index < STREAK_TYPES.length
    ) {
      activeStreakIndexRef.current = index;
      setActiveStreakIndex(index);
      if (hapticsEnabled) Haptics.impact('light');
    }
  };

  // Native-driven offset mapping for the opacity, with the JS listener above
  // still firing for the haptic and content swap.
  const onStreakScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: handleStreakScroll,
      }),
    // handleStreakScroll closes over hapticsEnabled/streakInterval; rebuild when
    // those change so the listener always sees current values.
    [scrollX, streakInterval, hapticsEnabled],
  );

  // The special the carousel is parked on, whose progress row the header shows.
  const activeStreakType = STREAK_TYPES[activeStreakIndex];

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
          {/* Progress row for the special the carousel is parked on. Fades out
              and back in as the carousel scrolls between specials. */}
          <Animated.View
            style={[styles.headerProgress, { opacity: headerProgressOpacity }]}
          >
            <StreakProgressRow
              cells={getStreakCells(activeStreakType)}
              completedKeys={completedStreakKeys[activeStreakType]}
              theme={theme}
            />
          </Animated.View>
          <View style={styles.headerRight}>
            {/*<CircleButton
              onPress={() => useStreaksStore.getState().openStreaks()}
            >
              <Flame size={26} strokeWidth={2} color={theme.text} />
            </CircleButton>*/}
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
            {/*<Text
              role="subhead"
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
            </Text>*/}

            <Animated.ScrollView
              style={styles.streakRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={onStreakScroll}
              scrollEventThrottle={16}
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
                        <Text role="title1" style={styles.streakLabel}>
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
            </Animated.ScrollView>
          </View>

          {/* Puzzle library: free packs, then purchasable packs */}
          <View style={styles.packSection}>
            <Text
              role="subhead"
              style={[
                styles.sectionLabel,
                {
                  marginTop: 40,
                  marginBottom: 32,
                  textTransform: 'uppercase',
                  fontWeight: '600',
                },
              ]}
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
    // Cancels StreakProgressRow's own top margin (meant for under-card layout)
    // so its circles sit centered in the header.
    headerProgress: {
      marginTop: -15,
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
