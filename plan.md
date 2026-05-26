# Resilient Streak Puzzle Loading

## Current State

```
getStreakPack(type)
  └─ loadPack(`${type}.json`)
       ├─ memory cache (Map)     ← fast, in-process dedup
       └─ fetchPack(storageKey)
            ├─ RNFS disk read    ← works offline after first load
            └─ Supabase Storage  ← fails on no network
                 └─ write to disk
```

**Gaps:**
1. **No offline-first guarantee.** First launch or hard airplane mode = streaks unavailable.
2. **No cache invalidation.** If `daily.json` is updated on Supabase (new puzzles added, hint fixed), cached copies never refresh.
3. **No prefetch.** The user waits for a network round-trip every time the disk cache is cold.

## Goals

- Streak puzzles always load, even on first launch with no network.
- Updated server-side content propagates to users within one foreground event.
- Prefetch eliminates perceived load time in the common case.
- Pack puzzles (`getPuzzlesForPack`) are unchanged — OTA-only is fine for packs.

## Non-Goals

- Windowed/partitioned streak files. The monolithic format works fine:
  365 daily puzzles × ~200 bytes ≈ 73KB uncompressed, ~15KB gzipped.
- Background fetch (OS-level, wakes the app). AppState `'active'` is enough.
- Offline archive browsing. Archives still require a prior download.

---

## Architecture After

```
getStreakPack(type)
  └─ loadStreakPack(type)
       ├─ 1. memory cache            ← unchanged
       ├─ 2. RNFS disk read          ← unchanged
       ├─ 3. Supabase Storage        ← unchanged
       └─ 4. bundled asset fallback  ← NEW: always available
                  ↑
         prefetchStreaks()            ← NEW: runs on AppState 'active'
           ├─ supabase.storage.info() → compare ETag to MMKV
           └─ if stale: re-download → disk + memory + store new ETag
```

---

## Step 1: Bundle the Emergency Fallback Assets

Place static streak JSON files in the app bundle. Metro resolves `require()` on
JSON at build time, so these are always available regardless of network state.

### Directory layout

```
src/
  assets/
    streaks/
      daily.json      ← same Pack format as Supabase Storage
      weekly.json
      monthly.json
```

These files are copies of whatever is on Supabase Storage at the time of the app
release. They don't need to be exhaustive — even 30 daily puzzles covers the
first month of users. The disk cache takes over after the first successful
download.

### Reading bundled assets

Metro's bundler resolves static `require()` at compile time. Dynamic keys won't
work, so use a lookup object:

```ts
// src/packs/streakFallback.ts
import type { Pack, StreakType } from '../types';

// Metro resolves these at build time — require() paths must be string literals.
const BUNDLED_DAILY   = require('../assets/streaks/daily.json')   as Pack;
const BUNDLED_WEEKLY  = require('../assets/streaks/weekly.json')  as Pack;
const BUNDLED_MONTHLY = require('../assets/streaks/monthly.json') as Pack;

export const BUNDLED_STREAKS: Record<StreakType, Pack> = {
  daily:   BUNDLED_DAILY,
  weekly:  BUNDLED_WEEKLY,
  monthly: BUNDLED_MONTHLY,
};
```

### Why not RNFS for the fallback?

RNFS reads from `DocumentDirectory`, which is writable but starts empty. Bundled
assets via `require()` are embedded in the JS bundle and never absent.

---

## Step 2: ETag Metadata Store (MMKV)

Add a dedicated MMKV instance for pack metadata so it can be cleared
independently of settings or auth data.

### `src/mmkv.ts` addition

```ts
// Stores ETag and last-checked timestamps for cached pack files.
// Separate instance so it can be cleared without touching settings.
export const packMetaStorage = createMMKV({ id: 'starbattle-pack-meta' });
```

### Helper functions (add to `src/packs/index.ts`)

```ts
import { packMetaStorage } from '../mmkv';

function getCachedEtag(storageKey: string): string | undefined {
  return packMetaStorage.getString(`etag:${storageKey}`) ?? undefined;
}

function setCachedEtag(storageKey: string, etag: string): void {
  packMetaStorage.set(`etag:${storageKey}`, etag);
}
```

MMKV reads are synchronous (~microseconds), so these add no async overhead to
the hot path.

---

## Step 3: ETag-Aware Refresh Function

This function is called by the prefetch engine (not the hot load path). It
downloads a fresh copy from Supabase, writes to disk, updates memory cache, and
stores the new ETag.

```ts
// src/packs/index.ts

async function refreshStreakFile(storageKey: string): Promise<void> {
  const rnfs = getRNFS();
  if (!rnfs) return; // can't cache — skip silently

  const text = await fetchFromSupabase(storageKey);
  validatePackText(text);

  const localPath = `${rnfs.DocumentDirectoryPath}/packs/${storageKey}`;
  await rnfs.mkdir(`${rnfs.DocumentDirectoryPath}/packs`).catch(() => {});
  await rnfs.writeFile(localPath, encodeForDisk(text), 'utf8');

  // Replace the in-memory promise so the next getStreakPack() call gets fresh data.
  packCache.set(storageKey, Promise.resolve(text));

  // Fetch and store the ETag separately. We download first (content) then
  // metadata because .info() is a second round-trip — acceptable here since
  // this runs in the background, not on the critical path.
  try {
    const { data } = await supabase.storage.from('packs').info(storageKey);
    if (data?.eTag) setCachedEtag(storageKey, data.eTag);
  } catch {
    // ETag store is best-effort. Missing ETag just means we re-check next time.
  }
}
```

**Why fetch content first, then ETag?** The download gives us the new content
we need. The `.info()` call is for the ETag to avoid downloading again next
time — it's best-effort. Reversing the order (ETag first, then download) saves
bandwidth in the "up to date" case but requires two calls before we know whether
to download at all. Since this runs in the background, the extra call is fine
either way; the simpler order is content-first.

---

## Step 4: Updated `getStreakPack`

Add the bundled fallback as a final catch:

```ts
// src/packs/index.ts

export async function getStreakPack(type: StreakType): Promise<Pack | null> {
  try {
    const text = await loadPack(`${type}.json`);
    return JSON.parse(text) as Pack;
  } catch {
    // loadPack exhausted memory cache, disk cache, and network.
    // Fall through to the bundled asset — always available.
    console.warn(`[packs] network unavailable for ${type} — using bundled fallback`);
    return BUNDLED_STREAKS[type] ?? null;
  }
}
```

No change to the load path. The fallback is a silent safety net.

---

## Step 5: Prefetch Engine

Create a dedicated file to keep prefetch logic separate from the load path.

### `src/packs/prefetch.ts`

```ts
import { AppState } from 'react-native';
import { supabase } from '../supabase';
import { packMetaStorage } from '../mmkv';
import type { StreakType } from '../types';
import { refreshStreakFile } from './index'; // exported from packs/index.ts

const STREAK_TYPES: StreakType[] = ['daily', 'weekly', 'monthly'];

// Checks whether the remote ETag differs from the locally cached one.
// Returns true if a download is needed (stale or never cached).
async function isStale(storageKey: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from('packs').info(storageKey);
  if (error || !data?.eTag) return true; // treat unknown as stale
  const cached = packMetaStorage.getString(`etag:${storageKey}`);
  return data.eTag !== cached;
}

// Prefetches all streak files. Silently skips on network failure.
// Safe to call concurrently — each type runs independently.
export async function prefetchStreaks(): Promise<void> {
  await Promise.allSettled(
    STREAK_TYPES.map(async type => {
      const storageKey = `${type}.json`;
      try {
        if (await isStale(storageKey)) {
          await refreshStreakFile(storageKey);
        }
      } catch {
        // Network unavailable or Supabase error — disk/bundle fallback handles it.
      }
    }),
  );
}

// Debounce wrapper so rapid app-switching doesn't hammer the API.
let _prefetchTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePrefetch(): void {
  if (_prefetchTimer) return; // already scheduled
  _prefetchTimer = setTimeout(() => {
    _prefetchTimer = null;
    prefetchStreaks().catch(() => {});
  }, 2000);
}
```

`Promise.allSettled` is intentional: a failure for `weekly` shouldn't abort
the `daily` prefetch.

---

## Step 6: Wire Prefetch to AppState

The prefetch should run when the app comes to the foreground. The right place is
wherever the app's top-level initialization lives — `App.tsx` or the root
navigator component.

```ts
// App.tsx (or wherever AppState is already observed)
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { schedulePrefetch } from './packs/prefetch';

useEffect(() => {
  // Prefetch immediately on mount (covers fresh install / cold launch).
  schedulePrefetch();

  const sub = AppState.addEventListener('change', state => {
    // 'active' fires on foreground — Android skips 'inactive' (goes active → background directly).
    if (state === 'active') schedulePrefetch();
  });

  return () => sub.remove();
}, []);
```

**Why `schedulePrefetch` (debounced) rather than `prefetchStreaks` directly?**

The `'active'` event can fire in quick succession during certain transitions
(phone call dismissed, notification center closed). The 2-second debounce
collapses these into one API call.

**Why not prefetch after puzzle completion?**

The AppState approach already covers it — the user will foreground the app to
play again tomorrow. No extra hook needed.

---

## Step 7: Export `refreshStreakFile` from `packs/index.ts`

The prefetch engine calls `refreshStreakFile`. Add the export:

```ts
// src/packs/index.ts
export { refreshStreakFile };  // or add `export` to the function declaration
```

This is the only API surface change to `packs/index.ts`.

---

## Step 8: Supabase Storage Organization

No structural change is required — the existing flat layout works:

```
packs/                          ← Supabase Storage bucket
  daily.json                    ← full Pack with all daily puzzles
  weekly.json
  monthly.json
  [packId].json                 ← regular packs (unchanged)
```

When adding new puzzles (e.g., extending `daily.json` by one more puzzle at the
end of the array), upload the new file. The next time users foreground the app,
`isStale()` detects the changed ETag and triggers a silent background download.
No forced app update needed.

### Recommended upload script pattern

```bash
# Upload with cache-control so CDN serves compressed responses
supabase storage cp ./daily.json ss:///packs/daily.json \
  --content-type application/json
```

Or via the JS client from a server-side script:

```ts
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const file = new Blob([readFileSync('./daily.json')], { type: 'application/json' });

await supabase.storage
  .from('packs')
  .upload('daily.json', file, {
    contentType: 'application/json',
    upsert: true,
  });
```

---

## Step 9: Migration

### Deploy order

1. Add `src/assets/streaks/` with current production puzzle files.
2. Add `packMetaStorage` to `mmkv.ts`.
3. Update `packs/index.ts` (fallback, ETag helpers, `refreshStreakFile` export).
4. Add `src/packs/prefetch.ts`.
5. Wire `schedulePrefetch()` into `App.tsx`.
6. Ship the app update.

### Backward compatibility

- Existing disk-cached `daily.json` files are still valid — `fetchPack` reads
  them unchanged.
- The ETag for existing cached files starts empty (no MMKV entry). On first
  foreground after update, `isStale()` returns `true` (unknown = stale), so a
  fresh download runs. This populates the ETag and sets the baseline.
- No cache busting or file deletion needed.

---

## Step 10: Purging Stale Pack Files

Regular pack files (non-streak) accumulate on disk but are never automatically
cleared. This is a separate concern, but worth a note: the existing
`DocumentDirectory/packs/` directory will grow over time. A simple purge
strategy:

```ts
// Purge pack files that haven't been accessed in > 90 days.
// Run once on app startup, async, fire-and-forget.
async function purgeStalePacks(): Promise<void> {
  const rnfs = getRNFS();
  if (!rnfs) return;

  const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
  const files = await rnfs.readdir(packDir).catch(() => [] as string[]);
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

  for (const file of files) {
    // Never purge streak files — they're small and always needed.
    if (['daily.json', 'weekly.json', 'monthly.json'].includes(file)) continue;

    const path = `${packDir}/${file}`;
    const stat = await rnfs.stat(path).catch(() => null);
    if (stat && stat.mtime && new Date(stat.mtime).getTime() < cutoff) {
      await rnfs.unlink(path).catch(() => {});
      packMetaStorage.delete(`etag:${file}`);
    }
  }
}
```

This is independent of the streak work but naturally fits in the same release.

---

## Testing Checklist

### Offline first launch
- [ ] Delete app, disable network, install fresh → streak puzzles load from bundle
- [ ] Correct puzzle shown for today's date

### Disk cache
- [ ] Enable network, launch → `daily.json` downloads to disk
- [ ] Disable network, relaunch → puzzle still loads (from disk, not bundle)

### ETag invalidation
- [ ] Upload new `daily.json` to Supabase Storage
- [ ] Background the app and foreground it → `isStale()` returns true
- [ ] New puzzle content appears (verify via puzzle index / known content)
- [ ] Foreground again immediately → `isStale()` returns false, no re-download

### Prefetch debounce
- [ ] Rapid foreground/background 5×  → only one Supabase `.info()` call fires per type

### Fallback chain
- [ ] Delete disk cache, disable network → bundle fallback used, no crash
- [ ] Re-enable network, foreground → disk cache repopulated from Supabase

### Bundle asset freshness
- [ ] On each app release: verify `src/assets/streaks/*.json` matches production Supabase content
- [ ] Add to CI: compare bundle assets against Supabase Storage (or hash check)

### Pack files unaffected
- [ ] Regular pack loading unchanged (no regression)
- [ ] `downloadPack` still works (explicit purchase flow)
