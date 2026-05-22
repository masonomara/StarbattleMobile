import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, ChevronLeft, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPuzzlesForPack } from '../packs';
import type { RawPuzzle } from '../types/puzzle';
import { PaywallModal } from '../components/PaywallModal';
import { PuzzleThumbnail } from '../components/PuzzleThumbnail';
import { useTheme } from '../hooks/useTheme';
import type { Theme } from '../types/theme';
import { useEntitlements } from '../hooks/useEntitlements';
import { getCompletedPuzzleIdsForPack } from '../utils/progress';
import { parsePuzzle } from '../utils/parsePuzzle';
import type { RootStackParamList } from '../types/navigation';
import type { PaywallContext } from '../types/user';
import type { Puzzle } from '../types/puzzle';

const CELL_SIZE = 110;

type PuzzleCellProps = {
  packId: string;
  index: number;
  puzzle: Puzzle | null;
  onPress: (index: number) => void;
  onLockedPress: (index: number) => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  completedSet: Set<string>;
  canPlay: boolean;
};

function PuzzleCell({
  packId,
  index,
  puzzle,
  onPress,
  onLockedPress,
  styles,
  theme,
  completedSet,
  canPlay,
}: PuzzleCellProps) {
  const puzzleId = `${packId}:${index}`;
  const isCompleted = completedSet.has(puzzleId);

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
        <PuzzleThumbnail puzzle={puzzle} size={CELL_SIZE} theme={theme} />
      )}
      <View style={styles.puzzleCellOverlay}>
        {status !== 'active' && (
          <View style={styles.puzzleIcon}>
            {status === 'completed' ? (
              <Check size={28} color={theme.accent} />
            ) : (
              <Lock size={28} color={theme.textSecondary} />
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
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
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

  const parsedPuzzles = useMemo<Puzzle[]>(() => {
    if (!rawPuzzles) return [];
    return rawPuzzles.map((raw, i) => parsePuzzle(raw, `${packId}:${i}`));
  }, [packId, rawPuzzles]);

  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const [completedCount, setCompletedCount] = useState(0);
  const [paywallContext, setPaywallContext] = useState<PaywallContext | null>(
    null,
  );

  useEffect(() => {
    if (!puzzleCount) return;
    getCompletedPuzzleIdsForPack(packId, puzzleCount).then(set => {
      setCompletedSet(set);
      setCompletedCount(set.size);
    });
  }, [packId, puzzleCount]);

  function isPuzzlePlayable(index: number): boolean {
    const packInCatalog = packCatalog.find(p => p.id === packId);
    if (!packInCatalog) {
      return index === 0 || completedSet.has(`${packId}:${index - 1}`);
    }
    return canPlayPuzzle(packId, index, completedCount);
  }

  function handleLockedPress(index: number) {
    if (!isFree && !hasPackAccess(packId)) {
      if (priceUsd !== undefined && storagePath !== undefined) {
        setPaywallContext({
          type: 'paid-pack',
          packId,
          packName,
          priceUsd,
          storagePath,
        });
      } else {
        // Pack metadata incomplete — send to account screen as fallback
        setPaywallContext({ type: 'sequential', packId, puzzleIndex: index });
      }
    } else {
      setPaywallContext({ type: 'sequential', packId, puzzleIndex: index });
    }
  }

  const puzzleIndices = useMemo(
    () => Array.from({ length: puzzleCount }, (_, i) => i),
    [puzzleCount],
  );

  if (!puzzleCount) return null;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.headerRow,
          { paddingTop: insets.top, height: 48 + insets.top },
        ]}
      >
        <Pressable
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <ChevronLeft size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{packName}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom }]}
      >
        {puzzleIndices.map(index => (
          <PuzzleCell
            key={index}
            packId={packId}
            index={index}
            puzzle={parsedPuzzles[index] ?? null}
            onPress={i =>
              navigation.navigate('Puzzle', { packId, puzzleIndex: i })
            }
            onLockedPress={handleLockedPress}
            styles={styles}
            theme={theme}
            completedSet={completedSet}
            canPlay={isPuzzlePlayable(index)}
          />
        ))}
      </ScrollView>
      <PaywallModal
        context={paywallContext}
        onClose={() => setPaywallContext(null)}
        onPurchaseSuccess={() => {
          setPaywallContext(null);
          getCompletedPuzzleIdsForPack(packId, puzzleCount).then(set => {
            setCompletedSet(set);
            setCompletedCount(set.size);
          });
        }}
      />
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { flex: 1 },
    grid: {
      padding: theme.spacingLg,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    puzzleCell: {
      height: CELL_SIZE,
      width: CELL_SIZE,
      margin: 6,
      borderRadius: 4,
      overflow: 'hidden',
      elevation: 2,
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 4,
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
    puzzleNumberCompleted: { color: theme.accent },
    puzzleNumberActive: { color: theme.text },
    puzzleNumberLocked: { color: theme.textSecondary },
    locked: { opacity: 0.45 },
    headerButton: {
      width: 36,
      height: 36,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 8,
      opacity: 0.97,
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
    },
    headerTitle: {
      fontSize: 16,
      fontVariant: ['tabular-nums'],
      fontWeight: '600',
      color: theme.text,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacingXl,
      backgroundColor: theme.bg,
    },
    headerSpacer: {
      width: 36,
    },
  });
