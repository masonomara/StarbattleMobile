import { useState, useEffect } from 'react';
import { useEntitlementsStore } from '../../shared/stores/entitlementsStore';
import { getStreakPack, getPuzzlesForPack } from '../../packs';
import {
  getCurrentKey,
  getPuzzleIndex,
  archiveKeyToDate,
  isStreakType,
} from '../../shared/lib/streakDate';
import type { PackData } from '../../types';

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
  skip = false,
): PackData | null {
  const [packData, setPackData] = useState<PackData | null>(null);
  const packCatalog = useEntitlementsStore(s => s.packCatalog);

  useEffect(() => {
    setPackData(null);
    if (skip) return;

    const meta = packCatalog.find(p => p.id === packId);
    const streakType = meta?.type;

    if (isStreakType(streakType)) {
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
            // A given date has one progress record, whether it was played live
            // that day or opened later from the archive — so the archive shows
            // the same completion/solution you already have for that date.
            puzzleId: `${streakType}:${key}`,
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
  }, [packId, puzzleIndex, archiveKey, navigation, packCatalog, skip]);

  return packData;
}
