import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../shared/ui/Text';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ChevronLeft from 'lucide-react-native/dist/cjs/icons/chevron-left';
import { CircleButton } from '../../shared/ui/CircleButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPuzzlesForPack } from '../../packs';
import { PaywallModal } from '../../shared/ui/PaywallModal';
import { PuzzleThumbnail } from './PuzzleThumbnail';
import { useTheme } from '../../shared/theme/useTheme';
import { useEntitlements } from '../../shared/hooks/useEntitlements';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { getCompletedPuzzleIdsForPack } from '../../shared/lib/progress';
import { parsePuzzle } from '../../shared/lib/parsePuzzle';
import type {
  Theme,
  RawPuzzle,
  RootStackParamList,
  PaywallContext,
} from '../../types';
import { SCREEN_HEADER_HEIGHT } from '../../shared/lib/layout';

const NUM_COLS = 5;
const PADDING = 20;
const GAP = 12;
const PAGE_SIZE = 30;

type PuzzleCellProps = {
  packId: string;
  index: number;
  rawPuzzle: RawPuzzle | null;
  onPress: (index: number) => void;
  onLockedPress: (index: number) => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  isCompleted: boolean;
  canPlay: boolean;
  coloredRegions: boolean;
  cellSize: number;
};

const PuzzleCell = React.memo(function PuzzleCell({
  packId,
  index,
  rawPuzzle,
  onPress,
  onLockedPress,
  styles,
  theme,
  isCompleted,
  canPlay,
  coloredRegions,
  cellSize,
}: PuzzleCellProps) {
  const puzzle = useMemo(
    () => (rawPuzzle ? parsePuzzle(rawPuzzle, `${packId}:${index}`) : null),
    [rawPuzzle, packId, index],
  );

  const locked = !isCompleted && !canPlay;

  return (
    <Pressable
      style={[{ width: cellSize }, locked && styles.lockedCell]}
      onPress={() => (locked ? onLockedPress(index) : onPress(index))}
    >
      {puzzle && (
        <PuzzleThumbnail
          puzzle={puzzle}
          size={cellSize}
          theme={theme}
          coloredRegions={coloredRegions}
          regionBorderTarget={2.1}
          regionBorderCapFrac={0.15}
          regionBorderMin={0.9}
          gridLineTarget={0.7}
          gridLineCapFrac={0.05}
          gridLineMin={0.3}
        />
      )}
    </Pressable>
  );
});

export function LibraryScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Library'>) {
  const { packId } = route.params;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cellSize = Math.floor(
    (width - 2 * PADDING - (NUM_COLS - 1) * GAP) / NUM_COLS,
  );
  const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const { packCatalog, canPlayPuzzle, hasPackAccess } = useEntitlements();

  const catalogPack = packCatalog.find(p => p.id === packId);
  const puzzleCount = catalogPack?.puzzleCount ?? 0;
  const packName = catalogPack?.name ?? packId;
  const isFree = catalogPack?.isFree ?? true;
  const priceUsd = catalogPack?.priceUsd;
  const storagePath = catalogPack?.storagePath;

  const [rawPuzzles, setRawPuzzles] = useState<RawPuzzle[] | null>(null);
  const listRef = useRef<FlatList<number>>(null);
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    getPuzzlesForPack(packId, storagePath)
      .then(setRawPuzzles)
      .catch(() => {});
  }, [packId, storagePath]);

  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const completedCount = completedSet.size;
  const [paywallContext, setPaywallContext] = useState<PaywallContext | null>(
    null,
  );

  const refreshCompleted = useCallback(() => {
    if (!puzzleCount) return;
    getCompletedPuzzleIdsForPack(packId, puzzleCount).then(setCompletedSet);
  }, [packId, puzzleCount]);

  useFocusEffect(
    useCallback(() => {
      refreshCompleted();
    }, [refreshCompleted]),
  );

  // NOTE: isPuzzlePlayable falls back to sequential-unlock logic when
  // catalogPack is undefined (pack not yet synced). This means a user on a
  // slow connection sees the puzzle as locked until catalog sync completes,
  // which is the safe-fail direction. The fallback mirrors the non-premium
  // free-play rule; premium bypass only applies once the catalog is available.
  const isPuzzlePlayable = useCallback(
    (index: number): boolean => {
      if (!catalogPack) {
        return index === 0 || completedSet.has(`${packId}:${index - 1}`);
      }
      return canPlayPuzzle(packId, index, completedCount);
    },
    [catalogPack, completedSet, packId, canPlayPuzzle, completedCount],
  );

  const handlePress = useCallback(
    (index: number) =>
      navigation.navigate('Puzzle', { packId, puzzleIndex: index }),
    [navigation, packId],
  );

  const handleLockedPress = useCallback(
    (index: number) => {
      if (!isFree && !hasPackAccess(packId)) {
        if (storagePath !== undefined) {
          setPaywallContext({
            type: 'paid-pack',
            packId,
            packName,
            priceUsd,
            storagePath,
          });
        } else {
          setPaywallContext({ type: 'unavailable', packId, packName });
        }
      } else {
        setPaywallContext({ type: 'sequential', packId, puzzleIndex: index });
      }
    },
    [isFree, hasPackAccess, packId, priceUsd, storagePath, packName],
  );

  const sections = useMemo(
    () =>
      Array.from({ length: Math.ceil(puzzleCount / PAGE_SIZE) }, (_, i) => i),
    [puzzleCount],
  );

  const renderSection = useCallback(
    ({ item: section }: { item: number }) => {
      const start = section * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, puzzleCount);
      return (
        <View style={[styles.page, { width }]}>
          {Array.from({ length: end - start }, (_, j) => {
            const index = start + j;
            return (
              <PuzzleCell
                key={index}
                packId={packId}
                index={index}
                rawPuzzle={rawPuzzles?.[index] ?? null}
                onPress={handlePress}
                onLockedPress={handleLockedPress}
                styles={styles}
                theme={theme}
                isCompleted={completedSet.has(`${packId}:${index}`)}
                canPlay={isPuzzlePlayable(index)}
                coloredRegions={coloredRegions}
                cellSize={cellSize}
              />
            );
          })}
        </View>
      );
    },
    [
      packId,
      puzzleCount,
      width,
      rawPuzzles,
      handlePress,
      handleLockedPress,
      styles,
      theme,
      completedSet,
      isPuzzlePlayable,
      coloredRegions,
      cellSize,
    ],
  );

  if (!puzzleCount)
    return (
      <View style={styles.container}>
        <ActivityIndicator style={StyleSheet.absoluteFill} />
      </View>
    );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <CircleButton ghost onPress={() => navigation.goBack()}>
          <ChevronLeft size={26} strokeWidth={2} color={theme.text} />
        </CircleButton>
        <Text role="headline" style={styles.headerTitle}>
          {packName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <FlatList
        ref={listRef}
        data={sections}
        keyExtractor={String}
        renderItem={renderSection}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onMomentumScrollEnd={e =>
          setActiveSection(Math.round(e.nativeEvent.contentOffset.x / width))
        }
      />
      {sections.length > 1 && (
        <View style={[styles.tabs, { bottom: insets.bottom + 16 }]}>
          {sections.map(s => (
            <Pressable
              key={s}
              onPress={() => listRef.current?.scrollToIndex({ index: s })}
              style={[styles.tab, s === activeSection && styles.tabActive]}
            >
              <Text
                role="subhead"
                style={
                  s === activeSection ? styles.tabTextActive : styles.tabText
                }
              >
                {s + 1}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <PaywallModal
        context={paywallContext}
        onClose={() => setPaywallContext(null)}
        onPurchaseSuccess={() => {
          setPaywallContext(null);
          refreshCompleted();
        }}
      />
    </View>
  );
}

const createStyles = (theme: Theme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
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
      height: SCREEN_HEADER_HEIGHT + insets.top,
      backgroundColor: theme.background,
    },
    headerTitle: {
      color: theme.text,
    },
    headerSpacer: {
      width: 44,
    },
    page: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignContent: 'flex-start',
      rowGap: GAP,
      columnGap: GAP,
      paddingHorizontal: PADDING,
      paddingTop: SCREEN_HEADER_HEIGHT + insets.top + 24,
      paddingBottom: insets.bottom + 60,
    },
    tabs: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
    },
    tab: {
      minWidth: 32,
      height: 32,
      borderRadius: 100,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    tabActive: {
      backgroundColor: theme.text,
    },
    tabText: {
      color: theme.textSecondary,
    },
    tabTextActive: {
      color: theme.background,
    },
    lockedCell: {
      opacity: 0.4,
    },
  });
