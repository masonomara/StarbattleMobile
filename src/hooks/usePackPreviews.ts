import { useState, useEffect } from 'react';
import { getStreakPack, getPuzzlesForPack } from '../packs';
import { getCurrentKey, getPuzzleIndex } from '../utils/streakDate';
import { parsePuzzle } from '../utils/parsePuzzle';
import type { PackCatalogItem, Puzzle } from '../types';

// Loads the first-glance preview puzzle for every pack:
// - Streak packs: today's puzzle (deterministically selected by date index)
// - Library packs: always puzzle index 0
//
// BUG: inside the Promise.all map, async callbacks have no individual try/catch.
// If any single pack's load throws, Promise.all rejects and the outer `load()`
// call (which is also uncaught) silently drops ALL previews. Each entry in the
// map needs its own try/catch so one failed pack doesn't discard all others.
//
// RISK: `packCatalog` changes when entitlements sync (e.g. after purchase).
// The effect re-runs, but the `cancelled` flag only guards against stale sets
// — it does not cancel in-flight fetches. For large catalogs, a previous fetch
// can still resolve and overwrite results from the latest fetch if `cancelled`
// is reset before the old promise resolves. An AbortController per effect run
// would be more robust.
export function usePackPreviews(
  packCatalog: PackCatalogItem[],
): Record<string, Puzzle> {
  const [packPreviews, setPackPreviews] = useState<Record<string, Puzzle>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const results: Record<string, Puzzle> = {};
      await Promise.all(
        packCatalog.map(async pack => {
          if (pack.type) {
            const streakPack = await getStreakPack(pack.type);
            if (!streakPack) return;
            const idx = getPuzzleIndex(pack.type, streakPack.puzzles.length);
            results[pack.id] = parsePuzzle(
              streakPack.puzzles[idx],
              `${pack.id}:${getCurrentKey(pack.type)}`,
            );
          } else {
            const rawPuzzles = await getPuzzlesForPack(
              pack.id,
              pack.storagePath,
            );
            if (!rawPuzzles?.length) return;
            results[pack.id] = parsePuzzle(rawPuzzles[0], `${pack.id}:0`);
          }
        }),
      );
      if (!cancelled) setPackPreviews(results);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [packCatalog]);

  return packPreviews;
}
