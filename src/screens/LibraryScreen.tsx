import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, ChevronLeft, Lock } from 'lucide-react-native';
import { CircleButton } from '../components/CircleButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPuzzlesForPack } from '../packs';
import { Header } from '../components/Header';
import { PaywallModal } from '../components/PaywallModal';
import { PuzzleThumbnail } from '../components/PuzzleThumbnail';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { useSettingsStore } from '../stores/settingsStore';
import { getCompletedPuzzleIdsForPack } from '../utils/progress';
import { parsePuzzle } from '../utils/parsePuzzle';
import type { Theme } from '../types/theme';
import type { RawPuzzle, Puzzle } from '../types/puzzle';
import type { RootStackParamList } from '../types/navigation';
import type { PaywallContext } from '../types/user';

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
  coloredRegions: boolean;
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
  coloredRegions,
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
        <PuzzleThumbnail puzzle={puzzle} size={CELL_SIZE} theme={theme} coloredRegions={coloredRegions} />
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

  const parsedPuzzles = useMemo<Puzzle[]>(() => {
    if (!rawPuzzles) return [];
    return rawPuzzles.map((raw, i) => parsePuzzle(raw, `${packId}:${i}`));
  }, [packId, rawPuzzles]);

  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const completedCount = completedSet.size;
  const [paywallContext, setPaywallContext] = useState<PaywallContext | null>(
    null,
  );

  const refreshCompleted = useCallback(() => {
    if (!puzzleCount) return;
    getCompletedPuzzleIdsForPack(packId, puzzleCount).then(setCompletedSet);
  }, [packId, puzzleCount]);

  useEffect(() => {
    refreshCompleted();
  }, [refreshCompleted]);

  function isPuzzlePlayable(index: number): boolean {
    if (!catalogPack) {
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
        // Pack metadata incomplete — sequential lock as fallback
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
      <Header
        left={
          <CircleButton onPress={() => navigation.goBack()}>
            <ChevronLeft size={26} color={theme.text} />
          </CircleButton>
        }
        center={<Text style={styles.headerTitle}>{packName}</Text>}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.grid,
          { paddingTop: 48 + insets.top, paddingBottom: insets.bottom },
        ]}
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
            coloredRegions={coloredRegions}
          />
        ))}
      </ScrollView>
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
      shadowOpacity: 0.1,
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
    headerTitle: {
      fontSize: 16,
      fontVariant: ['tabular-nums'],
      fontWeight: '600',
      color: theme.text,
    },
  });
