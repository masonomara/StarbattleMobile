import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../shared/ui/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleButton } from '../../shared/ui/CircleButton';
import { Haptics } from 'react-native-nitro-haptics';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { useStreaksStore } from '../../shared/stores/streaksStore';
import { useTheme } from '../../shared/theme/useTheme';
import { useEntitlements } from '../../shared/hooks/useEntitlements';
import { usePackPreviews } from './usePackPreviews';
import { useCompletionData } from './useCompletionData';
import {
  getCurrentKey,
  getStreakCells,
  STREAK_TYPES,
  STREAK_LABELS,
  isStreakType,
} from '../../shared/lib/streakDate';
import { useAuthStore } from '../../shared/stores/authStore';
import { startupTimer, msSinceLaunch } from '../../shared/lib/startupTimer';
import { mark } from '../../shared/lib/perfLog';
import { track } from '../../shared/lib/telemetry';
import { StreakProgressRow } from './StreakProgressRow';
import { StreakCard, StreakCardSkeleton } from './StreakCard';
import { PackCard, PackCardSkeleton } from './PackCard';
import { PulseProvider } from '../../shared/ui/Pulse';
import type {
  Theme,
  PackCatalogItem,
  RootStackParamList,
  StreakType,
  StreakCardStatus,
} from '../../types';
import { SCREEN_HEADER_HEIGHT } from '../../shared/lib/layout';
import { MoreHorizontal } from 'lucide-react-native';

const HEADER_HEIGHT = SCREEN_HEADER_HEIGHT;

// One-shot guard so the first-render mark fires once for the cold launch, not on
// every re-render. Separates "HomeScreen body evaluated (render)" from the
// existing useEffect "first mount" log — the gap between them is JS-thread
// effect-flush latency (a painted-but-frozen screen), distinct from a late paint.
let loggedFirstRender = false;

// Placeholder library cards rendered before the catalog syncs, so the list has
// a stable, populated-looking shape from first paint.
const SKELETON_PACK_COUNT = 4;
// Streak card thumbnail width as a fraction of the viewport (RN has no vw unit).
const STREAK_CARD_FRACTION = 0.85;
// Horizontal gap between streak cards (matches the carousel's contentContainer gap).
const STREAK_CARD_GAP = 20;
// Left inset of the streak carousel from the screen edge.
const STREAK_ROW_PADDING = 20;

// Star rating per challenge, shown as the streak card's static subtitle.
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
  if (!loggedFirstRender) {
    loggedFirstRender = true;
    mark('STARTUP', 'HomeScreen FIRST RENDER (body eval, pre-paint)');
  }
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const streakCardSize = windowWidth * STREAK_CARD_FRACTION;
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);
  const userId = useAuthStore(s => s.user?.id);
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const hapticsEnabled = useSettingsStore(s => s.settings.haptics);
  const { packCatalog, hasPackAccess } = useEntitlements();

  // Distance between consecutive snap points (one card + the gap after it).
  const streakInterval = streakCardSize + STREAK_CARD_GAP;

  // Carousel scroll offset, mapped natively so the header crossfade tracks the
  // drag on the UI thread without re-rendering on JS (the fast-scroll jank).
  const scrollX = useRef(new Animated.Value(0)).current;

  // Vertical scroll offset of the page, used to fade the header progress row out
  // once the streak carousel it mirrors has scrolled up behind the header — once
  // the cards are gone, the little progress dots have nothing to point at.
  const scrollY = useRef(new Animated.Value(0)).current;
  const onPageScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );
  // Bottom edge of the streak section in content coordinates (measured), so we
  // know the scroll offset at which the carousel finishes hiding behind header.
  const [streakBottom, setStreakBottom] = useState(0);
  const headerBottom = HEADER_HEIGHT + insets.top;
  // As the carousel hides behind the header, crossfade the progress dots out and
  // a "Puzzle Library" title in — the header keeps a label once the dots have
  // nothing to point at.
  const { headerProgressOpacity, headerTitleOpacity } = useMemo(() => {
    if (streakBottom <= 0)
      return { headerProgressOpacity: 1, headerTitleOpacity: 0 };
    // scrollY at which the section's bottom edge meets the header's bottom edge —
    // the moment the carousel is fully tucked away. Fade across the last stretch
    // before that so it dissolves as it goes rather than blinking off.
    const goneAt = streakBottom - headerBottom;
    const fadeStart = Math.max(0, goneAt - 80);
    return {
      headerProgressOpacity: scrollY.interpolate({
        inputRange: [fadeStart, goneAt],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
      headerTitleOpacity: scrollY.interpolate({
        inputRange: [fadeStart, goneAt],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    };
  }, [scrollY, streakBottom, headerBottom]);

  // One opacity per challenge. A row stays fully visible while its card is parked
  // and through most of the swipe (the PLATEAU), then fades to 0 by the midpoint —
  // so neighbours never overlap and a fast flick reads as a dip, not a strobe.
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

  // Fires the haptic when the carousel parks on a new card — no setState, so a
  // fast flick never re-renders mid-scroll. The ref makes it fire once per card.
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
    // app_start: launch → home interactive. First HomeScreen mount per process
    // is always a cold start (a warm resume doesn't remount it).
    track('app_start', { duration_ms: msSinceLaunch(), meta: { cold: true } });
  }, []);

  // Split the catalog in one pass: StreakType packs go to the carousel, the rest
  // are grouped into library sections by `type` (ungrouped '' packs sort last).
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

  // Thumbnail previews per pack; each card fills in as its preview resolves.
  const { packPreviews } = usePackPreviews(packCatalog);

  // Streak status (completed / in-progress today) and per-pack solved counts plus
  // the streak keys for the header progress rows. Updates reactively as the user
  // solves or starts puzzles.
  const {
    completedPuzzleIds,
    startedStreakIds,
    completedPerPack,
    completedStreakKeys,
  } = useCompletionData(packCatalog, userId);

  return (
    <PulseProvider>
      <View style={styles.container}>
        {/* Floating header */}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          {/* Stacked progress rows that crossfade as the carousel scrolls between
              challenges — driven by native scroll offset, no re-renders. */}
          <Pressable
            style={styles.headerProgress}
            hitSlop={8}
            onPress={() => useStreaksStore.getState().openStreaks()}
          >
            <Animated.View style={{ opacity: headerProgressOpacity }}>
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
            </Animated.View>
            {/* Fades in as the progress dots fade out, once the carousel is gone. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.headerTitle, { opacity: headerTitleOpacity }]}
            >
              <Text role="subhead" style={styles.headerTitleText}>
                Puzzle Library
              </Text>
            </Animated.View>
          </Pressable>
          <View style={styles.headerRight}>
            <CircleButton
              ghost
              onPress={() => useSettingsStore.getState().openSettings()}
            >
              <MoreHorizontal size={26} strokeWidth={2} color={theme.text} />
            </CircleButton>
          </View>
        </View>

        <Animated.ScrollView
          onScroll={onPageScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingTop: HEADER_HEIGHT + insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          {/* Horizontal carousel of streak packs (daily, weekly, monthly) */}
          <View
            style={styles.streakSection}
            onLayout={e => {
              const { y, height } = e.nativeEvent.layout;
              setStreakBottom(y + height);
            }}
          >
            <Animated.ScrollView
              style={styles.streakRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={onStreakScroll}
              scrollEventThrottle={16}
              // Snap each card's left edge; interval is the card width plus the
              // gap, both viewport-derived so it stays aligned on every device.
              snapToInterval={streakCardSize + STREAK_CARD_GAP}
              snapToAlignment="start"
              decelerationRate="fast"
              contentContainerStyle={{
                paddingLeft: STREAK_ROW_PADDING,
                // Trailing space so the last card can snap to the start without
                // clamping early: viewport − card − left inset.
                paddingRight: Math.max(
                  STREAK_ROW_PADDING,
                  windowWidth - streakCardSize - STREAK_ROW_PADDING,
                ),
                gap: STREAK_CARD_GAP,
              }}
            >
              {streakPacks.length === 0
                ? STREAK_TYPES.map(type => (
                    <StreakCardSkeleton
                      key={type}
                      size={streakCardSize}
                      theme={theme}
                    />
                  ))
                : streakPacks.map(pack => {
                    // streakPacks only holds StreakType packs (see categorization),
                    // so the guard always passes here — it just narrows the type.
                    if (!isStreakType(pack.type)) return null;
                    const type = pack.type;
                    const preview = packPreviews[pack.id];
                    if (!preview)
                      return (
                        <StreakCardSkeleton
                          key={pack.id}
                          size={streakCardSize}
                          theme={theme}
                        />
                      );

                    const puzzleId = `${pack.id}:${getCurrentKey(type)}`;
                    const status: StreakCardStatus = completedPuzzleIds.has(
                      puzzleId,
                    )
                      ? 'complete'
                      : startedStreakIds.has(puzzleId)
                      ? 'in-progress'
                      : 'not-started';

                    return (
                      <StreakCard
                        key={pack.id}
                        label={STREAK_LABELS[type]}
                        starCount={STREAK_STAR_COUNT[type]}
                        status={status}
                        preview={preview}
                        size={streakCardSize}
                        theme={theme}
                        coloredRegions={coloredRegions}
                        onPress={() =>
                          navigation.navigate('Puzzle', { packId: pack.id })
                        }
                      />
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
                  <Text role="subhead" style={styles.sectionLabel}>
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
                      meta={`${pack.stars}-star`}
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
        </Animated.ScrollView>
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
    },
    // Reserves header space for the absolutely-positioned progress rows.
    // Height = one circle; width covers the widest row (daily, 7 cells).
    headerProgress: {
      height: 22,
      width: 156,
      overflow: 'visible',
    },
    // Crossfading layers stack at the same spot, anchored to the container's top.
    headerProgressLayer: {
      position: 'absolute',
      left: 0,
    },
    // "Puzzle Library" title that replaces the progress dots once they fade out.
    // Absolute + left-anchored so it shares the slot without wrapping (the
    // reserved 156px box has overflow visible, so a wider title still shows).
    headerTitle: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    headerTitleText: {
      color: theme.text,
      fontWeight: '600',
    },
    headerRight: {
      flexDirection: 'row',
      gap: 12,
      marginRight: -7,
    },
    streakSection: {
      backgroundColor: theme.background,
    },
    packSection: {
      backgroundColor: theme.background,
      paddingHorizontal: 20,
    },
    streakRow: {
      flexDirection: 'row',
      gap: 12,
      zIndex: 100,
      overflow: 'visible',
      marginTop: 34,
      marginBottom: 34,
    },
    // Section header for each Puzzle Library bundle (Intro, 1-Star, …).
    sectionLabel: {
      color: theme.text,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 8,
      marginTop: 12,
      marginBottom: 24,
      // textTransform: 'uppercase',
      fontWeight: '500',
      // fontSize: 14,
      // lineHeight: 19,
    },
  });
};
