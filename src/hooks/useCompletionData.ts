import { useMemo } from 'react';
import { useQuery } from '@powersync/react-native';
import { getCurrentKey, isStreakType } from '../utils/streakDate';
import type { PackCatalogItem, StreakType } from '../types';

const COMPLETED_QUERY =
  'SELECT puzzle_id FROM puzzle_progress WHERE user_id = ? AND completed = 1';

// Tracks puzzle completion for every visible pack via a live PowerSync query.
// Counts update reactively as puzzle_progress changes, so no focus-based refresh
// is needed.
//
// The rowComparator runs a differential watch keyed on the completed-puzzle id
// set. In-progress writes to puzzle_progress (cells, marks, timer) during play
// don't change that set, so they no longer re-emit or trigger a recompute.
//
// Returns three values derived from the same completion scan:
//   completedPuzzleIds — streak puzzle IDs completed today, keyed as "packId:dateKey"
//   completedPerPack   — solved count per library pack
//   completedStreakKeys — per cadence, the set of solved keys with the "packId:"
//                        prefix stripped (today's + any archived challenges), e.g.
//                        daily "2026-06-07", weekly "2026-W23", monthly "2026-06".
//                        Drives each streak card's progress row.
//
// isLoading reflects only the query; the screen-reveal gate owns the
// no-signed-in-user policy.
export function useCompletionData(
  packCatalog: PackCatalogItem[],
  userId: string | undefined,
): {
  completedPuzzleIds: Set<string>;
  completedPerPack: Record<string, number>;
  completedStreakKeys: Record<StreakType, Set<string>>;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<{ puzzle_id: string }>(
    COMPLETED_QUERY,
    [userId ?? ''],
    { rowComparator: { keyBy: r => r.puzzle_id, compareBy: r => r.puzzle_id } },
  );

  const { completedPuzzleIds, completedPerPack, completedStreakKeys } = useMemo(() => {
    const allCompleted = new Set(data.map(r => r.puzzle_id));

    // Streak packs: check whether today's specific puzzle is done.
    const completedIds = new Set<string>();
    for (const pack of packCatalog) {
      if (!isStreakType(pack.type)) continue;
      const puzzleId = `${pack.id}:${getCurrentKey(pack.type)}`;
      if (allCompleted.has(puzzleId)) completedIds.add(puzzleId);
    }

    // Map every streak pack id to its cadence so a single pass can route each
    // completed key (today's + archived challenges) to the right cadence set.
    const streakTypeByPackId = new Map<string, StreakType>();
    for (const p of packCatalog) {
      if (isStreakType(p.type)) streakTypeByPackId.set(p.id, p.type);
    }
    const streakKeys: Record<StreakType, Set<string>> = {
      daily: new Set(),
      weekly: new Set(),
      monthly: new Set(),
    };

    // Library packs: count solved puzzles per pack. Shares the single O(K) pass
    // over the completed set (K = number of completed puzzles) with streak keys.
    const libraryPackIds = new Set(
      packCatalog.filter(p => !isStreakType(p.type)).map(p => p.id),
    );
    const counts: Record<string, number> = {};
    for (const packId of libraryPackIds) counts[packId] = 0;

    for (const key of allCompleted) {
      const sep = key.indexOf(':');
      if (sep === -1) continue;
      const packId = key.slice(0, sep);
      const cadence = streakTypeByPackId.get(packId);
      if (cadence) {
        streakKeys[cadence].add(key.slice(sep + 1));
      } else if (libraryPackIds.has(packId)) {
        counts[packId]++;
      }
    }

    return {
      completedPuzzleIds: completedIds,
      completedPerPack: counts,
      completedStreakKeys: streakKeys,
    };
  }, [data, packCatalog]);

  return { completedPuzzleIds, completedPerPack, completedStreakKeys, isLoading };
}
