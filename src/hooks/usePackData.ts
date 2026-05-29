import { useState, useEffect } from 'react';
import { useEntitlementsStore } from '../stores/entitlementsStore';
import { getStreakPack, getPuzzlesForPack } from '../packs';
import {
  getCurrentKey,
  getPuzzleIndex,
  archiveKeyToDate,
} from '../utils/streakDate';
import type { PackData } from '../types';

// Resolves route params into a fully loaded PackData object.
// Returns null while loading; calls navigation.goBack() on any load failure.
//
// Two cases:
//   Streak pack  — packId matches a catalog entry with a type field.
//                  Loads today's puzzle or an archive puzzle by archiveKey.
//   Library pack — puzzleIndex selects the specific puzzle.
export function usePackData(
  packId: string,
  puzzleIndex: number | undefined,
  archiveKey: string | undefined,
  navigation: { goBack: () => void },
): PackData | null {
  const [packData, setPackData] = useState<PackData | null>(null);

  useEffect(() => {
    setPackData(null);

    const catalog = useEntitlementsStore.getState().packCatalog;
    const meta = catalog.find(p => p.id === packId);
    const streakType = meta?.type;

    if (streakType) {
      // Streak pack: load the shared streak puzzle file, then select today's
      // puzzle (or the archived one) by deterministic date index.
      getStreakPack(streakType)
        .then(pack => {
          if (!pack) {
            navigation.goBack();
            return;
          }

          // For archives, derive the date from the key so getPuzzleIndex
          // returns the same puzzle that was played on that date.
          const key = archiveKey ?? getCurrentKey(streakType);
          const date = archiveKey
            ? archiveKeyToDate(streakType, archiveKey)
            : new Date();
          const idx = getPuzzleIndex(streakType, pack.puzzles.length, date);

          setPackData({
            rawPuzzle: pack.puzzles[idx],
            // Archive puzzles get a distinct ID so their progress is stored
            // separately from the live daily/weekly/monthly puzzle.
            puzzleId: archiveKey
              ? `${streakType}:archive:${key}`
              : `${streakType}:${key}`,
            gridSize: pack.gridSize,
            packName: pack.name,
            // Archive puzzles are never the "last" puzzle in a sequence.
            isLastPuzzle: !archiveKey,
            // effectivePackId is the streakType, not the catalog ID — this is
            // what hint files and archive keys are indexed against.
            effectivePackId: streakType,
            puzzleIndexInPack: idx,
            streakType,
          });
        })
        .catch(() => navigation.goBack());
    } else {
      // Library pack: load all puzzles and select by index.
      const idx = puzzleIndex ?? 0;
      getPuzzlesForPack(packId)
        .then(puzzles => {
          const raw = puzzles?.[idx];
          if (!raw) {
            navigation.goBack();
            return;
          }
          setPackData({
            rawPuzzle: raw,
            puzzleId: `${packId}:${idx}`,
            gridSize: meta?.gridSize ?? parseInt(raw.sbn.split('x')[0], 10),
            packName: meta?.name ?? packId,
            // puzzles is non-null here since raw = puzzles[idx] is truthy.
            isLastPuzzle: idx >= (meta?.puzzleCount ?? puzzles!.length) - 1,
            effectivePackId: packId,
            puzzleIndexInPack: idx,
          });
        })
        .catch(() => navigation.goBack());
    }
  }, [packId, puzzleIndex, archiveKey, navigation]);

  return packData;
}
