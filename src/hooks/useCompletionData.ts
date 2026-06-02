import { useState, useEffect, useCallback } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { getCurrentKey } from '../utils/streakDate';
import { loadAllCompletionData } from '../utils/progress';
import type { PackCatalogItem } from '../types';

// Tracks puzzle completion for every visible pack. Reloads automatically
// whenever the screen re-focuses so counts stay current after solving a puzzle.
//
// Returns two maps derived from the same underlying completion scan:
//   completedPuzzleIds — streak puzzle IDs completed today, keyed as "packId:dateKey"
//   completedPerPack   — solved count per library pack
export function useCompletionData(
  packCatalog: PackCatalogItem[],
  userId: string | undefined,
): {
  completedPuzzleIds: Set<string>;
  completedPerPack: Record<string, number>;
  isLoading: boolean;
} {
  const isFocused = useIsFocused();
  const [completedPuzzleIds, setCompletedPuzzleIds] = useState<Set<string>>(
    new Set(),
  );
  const [completedPerPack, setCompletedPerPack] = useState<
    Record<string, number>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  // NOTE: load depends only on packCatalog (not userId). userId is checked in
  // the useEffect condition (`if (isFocused && userId)`) rather than inside
  // the callback — this is correct because loadAllCompletionData() reads userId
  // directly from authStore.getState() at call time. If userId is ever needed
  // inside the callback itself, it must be added to the useCallback dep array.
  const load = useCallback(async () => {
    try {
      const allCompleted = await loadAllCompletionData();

      // Streak packs: check whether today's specific puzzle is done.
      const completedIds = new Set<string>();
      for (const pack of packCatalog) {
        if (!pack.type) continue;
        const puzzleId = `${pack.id}:${getCurrentKey(pack.type)}`;
        if (allCompleted.has(puzzleId)) completedIds.add(puzzleId);
      }
      setCompletedPuzzleIds(completedIds);

      // Library packs: count how many puzzles are solved (for the "X/Y" label).
      // Single pass over allCompleted — O(K) where K = completed puzzle count.
      const libraryPackIds = new Set(
        packCatalog.filter(p => !p.type).map(p => p.id),
      );
      const counts: Record<string, number> = {};
      for (const packId of libraryPackIds) counts[packId] = 0;
      for (const key of allCompleted) {
        const sep = key.indexOf(':');
        if (sep === -1) continue;
        const packId = key.slice(0, sep);
        if (libraryPackIds.has(packId)) counts[packId]++;
      }
      setCompletedPerPack(counts);
    } finally {
      setIsLoading(false);
    }
  }, [packCatalog]);

  useEffect(() => {
    if (isFocused && userId) load();
  }, [isFocused, userId, load]);

  return { completedPuzzleIds, completedPerPack, isLoading };
}
