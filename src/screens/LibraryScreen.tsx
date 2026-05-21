import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, ChevronLeft, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { packs } from '../packs';
import { PaywallModal } from '../components/PaywallModal';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { getCompletedPuzzleIdsForPack } from '../utils/progress';
import type { RootStackParamList } from '../types/navigation';
import type { PaywallContext } from '../types/user';

type PuzzleCellProps = {
  packId: string;
  index: number;
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
      {status !== 'active' && (
        <View style={styles.puzzleIcon}>
          {status === 'completed' ? (
            <Check size={32} color={theme.accent} />
          ) : (
            <Lock size={32} color={theme.textSecondary} />
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
  const bundledPack = packs.find(p => p.id === packId);
  const puzzleCount =
    catalogPack?.puzzleCount ?? bundledPack?.puzzles.length ?? 0;
  const packName = catalogPack?.name ?? bundledPack?.name ?? packId;
  const isFree = catalogPack?.isFree ?? true;
  const priceUsd = catalogPack?.priceUsd;
  const storagePath = catalogPack?.storagePath;

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
      <View style={[styles.headerRow, { paddingTop: insets.top, height: 48 + insets.top }]}>
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
        visible={paywallContext !== null}
        context={paywallContext}
        onClose={() => setPaywallContext(null)}
        onPurchaseSuccess={() => {
          setPaywallContext(null);
          getCompletedPuzzleIdsForPack(packId, puzzleCount).then(set => {
            setCompletedSet(set);
            setCompletedCount(set.size);
          });
        }}
        onNavigateToAccount={() => navigation.navigate('Account')}
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
      aspectRatio: 1,
      height: 54,
      width: 54,
      margin: 8,
      borderWidth: 2.5,
      borderRadius: 0,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 1,
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
      borderColor: theme.regionBorder,
    },
    puzzleIcon: {
      position: 'absolute',
      opacity: 0.3,
    },
    puzzleNumber: { fontSize: 18, fontWeight: '700' },
    puzzleNumberCompleted: { color: theme.accent },
    puzzleNumberActive: { color: theme.text },
    puzzleNumberLocked: { color: theme.textSecondary },
    locked: { opacity: 0.5 },
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
