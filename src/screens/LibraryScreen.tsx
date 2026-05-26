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
import { Check, ChevronLeft, Lock } from 'lucide-react-native';
import { CircleButton } from '../components/CircleButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPuzzlesForPack } from '../packs';
import { Header } from '../components/Header';
import { PaywallModal } from '../components/PaywallModal';
import { PuzzleThumbnail } from '../components/PuzzleThumbnail';
import { useTheme } from '../hooks/useTheme';
import { rgba } from '../themes/ansi';
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
              <Check size={28} color={rgba(theme.blue, 1)} />
            ) : (
              <Lock
                size={28}
                color={rgba(theme.isDark ? theme.gray : theme.gray, 1)}
              />
            )}
          </View>
        )}
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
  const cellSize = Math.floor(
    (width - 2 * theme.spacingLg - numColumns * 12) / numColumns,
  );
  const styles = useMemo(
    () => createStyles(theme, cellSize),
    [theme, cellSize],
  );
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const { packCatalog, canPlayPuzzle, hasPackAccess } = useEntitlements();

  const catalogPack = packCatalog.find(p => p.id === packId);
  const puzzleCount = catalogPack?.puzzleCount ?? 0;
  const packName = catalogPack?.name ?? packId;
  const isFree = catalogPack?.isFree ?? true;
  const priceUsd = catalogPack?.priceUsd;
  const storagePath = catalogPack?.storagePath;

  const [rawPuzzles, setRawPuzzles] = useState<RawPuzzle[] | null>(null);

  useEffect(() => {
    getPuzzlesForPack(packId)
      .then(setRawPuzzles)
      .catch(() => {});
  }, [packId]);

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
      <Header
        left={
          <CircleButton onPress={() => navigation.goBack()}>
            <ChevronLeft
              size={26}
              color={rgba(theme.isDark ? theme.white : theme.black, 1)}
            />
          </CircleButton>
        }
        center={<Text style={styles.headerTitle}>{packName}</Text>}
      />
      <FlatList
        data={rows}
        keyExtractor={item => String(item[0])}
        renderItem={renderRow}
        style={styles.scroll}
        contentContainerStyle={[
          styles.gridContent,
          { paddingTop: 48 + insets.top, paddingBottom: insets.bottom },
        ]}
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

const createStyles = (theme: Theme, cellSize: number) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: rgba(theme.isDark ? theme.black : theme.white, 1),
    },
    scroll: { flex: 1 },
    gridContent: {
      padding: 16,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    puzzleCell: {
      height: cellSize,
      width: cellSize,
      margin: 8,

      backgroundColor: rgba(theme.isDark ? theme.gray : theme.gray, 1),
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
      opacity: 0.55,
    },
    puzzleNumber: { fontSize: 16, fontWeight: '700' },
    puzzleNumberCompleted: { color: rgba(theme.blue, 1) },
    puzzleNumberActive: {
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
    },
    puzzleNumberLocked: {
      color: rgba(theme.isDark ? theme.gray : theme.gray, 1),
    },
    locked: { opacity: 0.45 },
    headerTitle: {
      fontSize: 16,
      fontVariant: ['tabular-nums'],
      fontWeight: '600',
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
    },
  });
};
