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
  Alert,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Text } from '../../shared/ui/Text';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ChevronLeft from 'lucide-react-native/dist/cjs/icons/chevron-left';
import MoreHorizontal from 'lucide-react-native/dist/cjs/icons/ellipsis';
import Check from 'lucide-react-native/dist/cjs/icons/check';
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
import { packDisplayName } from '../../shared/lib/localizedPack';
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
      style={[styles.cell, { width: cellSize }, locked && styles.lockedCell]}
      onPress={() => (locked ? onLockedPress(index) : onPress(index))}
    >
      <View style={{ width: cellSize, height: cellSize }}>
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
      </View>
      <View style={styles.labelRow}>
        {isCompleted && (
          <Check
            size={9}
            strokeWidth={4}
            color={theme.text}
            style={{ marginLeft: -3 }}
          />
        )}
        <Text
          style={[
            styles.cellLabel,
            isCompleted && styles.cellNumberCompleted,
            locked && styles.cellNumberLocked,
          ]}
          role="caption1"
          numberOfLines={1}
        >
          Puzzle {index + 1}
        </Text>
      </View>
    </Pressable>
  );
});

export function LibraryScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Library'>) {
  const { packId } = route.params;
  const { t } = useTranslation();
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
  const packName = catalogPack ? packDisplayName(catalogPack) : packId;
  const isFree = catalogPack?.isFree ?? true;
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

  const handleLockedPress = useCallback(() => {
    if (!isFree && !hasPackAccess(packId)) {
      if (storagePath !== undefined) {
        setPaywallContext({
          type: 'paid-pack',
          packId,
          packName,
          storagePath,
        });
      } else {
        setPaywallContext({ type: 'unavailable', packId, packName });
      }
      return;
    }
    // Sequential lock on a free pack: a native alert mirroring the premium
    // prompt in ArchivePackScreen. "Unlock All" routes to settings, where the
    // premium purchase lives.
    Alert.alert(t('paywall.lockedTitle'), t('paywall.lockedBody'), [
      { text: t('streaks.notNow'), style: 'cancel' },
      {
        text: t('paywall.unlockAll'),
        onPress: () => useSettingsStore.getState().openSettings(),
      },
    ]);
  }, [isFree, hasPackAccess, packId, storagePath, packName, t]);

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
        <Text role="title3" style={styles.headerTitle}>
          {packName}
        </Text>
        <CircleButton
          ghost
          onPress={() => useSettingsStore.getState().openSettings()}
        >
          <MoreHorizontal size={26} strokeWidth={2} color={theme.text} />
        </CircleButton>
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
        <View
          style={[
            styles.tabs,
            {
              bottom:
                Platform.OS === 'android' ? insets.bottom : insets.bottom - 12,
            },
          ]}
        >
          {sections.map(s => (
            <Pressable
              key={s}
              onPress={() => listRef.current?.scrollToIndex({ index: s })}
              style={[styles.tab, s === activeSection && styles.tabActive]}
            >
              <Text
                role="footnote"
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
    page: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignContent: 'center',
      rowGap: GAP,
      columnGap: GAP,
      paddingHorizontal: PADDING,
      paddingTop: SCREEN_HEADER_HEIGHT + insets.top,
      paddingBottom: insets.top + SCREEN_HEADER_HEIGHT,
    },
    tabs: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 0,
      height: 80,
    },
    tab: {
      width: 26,
      height: 26,
      borderRadius: 100,

      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    tabActive: {
      backgroundColor: theme.text,
      fontWeight: '600',
    },
    tabText: {
      color: theme.textSecondary,

      fontWeight: '600',
    },
    tabTextActive: {
      color: theme.background,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '600',
    },
    cell: {
      position: 'relative',
      alignItems: 'center',
    },
    lockedCell: {
      opacity: 0.33,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      marginTop: 5,
    },
    cellLabel: {
      color: theme.text,
      fontWeight: '600',
      textAlign: 'left',
    },
    cellNumberCompleted: {
      color: theme.text,
    },
    cellNumberLocked: {
      color: theme.textSecondary,
    },
    cornerBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cornerBadgeLocked: {
      backgroundColor: theme.surface,
    },
  });
