import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../components/Text';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import ChevronLeft from 'lucide-react-native/dist/cjs/icons/chevron-left';
import Lock from 'lucide-react-native/dist/cjs/icons/lock';
import { CircleButton } from '../components/CircleButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPuzzlesForPack } from '../packs';
import { PaywallModal } from '../components/PaywallModal';
import { PuzzleThumbnail } from '../components/PuzzleThumbnail';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { useSettingsStore } from '../stores/settingsStore';
import { getCompletedPuzzleIdsForPack } from '../utils/progress';
import { parsePuzzle } from '../utils/parsePuzzle';
import type {
  Theme,
  RawPuzzle,
  RootStackParamList,
  PaywallContext,
} from '../types';

const NUM_COLS = 3;

type PuzzleCellProps = {
  packId: string;
  index: number;
  rawPuzzle: RawPuzzle | null;
  onPress: (index: number) => void;
  onLockedPress: (index: number) => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  completedSet: Set<string>;
  canPlay: boolean;
  coloredRegions: boolean;
  cellSize: number;
};

function PuzzleCell({
  packId,
  index,
  rawPuzzle,
  onPress,
  onLockedPress,
  styles,
  theme,
  completedSet,
  canPlay,
  coloredRegions,
  cellSize,
}: PuzzleCellProps) {
  const puzzleId = `${packId}:${index}`;
  const isCompleted = completedSet.has(puzzleId);
  const puzzle = useMemo(
    () => (rawPuzzle ? parsePuzzle(rawPuzzle, puzzleId) : null),
    [rawPuzzle, puzzleId],
  );

  const status: 'completed' | 'active' | 'locked' = isCompleted
    ? 'completed'
    : canPlay
    ? 'active'
    : 'locked';

  return (
    <Pressable
      style={[styles.puzzleCell, status === 'locked' && styles.locked]}
      onPress={() =>
        status === 'locked' ? onLockedPress(index) : onPress(index)
      }
    >
      {puzzle && (
        <PuzzleThumbnail
          puzzle={puzzle}
          size={cellSize}
          theme={theme}
          coloredRegions={coloredRegions}
        />
      )}
      <View style={styles.puzzleCellOverlay}>
        {status !== 'active' && (
          <View style={styles.puzzleIcon}>
            {status === 'completed' ? (
              <Check size={28} color={theme.blue} />
            ) : (
              <Lock size={28} color={theme.textSecondary} />
            )}
          </View>
        )}
      </View>
      <View>
        <Text
          style={[
            styles.puzzleNumber,
            status === 'completed'
              ? styles.puzzleNumberCompleted
              : status === 'locked'
              ? styles.puzzleNumberLocked
              : styles.puzzleNumberActive,
          ]}
        >
          {index + 1}
        </Text>
      </View>
    </Pressable>
  );
}

export function LibraryScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Library'>) {
  const { packId } = route.params;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numColumns = NUM_COLS;
  const cellSize = Math.floor((width - 2 * 32 - numColumns * 12) / numColumns);
  const styles = useMemo(
    () => createStyles(theme, cellSize, insets),
    [theme, cellSize, insets],
  );
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const { packCatalog, canPlayPuzzle, hasPackAccess } = useEntitlements();

  const catalogPack = packCatalog.find(p => p.id === packId);
  const puzzleCount = catalogPack?.puzzleCount ?? 0;
  const packName = catalogPack?.name ?? packId;
  const isFree = catalogPack?.isFree ?? true;
  const priceUsd = catalogPack?.priceUsd;
  const storagePath = catalogPack?.storagePath;

  const [scrolled, setScrolled] = useState(false);
  const [rawPuzzles, setRawPuzzles] = useState<RawPuzzle[] | null>(null);

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

  const isPuzzlePlayable = useCallback(
    (index: number): boolean => {
      if (!catalogPack) {
        return index === 0 || completedSet.has(`${packId}:${index - 1}`);
      }
      return canPlayPuzzle(packId, index, completedCount);
    },
    [catalogPack, completedSet, packId, canPlayPuzzle, completedCount],
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

  const rows = useMemo(() => {
    const result: number[][] = [];
    for (let i = 0; i < puzzleCount; i += numColumns) {
      result.push(
        Array.from(
          { length: Math.min(numColumns, puzzleCount - i) },
          (_, j) => i + j,
        ),
      );
    }
    return result;
  }, [puzzleCount, numColumns]);

  const renderRow = useCallback(
    ({ item: rowIndices }: { item: number[] }) => (
      <View style={styles.row}>
        {rowIndices.map(index => (
          <PuzzleCell
            key={index}
            packId={packId}
            index={index}
            rawPuzzle={rawPuzzles?.[index] ?? null}
            onPress={i =>
              navigation.navigate('Puzzle', { packId, puzzleIndex: i })
            }
            onLockedPress={handleLockedPress}
            styles={styles}
            theme={theme}
            completedSet={completedSet}
            canPlay={isPuzzlePlayable(index)}
            coloredRegions={coloredRegions}
            cellSize={cellSize}
          />
        ))}
      </View>
    ),
    [
      packId,
      rawPuzzles,
      handleLockedPress,
      styles,
      theme,
      completedSet,
      isPuzzlePlayable,
      coloredRegions,
      cellSize,
      navigation,
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
      <View
        style={[
          styles.header,
          { paddingTop: insets.top },
          scrolled && styles.headerBorder,
        ]}
      >
        <CircleButton ghost onPress={() => navigation.goBack()}>
          <ChevronLeft size={26} strokeWidth={2} color={theme.text} />
        </CircleButton>
        <Text style={styles.headerTitle}>{packName}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={item => String(item[0])}
        renderItem={renderRow}
        style={styles.scroll}
        onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 0)}
        scrollEventThrottle={16}
        contentContainerStyle={styles.gridContent}
      />
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

const createStyles = (
  theme: Theme,
  cellSize: number,
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
      height: 57 + insets.top,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.background,
    },
    headerBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerSpacer: {
      width: 44,
    },
    scroll: { flex: 1 },
    gridContent: {
      paddingHorizontal: 32,
      paddingTop: 57 + insets.top + 24,
      paddingBottom: insets.bottom,
      rowGap: 12,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    puzzleCell: {
      height: cellSize,
      width: cellSize,
      margin: 8,

      backgroundColor: theme.textSecondary,
    },
    puzzleCellOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    puzzleIcon: {
      position: 'absolute',
      opacity: 0.6,
    },
    puzzleNumber: {
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 22,
    },
    puzzleNumberCompleted: { color: theme.blue },
    puzzleNumberActive: {
      color: theme.text,
    },
    puzzleNumberLocked: {
      color: theme.textSecondary,
    },
    locked: { opacity: 0.4 },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.text,
    },
  });
};
