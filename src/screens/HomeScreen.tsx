import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  TextStyle,
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
import { useProductPrice } from '../hooks/useProductPrice';
import type {
  Theme,
  PackCatalogItem,
  Puzzle,
  RootStackParamList,
  StreakType,
} from '../types';
import { SCREEN_HEADER_HEIGHT } from '../layout';

const HEADER_HEIGHT = SCREEN_HEADER_HEIGHT;

// Placeholder library cards rendered before the catalog syncs, so the list has
// a stable, populated-looking shape from first paint.
const SKELETON_PACK_COUNT = 4;
// Streak card thumbnail width as a fraction of the viewport (RN has no vw unit).
const STREAK_CARD_FRACTION = 0.6;
// Horizontal gap between streak cards (matches the carousel's contentContainer gap).
const STREAK_CARD_GAP = 20;
// Left inset of the streak carousel from the screen edge.
const STREAK_ROW_PADDING = 20;

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
  // Drop the whole row in once the preview is ready; until then show the full
  // skeleton (the price hook above still runs, so it's warm when the card lands).
  if (!preview) return <PackCardSkeleton theme={theme} />;
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
                        <Text style={styles.streakLabel}>
                          {`${STREAK_LABELS[type]} Special`}
                        </Text>
                        <Text style={styles.streakMeta}>
                          {`${STREAK_STAR_COUNT[type]} star puzzle`}
                        </Text>
                        <StreakProgressRow
                          cells={getStreakCells(type)}
                          completedKeys={completedStreakKeys[type]}
                          theme={theme}
                        />
                      </Pressable>
                    );
                  })}
            </ScrollView>
          </View>

          {/* Puzzle library: free packs, then purchasable packs */}
          <View style={styles.packSection}>
            <Text style={styles.sectionLabel}>Puzzle Library</Text>

            {packCatalog.length === 0 &&
              Array.from({ length: SKELETON_PACK_COUNT }, (_, i) => (
                <PackCardSkeleton key={`pack-skeleton-${i}`} theme={theme} />
              ))}

            {freePacks.map(pack =>
              packPreviews[pack.id] ? (
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
              ) : (
                <PackCardSkeleton key={pack.id} theme={theme} />
              ),
            )}

            {paidPacks.map(pack => {
              const completed = completedPerPack[pack.id] ?? 0;

              // Purchased packs render identically to free packs.
              if (hasPackAccess(pack.id)) {
                return packPreviews[pack.id] ? (
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
                ) : (
                  <PackCardSkeleton key={pack.id} theme={theme} />
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
      letterSpacing: -0.25,
      lineHeight: 28,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      color: theme.text,
    },
    headerRight: {
      flexDirection: 'row',
      gap: 12,
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
      lineHeight: 30,
      fontSize: 24,
      fontWeight: '600',
      letterSpacing: -0.33,
      textTransform: 'capitalize',
      marginTop: 6,
    },
    streakMeta: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
    },
    sectionLabel: {
      lineHeight: 28,
      marginBottom: 16,
      fontSize: 25,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -0.25,
    },
    packPrice: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
    },
  });
};
