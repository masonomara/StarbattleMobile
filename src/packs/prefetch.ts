import { supabase } from '../supabase';
import { packMetaStorage } from '../mmkv';
import { refreshStreakFile } from './index';
import type { StreakType } from '../types';

const STREAK_TYPES: StreakType[] = ['daily', 'weekly', 'monthly'];

// Checks each streak file's remote ETag against the locally cached one.
// Re-downloads only when the content has changed. Runs all three types in
// parallel; a failure for one type does not abort the others.
export async function prefetchStreaks(): Promise<void> {
  await Promise.allSettled(
    STREAK_TYPES.map(async type => {
      const storageKey = `${type}.json`;
      try {
        const { data, error } = await supabase.storage
          .from('packs')
          .info(storageKey);

        if (error) return; // network unavailable — disk/bundle handles load

        const remoteEtag = data?.etag;
        const cachedEtag = packMetaStorage.getString(`etag:${storageKey}`);

        if (remoteEtag && remoteEtag === cachedEtag) return; // already fresh

        // Stale or no ETag yet — refreshStreakFile downloads, writes disk,
        // updates memory cache, and stores the new ETag.
        await refreshStreakFile(storageKey);
      } catch {
        // Silently skip — disk cache or bundled fallback handles this type.
      }
    }),
  );
}

// Debounced wrapper so rapid app-foreground events (notification banners,
// multitasking gestures) collapse into a single prefetch run.
let _prefetchTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePrefetch(): void {
  if (_prefetchTimer) return; // already scheduled — let it fire
  _prefetchTimer = setTimeout(() => {
    _prefetchTimer = null;
    prefetchStreaks().catch(() => {});
  }, 2000);
}
