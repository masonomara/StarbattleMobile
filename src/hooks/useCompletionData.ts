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
} {
  const isFocused = useIsFocused();
  const [completedPuzzleIds, setCompletedPuzzleIds] = useState<Set<string>>(
    new Set(),
  );
  const [completedPerPack, setCompletedPerPack] = useState<
    Record<string, number>
  >({});

  // NOTE: load depends only on packCatalog (not userId). userId is checked in
  // the useEffect condition (`if (isFocused && userId)`) rather than inside
  // the callback — this is correct because loadAllCompletionData() reads userId
  // directly from authStore.getState() at call time. If userId is ever needed
  // inside the callback itself, it must be added to the useCallback dep array.
  const load = useCallback(async () => {
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
    // PERF: this iterates pack.puzzleCount times per pack, doing a Set.has()
    // per puzzle. For a pack with 100 puzzles on a large catalog this is O(N×M).
    // An alternative: filter allCompleted keys by pack prefix once and count.
    // For current puzzle counts (~30-50 per pack) this is fine.
    const counts: Record<string, number> = {};
    for (const pack of packCatalog) {
      if (pack.type) continue;
      let count = 0;
      for (let i = 0; i < pack.puzzleCount; i++) {
        if (allCompleted.has(`${pack.id}:${i}`)) count++;
      }
      counts[pack.id] = count;
    }
    setCompletedPerPack(counts);
  }, [packCatalog]);

  useEffect(() => {
    if (isFocused && userId) load();
  }, [isFocused, userId, load]);

  return { completedPuzzleIds, completedPerPack };
}
