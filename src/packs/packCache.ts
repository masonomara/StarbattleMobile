import type { Pack, HintStep } from '../types';
import { fetchPack, fetchFromSupabase } from './packFetcher';

// In-memory cache keyed by local filename. Stores the in-flight or resolved
// Promise so concurrent callers for the same key share one fetch.
// NOTE: packCache is module-level and never evicted except on individual fetch
// failures. This means a fresh install always populates from disk/network, but
// once warm the app never re-reads from disk even across puzzle sessions.
// If pack content is updated server-side, the cache must be explicitly
// invalidated via warmPackCache() — currently only errors trigger eviction.
// prefetchPackFile() handles ETag-based refresh; loadPack() does not.
const packCache = new Map<string, Promise<Pack>>();

// In-memory cache for hint arrays, keyed by packId (not filename).
// Separate from packCache so evicting a stale pack doesn't discard hints.
const hintsCache = new Map<string, Promise<HintStep[][]>>();

export function warmPackCache(key: string, pack: Pack): void {
  packCache.set(key, Promise.resolve(pack));
}

export function hasPackCacheEntry(key: string): boolean {
  return packCache.has(key);
}

export function loadPack(localKey: string, remoteKey?: string): Promise<Pack> {
  const cached = packCache.get(localKey);
  if (cached) return cached;

  const promise = fetchPack(localKey, remoteKey);
  packCache.set(localKey, promise);
  // Evict on failure so the next call retries rather than re-throwing instantly.
  promise.catch(() => packCache.delete(localKey));
  // Pre-warm the hints cache in parallel — preview packs have no hints file.
  if (!localKey.includes('_preview')) {
    const hintId = localKey.replace(/\.json$/, '');
    __DEV__ &&
      console.log(`[SB:HINTS] loadPack side-effect: loadPackHints(${hintId})`);
    loadPackHints(hintId).catch(e =>
      console.error(`[SB:HINTS] side-effect failed for ${hintId}:`, e),
    );
  }
  return promise;
}

async function fetchPackHints(packId: string): Promise<HintStep[][]> {
  const storageKey = `${packId}-hints.json`;
  __DEV__ && console.log(`[SB:HINTS] fetching ${storageKey}`);
  try {
    const text = await Promise.race([
      fetchFromSupabase(storageKey),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('hints fetch timeout')), 10_000),
      ),
    ]);
    const hints = (JSON.parse(text) as { hints: HintStep[][] }).hints;
    __DEV__ &&
      console.log(
        `[SB:HINTS] ${packId}: ${(text.length / 1024).toFixed(1)} KB, ${
          hints.length
        } entries`,
      );
    return hints;
  } catch (e) {
    console.error(`[SB:HINTS] ${packId} fetch failed:`, e);
    throw e;
  }
}

export function loadPackHints(packId: string): Promise<HintStep[][]> {
  const cached = hintsCache.get(packId);
  if (cached) {
    __DEV__ && console.log(`[SB:HINTS] ${packId}: cache hit`);
    return cached;
  }
  __DEV__ && console.log(`[SB:HINTS] ${packId}: cache miss — starting fetch`);
  const promise = fetchPackHints(packId);
  hintsCache.set(packId, promise);
  promise.catch(() => hintsCache.delete(packId));
  return promise;
}
