import type { Pack, HintStep } from '../types';
import { fetchPack, fetchHints } from './packFetcher';

// In-memory cache keyed by local filename. Stores the in-flight or resolved
// Promise so concurrent callers for the same key share one fetch.
// NOTE: packCache is module-level and never evicted except on individual fetch
// failures. This means a fresh install always populates from disk/network, but
// once warm the app never re-reads from disk even across puzzle sessions.
// If pack content is updated server-side, the cache must be explicitly
// invalidated via warmPackCache() — currently only errors trigger eviction.
// prefetchPackFile() handles ETag-based refresh; loadPack() does not.
const packCache = new Map<string, Promise<Pack>>();

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
  return promise;
}

// Keyed by packId, separate from packCache so evicting a stale pack never
// discards hints.
const hintsCache = new Map<string, Promise<HintStep[][]>>();

export function warmHintsCache(packId: string, hints: HintStep[][]): void {
  hintsCache.set(packId, Promise.resolve(hints));
}

export function hasHintsCacheEntry(packId: string): boolean {
  return hintsCache.has(packId);
}

export function loadPackHints(packId: string): Promise<HintStep[][]> {
  const cached = hintsCache.get(packId);
  if (cached) return cached;

  const promise = fetchHints(packId);
  hintsCache.set(packId, promise);
  promise.catch(() => hintsCache.delete(packId));
  return promise;
}
