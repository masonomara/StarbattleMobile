import { prefetchPackFile, cachePackPreview, prefetchHintsFile } from './index';
import { useEntitlementsStore } from '../shared/stores/entitlementsStore';
import { isStreakType } from '../shared/lib/streakDate';
import { mark, time } from '../shared/lib/perfLog';
import type { PackCatalogItem, StreakType } from '../types';

// Streak hint files keyed by streakType — this is the packId fetchHints/
// prefetchHintsFile build "{type}-hints.json" from, and the effectivePackId a
// streak puzzle loads its hints under (see usePackData). Daily first: it's the
// most-opened puzzle, so it gets a head start on bandwidth.
const STREAK_HINT_TYPES: StreakType[] = ['daily', 'weekly', 'monthly'];

// Background prefetch of the three streak hint files to disk. Streak packs are
// warmed at boot (App.tsx getStreakPack) but their HINTS are not, and they're
// not catalog entries either, so prefetchAllCatalog never covers them — without
// this, the first open of daily/weekly/monthly is always a cold network fetch.
// Each file is ETag-aware (prefetchHintsFile skips when the disk copy matches
// remote) and streams natively to disk via downloadToFile, so the largest file
// (daily, ~3.7MB) never crosses the JS bridge. A failure for one does not abort
// the others. Run behind InteractionManager (see runTieredPrefetch) so it never
// competes with first paint.
export async function prefetchStreakHints(): Promise<void> {
  mark(
    'PREFETCH',
    `prefetchStreakHints start — ${STREAK_HINT_TYPES.length} streak hint files (daily/weekly/monthly), stream to disk`,
  );
  const endAll = time('PREFETCH', 'prefetchStreakHints total');
  await Promise.allSettled(
    STREAK_HINT_TYPES.map(type => prefetchHintsFile(type).catch(() => {})),
  );
  endAll(`${STREAK_HINT_TYPES.length} streak hint files`);
}

// Caps how many packs prefetch at once. Each pack fans out a signed-URL request,
// an ETag HEAD, and (for accessible packs) a streamed download + hints download.
// Firing all ~40 at once right after first paint floods a slow device's network
// + JS event loop and contends with the home's own preview reads. Bounding the
// fan-out keeps the post-paint period smooth; this is a background offline-cache
// task off the critical path, so steadiness beats raw throughput. (Disk writes
// are separately capped in packStorage's writeFileThrottled.)
const PREFETCH_CONCURRENCY = 4;

// Runs thunks with at most `limit` in flight. Thunks (not eager promises) so the
// work doesn't all start before the pool can throttle it. A thrown thunk is the
// caller's concern — every task below already swallows its own rejection.
async function runPooled(
  tasks: Array<() => Promise<void>>,
  limit: number,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const idx = next++;
      await tasks[idx]();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
}

// ETag-aware refresh of all catalog content and streak packs.
// Each pack gets a full download if the user has access (free, premium, or
// owned); unpurchased paid packs get only their first puzzle cached as a
// preview. A failure for any individual item does not abort the others.
//
// Access check delegates to hasPackAccess in the entitlements store so the
// logic stays in one place and prefetch always uses the current entitlements.
export async function prefetchAllCatalog(catalog: PackCatalogItem[]): Promise<void> {
  const { hasPackAccess } = useEntitlementsStore.getState();
  const withPath = catalog.filter(p => p.storagePath);
  const accessCount = withPath.filter(p => hasPackAccess(p.id)).length;
  mark(
    'PREFETCH',
    `prefetchAllCatalog start — ${withPath.length} packs (${accessCount} full+hints, ${withPath.length - accessCount} preview-only), ${PREFETCH_CONCURRENCY} at a time`,
  );
  const endAll = time('PREFETCH', 'prefetchAllCatalog total');
  // Drain order matters: the pool runs this list front-to-back, so if the user
  // goes offline mid-prefetch, whatever sorts first is what survives in the
  // offline cache. Rank by offline value — streak packs (the most-opened daily/
  // weekly/monthly puzzles) first, then other accessible packs (full download =
  // playable offline), then preview-only paid packs (a single thumbnail puzzle,
  // least useful offline). A stable sort keeps the catalog's sort_order within
  // each tier.
  const offlineRank = (p: PackCatalogItem): number => {
    if (!hasPackAccess(p.id)) return 2;
    return isStreakType(p.type) ? 0 : 1;
  };
  const ordered = [...withPath].sort((a, b) => offlineRank(a) - offlineRank(b));
  const tasks: Array<() => Promise<void>> = ordered.map(p => () => {
    if (hasPackAccess(p.id)) {
      // Hints ride the same prefetch as the pack — disk-cached for offline.
      // Awaited (not fire-and-forget) so the cycle actually completes them.
      return Promise.all([
        prefetchHintsFile(p.id).catch(() => {}),
        prefetchPackFile(p.id, p.storagePath!).catch(() => {}),
      ]).then(() => {});
    }
    return cachePackPreview(p.id, p.storagePath!).catch(() => {});
  });
  await runPooled(tasks, PREFETCH_CONCURRENCY);
  endAll(`${withPath.length} packs`);
}
