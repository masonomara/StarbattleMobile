import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Text } from '../../shared/ui/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleButton } from '../../shared/ui/CircleButton';
import { Haptics } from 'react-native-nitro-haptics';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { useTheme } from '../../shared/theme/useTheme';
import { useEntitlements } from '../../shared/hooks/useEntitlements';
import { useScrollBorder } from '../../shared/hooks/useScrollBorder';
import { useStreakRows } from '../../shared/hooks/useStreakRows';
import { usePackPreviews } from './usePackPreviews';
import { useCompletionData } from './useCompletionData';
import { useTranslation } from 'react-i18next';
import {
  getCurrentKey,
  getActiveStreak,
  capitalize,
  STREAK_TYPES,
  STREAK_UNIT_KEY,
  isStreakType,
} from '../../shared/lib/streakDate';
import { packDisplayName, packTypeLabel } from '../../shared/lib/localizedPack';
import { useAuthStore } from '../../shared/stores/authStore';
import { startupTimer } from '../../shared/lib/startupTimer';
import { mark } from '../../shared/lib/perfLog';
import { track } from '../../shared/lib/telemetry';
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
import MoreHorizontal from 'lucide-react-native/dist/cjs/icons/ellipsis';
import ChevronRight from 'lucide-react-native/dist/cjs/icons/chevron-right';

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
const STREAK_CARD_FRACTION = 0.75;
// Horizontal gap between streak cards (matches the carousel's contentContainer gap).
const STREAK_CARD_GAP = 12;
// Left inset of the streak carousel from the screen edge. Matches the screen's
// 20px horizontal margin (header + packSection paddingHorizontal) so the first
// card's edge lines up with the library cards below.
const STREAK_ROW_PADDING = 20;
// Card chrome around the thumbnail — must match StreakCard's own `padding` and
// `borderWidth`. The carousel snaps/measures on the card's outer edge, so its
// footprint is the thumbnail plus this chrome on each side.
const STREAK_CARD_PADDING = 18;
const STREAK_CARD_BORDER = 1;
const STREAK_CARD_CHROME = 2 * (STREAK_CARD_PADDING + STREAK_CARD_BORDER);

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
  const { t } = useTranslation();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  // Thumbnail width (what PuzzleThumbnail renders) vs. the card's outer width
  // (thumbnail + padding + border). Snapping and the trailing inset key off the
  // outer width so a card's edge lands flush at the row's left padding.
  const streakCardSize = windowWidth * STREAK_CARD_FRACTION;
  const streakCardWidth = streakCardSize + STREAK_CARD_CHROME;
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);
  const userId = useAuthStore(s => s.user?.id);
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const hapticsEnabled = useSettingsStore(s => s.settings.haptics);
  const { packCatalog, hasPackAccess } = useEntitlements();

  // Distance between consecutive snap points (one card + the gap after it).
  const streakInterval = streakCardWidth + STREAK_CARD_GAP;

  // Vertical scroll offset of the page. Native-driven for the header hairline
  // (via useScrollBorder); a JS listener also tracks the offset so the header
  // title can name whichever section sits at the top of the scroll.
  const scrollY = useRef(new Animated.Value(0)).current;
  const { scrolled, onScroll: onScrollBorder } = useScrollBorder();
  const headerBottom = HEADER_HEIGHT + insets.top;

  // Current user's streaks, for the header title while the carousel is on top.
  const { streaks } = useStreakRows(userId);

  // Header title for a streak card: the live streak ("7-day streak") once one is
  // running, otherwise the challenge name. Used for the initial title and for
  // the cached lookup the scroll handler reads.
  const streakLabelFor = (type: StreakType) => {
    const s = streaks.find(x => x.type === type);
    const count = s ? getActiveStreak(s, type) : 0;
    return count > 0
      ? t(`home.streak${capitalize(STREAK_UNIT_KEY[type])}`, { count })
      : t(`library.challenge${capitalize(type)}`);
  };

  // The header title plus whether it's a challenge (shows a chevron and opens the
  // archive). Recomputed from scroll position, but re-rendered only when the
  // resolved section actually changes — a fast flick never strobes the title.
  const [headerSection, setHeaderSection] = useState(() => ({
    label: streakLabelFor('daily'),
    isChallenge: true,
  }));

  // Scroll/measurement state kept in refs so the scroll handler stays stable and
  // never re-renders per frame. `scrollYRef` mirrors the native offset; the
  // section refs hold each named library section's top in content coordinates
  // (packSection's own offset plus the section's offset within it).
  const scrollYRef = useRef(0);
  const activeStreakIndexRef = useRef(0);
  const streakLabelsRef = useRef<Partial<Record<StreakType, string>> | null>(
    null,
  );
  // Seed on first render so a layout-triggered recompute (which can land before
  // the streaks effect below) never reads an empty map and blanks the title.
  if (streakLabelsRef.current === null) {
    const init: Partial<Record<StreakType, string>> = {};
    for (const type of STREAK_TYPES) init[type] = streakLabelFor(type);
    streakLabelsRef.current = init;
  }
  const packSectionYRef = useRef(0);
  const sectionLocalRef = useRef(new Map<string, number>());
  const sectionTopsRef = useRef<{ label: string; top: number }[]>([]);
  // Maps a bundle's canonical (English) `type` to its localized display label,
  // so the scrolling header title can name each library section in the active
  // language. Kept in a ref because rebuildSectionTops (below) reads it from the
  // layout callbacks; it's refreshed during render once librarySections is built.
  const bundleLabelsRef = useRef<Map<string, string>>(new Map());

  // Resolves the title from the current scroll offset: a streak label while the
  // carousel is on top, then each library section's name as it reaches the
  // header. setState only fires on a real change (the equality guard below).
  const recomputeHeader = useCallback(() => {
    const fold = scrollYRef.current + headerBottom;
    const tops = sectionTopsRef.current;
    let next: { label: string; isChallenge: boolean };
    if (tops.length === 0 || fold < tops[0].top) {
      const type = STREAK_TYPES[activeStreakIndexRef.current];
      next = {
        label: streakLabelsRef.current?.[type] ?? '',
        isChallenge: true,
      };
    } else {
      let label = tops[0].label;
      for (const s of tops) {
        if (s.top <= fold + 1) label = s.label;
        else break;
      }
      next = { label, isChallenge: false };
    }
    setHeaderSection(prev =>
      prev.label === next.label && prev.isChallenge === next.isChallenge
        ? prev
        : next,
    );
  }, [headerBottom]);

  // Rebuilds the sorted section-top list from the latest layout measurements.
  const rebuildSectionTops = useCallback(() => {
    const base = packSectionYRef.current;
    const tops: { label: string; top: number }[] = [];
    sectionLocalRef.current.forEach((localY, bundle) => {
      if (bundle)
        tops.push({
          label: bundleLabelsRef.current.get(bundle) ?? bundle,
          top: base + localY,
        });
    });
    tops.sort((a, b) => a.top - b.top);
    sectionTopsRef.current = tops;
    recomputeHeader();
  }, [recomputeHeader]);

  // Refresh the cached streak labels as streaks sync, then refresh the title.
  useEffect(() => {
    const labels: Partial<Record<StreakType, string>> = {};
    for (const type of STREAK_TYPES) labels[type] = streakLabelFor(type);
    streakLabelsRef.current = labels;
    recomputeHeader();
    // streakLabelFor closes over streaks + t.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaks, t, recomputeHeader]);

  const onPageScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          onScrollBorder(e);
          scrollYRef.current = e.nativeEvent.contentOffset.y;
          recomputeHeader();
        },
      }),
    [scrollY, onScrollBorder, recomputeHeader],
  );

  // Updates the centred streak card (for the title and a light haptic) as the
  // carousel parks on a new one. Ref-guarded so it fires once per card.
  const handleStreakScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / streakInterval);
    if (
      index !== activeStreakIndexRef.current &&
      index >= 0 &&
      index < STREAK_TYPES.length
    ) {
      activeStreakIndexRef.current = index;
      if (hapticsEnabled) Haptics.impact('light');
      recomputeHeader();
    }
  };

  useEffect(() => {
    // app_start moved to navigation.tsx (bootsplash-hidden) so it measures
    // launch → first paint regardless of whether the first route is Home or the
    // Tutorial. This mount log stays for warm-start / dev tracing only.
    startupTimer.log('HomeScreen first mount');
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
      // `bundle` (English `type`) stays the grouping/sort/measurement key;
      // `label` is its localized display string for the section header.
      .map(([bundle, packs]) => ({
        bundle,
        label: packTypeLabel(packs[0]),
        packs,
      }))
      .sort((a, b) => bundleSortKey(a.bundle) - bundleSortKey(b.bundle));
    return { streakPacks: streak, librarySections: sections };
  }, [packCatalog]);

  // Refresh the bundle -> localized-label lookup the scrolling header reads.
  bundleLabelsRef.current = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of librarySections) m.set(s.bundle, s.label);
    return m;
  }, [librarySections]);

  // Thumbnail previews per pack; each card fills in as its preview resolves.
  const { packPreviews } = usePackPreviews(packCatalog);

  // Streak status (completed / in-progress today) and per-pack solved counts.
  // Updates reactively as the user solves or starts puzzles.
  const { completedPuzzleIds, startedStreakIds, completedPerPack } =
    useCompletionData(packCatalog, userId);

  return (
    <PulseProvider>
      <View testID="home-root" style={styles.container}>
        {/* Floating header */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top },
            scrolled && styles.headerBorder,
          ]}
        >
          {/* Title names the section at the top of the scroll; a challenge gets
              a chevron and opens its archive. */}
          <Pressable
            testID="streak-archive-link"
            style={styles.headerTitleRow}
            hitSlop={8}
            disabled={!headerSection.isChallenge}
            onPress={() =>
              navigation.navigate('ArchivePack', {
                type: STREAK_TYPES[activeStreakIndexRef.current],
              })
            }
          >
            <Text
              role="title3"
              style={styles.headerTitleText}
              numberOfLines={1}
            >
              {headerSection.label}
            </Text>
            {headerSection.isChallenge && (
              <ChevronRight
                size={20}
                strokeWidth={2.5}
                color={theme.text}
                style={styles.headerChevron}
              />
            )}
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
          <View style={styles.streakSection}>
            <Animated.ScrollView
              style={styles.streakRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={handleStreakScroll}
              scrollEventThrottle={16}
              // Snap each card's left edge; interval is the card width plus the
              // gap, both viewport-derived so it stays aligned on every device.
              snapToInterval={streakInterval}
              snapToAlignment="start"
              decelerationRate="fast"
              contentContainerStyle={{
                paddingLeft: STREAK_ROW_PADDING,
                // Trailing space so the last card can snap to the start without
                // clamping early: viewport − card − left inset.
                paddingRight: Math.max(
                  STREAK_ROW_PADDING,
                  windowWidth - streakCardWidth - STREAK_ROW_PADDING,
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
                        testID={`streak-card-${type}`}
                        label={t(`library.challenge${capitalize(type)}`)}
                        starCount={STREAK_STAR_COUNT[type]}
                        status={status}
                        preview={preview}
                        size={streakCardSize}
                        theme={theme}
                        coloredRegions={coloredRegions}
                        onPress={() => {
                          track('streak_play', { meta: { type } });
                          navigation.navigate('Puzzle', { packId: pack.id });
                        }}
                      />
                    );
                  })}
            </Animated.ScrollView>
          </View>

          {/* Puzzle library: packs grouped into sections by bundle (`type`).
              Each section's top is measured (offset within packSection, added to
              packSection's own offset) so the header can name the one on top. */}
          <View
            style={styles.packSection}
            onLayout={e => {
              packSectionYRef.current = e.nativeEvent.layout.y;
              rebuildSectionTops();
            }}
          >
            {packCatalog.length === 0 &&
              Array.from({ length: SKELETON_PACK_COUNT }, (_, i) => (
                <PackCardSkeleton key={`pack-skeleton-${i}`} theme={theme} />
              ))}

            {librarySections.map(section => (
              <View
                key={section.bundle || 'ungrouped'}
                onLayout={e => {
                  sectionLocalRef.current.set(
                    section.bundle,
                    e.nativeEvent.layout.y,
                  );
                  rebuildSectionTops();
                }}
              >
                {section.bundle ? (
                  <Text role="title3" style={styles.sectionLabel}>
                    {section.label}
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
                      testID={`pack-card-${pack.id}`}
                      name={packDisplayName(pack)}
                      meta={t('home.packStar', { count: pack.stars })}
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
      borderBottomWidth: 1,
      borderBottomColor: theme.background,
    },
    // Bottom hairline shown once the page scrolls, detaching the header from
    // the content beneath it.
    headerBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    // Title for the section currently on top, with a chevron when it's a
    // challenge. Shrinks (and the text truncates) so a long bundle name never
    // collides with the settings button.
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 1,
    },
    headerTitleText: {
      color: theme.text,
      flexShrink: 1,
    },
    // Nudge the chevron onto the text baseline.
    headerChevron: {
      marginTop: 2,
    },
    headerRight: {
      flexDirection: 'row',
      gap: 12,
      marginRight: -4,
    },
    streakSection: {
      backgroundColor: theme.background,
      marginBottom: 20,
    },
    packSection: {
      backgroundColor: theme.background,
      paddingHorizontal: 20,
    },
    streakRow: {
      flexDirection: 'row',
      zIndex: 100,
      overflow: 'visible',
      marginTop: 8,
    },
    // Section header for each Puzzle Library bundle (Intro, 1-Star, …).
    sectionLabel: {
      color: theme.text,
      marginTop: 10,
      marginBottom: 14,
    },
  });
};
