import { useState, useEffect } from 'react';
import { getStreakPack, getPackPreview } from '../../packs';
import { getCurrentKey, getPuzzleIndex, isStreakType } from '../../shared/lib/streakDate';
import { parsePuzzle } from '../../shared/lib/parsePuzzle';
import { mark, time } from '../../shared/lib/perfLog';
import type { PackCatalogItem, Puzzle } from '../../types';

// Loads the first-glance preview puzzle for every pack:
// - Streak packs: today's puzzle (deterministically selected by date index)
// - Library packs: always puzzle index 0
//
// Previews come from a full-pack read+JSON.parse (the slim "_preview.json" only
// exists for unpurchased paid packs, so in practice every preview parses a whole
// pack). Doing all of them in one Promise.all coalesced ~23 synchronous parses —
// including the 365-puzzle daily pack — into a single multi-second JS-thread
// freeze that pinned the home on skeletons. Instead we load sequentially and
// yield to the event loop between packs, committing each preview as it resolves:
// the home stays scrollable and the cards reveal progressively. Streak packs
// (the carousel at the top, the primary CTA) load first so they appear before
// the thread is spent on the library sections below the fold.
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

    // Resolve a single pack's preview puzzle. Streak packs need today's puzzle
    // (date-indexed); library packs use puzzle 0. Returns null on miss/error.
    async function loadOne(
      pack: PackCatalogItem,
    ): Promise<[string, Puzzle] | null> {
      try {
        if (isStreakType(pack.type)) {
          const streakPack = await getStreakPack(pack.type);
          if (!streakPack) return null;
          const idx = getPuzzleIndex(pack.type, streakPack.puzzles.length);
          return [
            pack.id,
            parsePuzzle(
              streakPack.puzzles[idx],
              `${pack.id}:${getCurrentKey(pack.type)}`,
            ),
          ];
        }
        const previewPuzzle = await getPackPreview(pack.id, pack.storagePath);
        if (!previewPuzzle) return null;
        return [pack.id, parsePuzzle(previewPuzzle, `${pack.id}:0`)];
      } catch {
        return null; // skip this pack, keep others
      }
    }

    // Merge into prev so a catalog re-sync never flashes loaded cards back to
    // skeletons, and a card already revealed in an earlier batch stays put.
    function commit(id: string, puzzle: Puzzle) {
      if (cancelled) return;
      setPackPreviews(prev => ({ ...prev, [id]: puzzle }));
    }

    // A macrotask yield (not a microtask) so the JS thread actually processes
    // input, layout, and paint between parses — that's what keeps the home
    // responsive while previews trickle in.
    const yieldToLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));

    async function loadGroup(packs: PackCatalogItem[], label: string) {
      if (packs.length === 0) return;
      const endLoad = time('STARTUP', label);
      let count = 0;
      for (const pack of packs) {
        if (cancelled) break;
        const result = await loadOne(pack);
        if (result) {
          commit(result[0], result[1]);
          count++;
        }
        await yieldToLoop();
      }
      endLoad(`${count} previews`);
    }

    async function load() {
      if (packCatalog.length === 0) return;
      mark('STARTUP', `usePackPreviews load start — ${packCatalog.length} packs`);
      const streak = packCatalog.filter(p => isStreakType(p.type));
      const library = packCatalog.filter(p => !isStreakType(p.type));
      await loadGroup(streak, 'usePackPreviews streak previews');
      await loadGroup(library, 'usePackPreviews library previews');
      mark('STARTUP', 'usePackPreviews all previews committed');
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [packCatalog]);

  return { packPreviews };
}
