import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  Animated,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../shared/ui/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleButton } from '../../shared/ui/CircleButton';
import { Haptics } from 'react-native-nitro-haptics';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTheme } from '../../shared/theme/useTheme';
import { useEntitlements } from '../../hooks/useEntitlements';
import { usePackPreviews } from './usePackPreviews';
import { useCompletionData } from './useCompletionData';
import {
  getCurrentKey,
  getStreakCells,
  STREAK_TYPES,
  STREAK_LABELS,
  isStreakType,
} from '../../utils/streakDate';
import { useAuthStore } from '../../stores/authStore';
import { startupTimer } from '../../shared/lib/startupTimer';
import { PuzzleThumbnail } from './PuzzleThumbnail';
import { StreakProgressRow } from './StreakProgressRow';
import { PackCard, PackCardSkeleton } from './PackCard';
import { PulseBox, PulseProvider } from '../../shared/ui/Pulse';
import type {
  Theme,
  PackCatalogItem,
  RootStackParamList,
  StreakType,
} from '../../types';
import { SCREEN_HEADER_HEIGHT } from '../../shared/lib/layout';
import { MoreHorizontal } from 'lucide-react-native';

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

// Star rating of each challenge, shown as the streak card's static subtitle (the
// progress row below it conveys streak state, so the subtitle just describes the
// puzzle and never changes with completion).
const STREAK_STAR_COUNT: Record<StreakType, number> = {
  daily: 4,
  weekly: 5,
  monthly: 6,
};

// Display order for Puzzle Library bundle sections (the pack's `type` when it
// isn't a StreakType). Bundles not listed here sort after these, in the order
// they appear; the ungrouped ('') section always sorts last.
const LIBRARY_BUNDLE_ORDER = [
  'Intro',
  '1-Star Puzzles',
  '2-Star Puzzles',
  '3-Star Puzzles',
];

function bundleSortKey(bundle: string): number {
  const i = LIBRARY_BUNDLE_ORDER.indexOf(bundle);
  if (i !== -1) return i;
  return bundle ? LIBRARY_BUNDLE_ORDER.length : LIBRARY_BUNDLE_ORDER.length + 1;
}

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

  // Live horizontal scroll offset of the carousel, mapped natively so the header
  // crossfade tracks the drag every frame on the UI thread — never gated by, or
  // re-rendering on, the JS thread (the source of the fast-scroll jank).
  const scrollX = useRef(new Animated.Value(0)).current;

  // One opacity per challenge. Each row is fully visible while its card is parked
  // and through most of the swipe (the PLATEAU), then fades out over the last
  // stretch before the midpoint and is gone by it — so the fade "holds off"
  // rather than tracking every pixel, and a fast flick reads as a settled row
  // dipping briefly, not a strobe. Neighbours never overlap: at each midpoint
  // both adjacent rows are at 0, reproducing the fade-to-nothing-and-back look.
  const PLATEAU = 0.34; // fraction of a card kept at full opacity on each side
  const headerOpacities = useMemo(
    () =>
      STREAK_TYPES.map((_, i) =>
        scrollX.interpolate({
          inputRange: [
            (i - 0.5) * streakInterval,
            (i - PLATEAU) * streakInterval,
            (i + PLATEAU) * streakInterval,
            (i + 0.5) * streakInterval,
          ],
          outputRange: [0, 1, 1, 0],
          extrapolate: 'clamp',
        }),
      ),
    [scrollX, streakInterval],
  );

  // The carousel parks on a new challenge. Fires only the haptic — no setState, so
  // a fast flick crossing several cards never re-renders mid-scroll. The ref
  // tracks the last card so the bump fires once per crossing.
  const activeStreakIndexRef = useRef(0);
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
      if (hapticsEnabled) Haptics.impact('light');
    }
  };

  // Native-driven offset mapping for the crossfade, with the JS listener above
  // still firing for the haptic.
  const onStreakScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: handleStreakScroll,
      }),
    // handleStreakScroll closes over hapticsEnabled/streakInterval; rebuild when
    // those change so the listener always sees current values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollX, streakInterval, hapticsEnabled],
  );

  useEffect(() => {
    startupTimer.log('HomeScreen first mount');
  }, []);

  // Split the catalog in a single pass. A pack whose `type` is one of the three
  // hardcoded StreakTypes goes to the streak carousel; every other pack is a
  // library pack, grouped into sections by its `type` (the bundle name), with
  // ungrouped ('') packs collected under one trailing section.
  const { streakPacks, librarySections } = useMemo(() => {
    const streak: PackCatalogItem[] = [];
    const byBundle = new Map<string, PackCatalogItem[]>();
    for (const p of packCatalog) {
      if (isStreakType(p.type)) {
        streak.push(p);
        continue;
      }
      const bundle = p.type ?? '';
      const list = byBundle.get(bundle);
      if (list) list.push(p);
      else byBundle.set(bundle, [p]);
    }
    streak.sort(
      (a, b) =>
        STREAK_TYPES.indexOf(a.type as StreakType) -
        STREAK_TYPES.indexOf(b.type as StreakType),
    );
    const sections = [...byBundle.entries()]
      .map(([bundle, packs]) => ({ bundle, packs }))
      .sort((a, b) => bundleSortKey(a.bundle) - bundleSortKey(b.bundle));
    return { streakPacks: streak, librarySections: sections };
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
          {/* Progress rows for all three challenges, stacked. Only the one whose
              card the carousel is on shows; they crossfade (out-to-nothing then
              in) as it scrolls between challenges — driven entirely by scroll
              offset on the native thread, so no card swaps or re-renders. */}
          <View style={styles.headerProgress}>
            {STREAK_TYPES.map((type, i) => (
              <Animated.View
                key={type}
                pointerEvents="none"
                style={[
                  styles.headerProgressLayer,
                  { opacity: headerOpacities[i] },
                ]}
              >
                <StreakProgressRow
                  cells={getStreakCells(type)}
                  completedKeys={completedStreakKeys[type]}
                  theme={theme}
                />
              </Animated.View>
            ))}
          </View>
          <View style={styles.headerRight}>
            <CircleButton
              ghost
              onPress={() => useSettingsStore.getState().openSettings()}
            >
              <MoreHorizontal size={26} strokeWidth={2} color={theme.text} />
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
                    // streakPacks only holds StreakType packs (see categorization),
                    // so the guard always passes here — it just narrows the type.
                    if (!isStreakType(pack.type)) return null;
                    const type = pack.type;
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
                          {`${STREAK_LABELS[type]} Challenge`}
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

          {/* Puzzle library: packs grouped into sections by bundle (`type`). */}
          <View style={styles.packSection}>
            {packCatalog.length === 0 &&
              Array.from({ length: SKELETON_PACK_COUNT }, (_, i) => (
                <PackCardSkeleton key={`pack-skeleton-${i}`} theme={theme} />
              ))}

            {librarySections.map(section => (
              <View key={section.bundle || 'ungrouped'}>
                {section.bundle ? (
                  <Text
                    role="subhead"
                    style={[
                      styles.sectionLabel,
                      {
                        marginTop: 50,
                        marginBottom: 24,
                        textTransform: 'uppercase',
                        fontWeight: '400',
                        fontSize: 14,
                        lineHeight: 19,
                      },
                    ]}
                  >
                    {section.bundle}
                  </Text>
                ) : null}
                {section.packs.map(pack => {
                  if (!packPreviews[pack.id]) {
                    return <PackCardSkeleton key={pack.id} theme={theme} />;
                  }
                  // Free packs are always accessible; paid packs show a lock
                  // until owned, with solve progress only when accessible.
                  const owned = hasPackAccess(pack.id);
                  return (
                    <PackCard
                      key={pack.id}
                      name={pack.name}
                      meta={`${pack.stars} star puzzles`}
                      locked={!owned}
                      completed={
                        owned ? completedPerPack[pack.id] ?? 0 : undefined
                      }
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
            ))}
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
      borderBottomColor: theme.border,
    },
    // Fixed footprint that reserves space in the header for the stacked progress
    // rows (which are absolutely positioned and so don't size their parent).
    // Height = a progress circle; width covers the widest row (daily, 7 cells).
    headerProgress: {
      height: 22,
      width: 156,
      overflow: 'visible',
    },
    // Each crossfading layer sits at the same spot. top:-15 cancels
    // StreakProgressRow's own marginTop (meant for under-card layout) so the
    // circles sit flush at the container's top, centered in the header.
    headerProgressLayer: {
      position: 'absolute',
      left: 0,
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
      marginTop: 30,
    },
    streakCard: {
      justifyContent: 'flex-start',
    },
    // Intentionally empty — placeholder for future completed-card styling.
    streakCardCompleted: {},
    // Position the shimmer label/meta bars to match the real card's streakLabel
    // (marginTop 16) and streakMeta (marginTop 7); each bar's own size is passed
    // to PulseBox, so a placeholder card is height-identical to a loaded one.
    streakLabelSkeleton: {},
    streakMetaSkeleton: {},
    streakLabel: {
      color: theme.text,
    },
    streakMeta: {
      color: theme.textSecondary,
    },
    // Section header for each Puzzle Library bundle (Intro, 1-Star, …).
    sectionLabel: {
      color: theme.text,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 12,
    },
  });
};
