import { useState, useEffect } from 'react';
import { getStreakPack, getPackPreview } from '../packs';
import { getCurrentKey, getPuzzleIndex } from '../utils/streakDate';
import { parsePuzzle } from '../utils/parsePuzzle';
import type { PackCatalogItem, Puzzle } from '../types';

// Loads the first-glance preview puzzle for every pack:
// - Streak packs: today's puzzle (deterministically selected by date index)
// - Library packs: always puzzle index 0
//
// RISK: `packCatalog` changes when entitlements sync (e.g. after purchase).
// The effect re-runs, but the `cancelled` flag only guards against stale sets
// — it does not cancel in-flight fetches. For large catalogs, a previous fetch
// can still resolve and overwrite results from the latest fetch if `cancelled`
// is reset before the old promise resolves. An AbortController per effect run
// would be more robust.
export function usePackPreviews(
  packCatalog: PackCatalogItem[],
): { packPreviews: Record<string, Puzzle> } {
  const [packPreviews, setPackPreviews] = useState<Record<string, Puzzle>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const results: Record<string, Puzzle> = {};
      await Promise.all(
        packCatalog.map(async pack => {
          try {
            if (pack.type) {
              const streakPack = await getStreakPack(pack.type);
              if (!streakPack) return;
              const idx = getPuzzleIndex(pack.type, streakPack.puzzles.length);
              results[pack.id] = parsePuzzle(
                streakPack.puzzles[idx],
                `${pack.id}:${getCurrentKey(pack.type)}`,
              );
            } else {
              const previewPuzzle = await getPackPreview(
                pack.id,
                pack.storagePath,
              );
              if (!previewPuzzle) return;
              results[pack.id] = parsePuzzle(previewPuzzle, `${pack.id}:0`);
            }
          } catch {
            // skip this pack, keep others
          }
        }),
      );
      // Commit every preview in one update so the cards reveal together as a
      // single coordinated drop-in, rather than popping in one-by-one out of
      // sync with each other and their pulse animations. Merge into prev so a
      // catalog re-sync doesn't flash already-loaded cards back to skeletons.
      if (!cancelled) {
        setPackPreviews(prev => ({ ...prev, ...results }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [packCatalog]);

  return { packPreviews };
}
