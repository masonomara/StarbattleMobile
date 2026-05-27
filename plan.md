# Local-First Pack & Streak Caching — Implementation Plan

> Goal: All streak packs and free packs are cached on disk at startup (or at first online session). Paid packs cache their first puzzle as a preview. Users can play offline as long as they've been online at least once.

## Status: ✅ COMPLETE

All phases implemented. Typecheck passes with zero errors.

---

## Current State Audit

### What already works
- **Streak packs** (`daily.json`, `weekly.json`, `monthly.json`) are pre-loaded at startup via `warmStreakPackCaches` in `App.tsx`. Never purged. ETag refresh via `prefetchStreaks()`. ✅
- **PowerSync catalog** (`packs` table) is local SQLite — available offline immediately after first sync. ✅
- **3-layer pack cache** in `src/packs/index.ts`: memory → disk → Supabase. First load goes to network; all subsequent loads hit disk. ✅
- **Access control** (`hasPackAccess`, `canPlayPuzzle`) reads from local PowerSync DB — works offline. ✅
- **ETag plumbing** already exists in `packMetaStorage` for streak files.

### What's broken / missing

**1. Free packs use the wrong Supabase key when warming**

`App.tsx` (lines 63–70) calls `getPuzzlesForPack(pack.id)` for all catalog packs. That function uses `${pack.id}.json` as the Supabase storage key. But the catalog has a `storagePath` column that is the actual Supabase path. If `storagePath !== `${pack.id}.json``, the download silently fails (returns `null`).

**2. No ETag check for regular pack downloads**

`prefetch.ts` only checks ETags for `daily/weekly/monthly.json`. Regular packs are never re-fetched after an initial download, even if the remote content has changed.

**3. No eager download of free packs**

The App.tsx warm-up fires only when the catalog changes (Zustand subscription), unsubscribes after the first fire, and races with PowerSync. If the user goes offline before the catalog watch fires, free pack content is never pre-fetched.

**4. Paid pack preview not cached proactively**

Paid pack previews (first puzzle thumbnail on HomeScreen) require a network call the first time. This should be pre-fetched.

---

## Architecture After Implementation

```
App startup
  ├── [tier 1] warmStreakPackCaches()          — already done, keep as-is
  ├── [tier 2] prefetchFreePacks(catalog)      — new: eager download free packs
  ├── [tier 3] prefetchOwnedPacks(catalog, entitlements) — new: owned paid packs
  └── [tier 4] prefetchPaidPackPreviews(catalog, entitlements) — new: first puzzle for unpurchased packs

On entitlements change (purchase)
  ├── premium purchase  → prefetchAllPacks(catalog)
  └── pack purchase     → already calls downloadPack() ✅

On foreground
  ├── prefetchStreaks()  — already done ✅
  └── prefetchAllCatalog(catalog, entitlements) — new: ETag refresh for everything
```

---

## File Change Map

| File | Change |
|------|--------|
| `src/packs/index.ts` | Add `prefetchPackFile()`, `cachePackPreview()` |
| `src/packs/prefetch.ts` | Add `prefetchPackCatalog()`, wire into `schedulePrefetch()` |
| `App.tsx` | Replace naive warm-up subscription with tiered downloads |
| `src/stores/entitlementsStore.ts` | Trigger downloads after `loadEntitlements()` |
| `src/utils/payments.ts` | Trigger all-pack download after premium purchase |

---

## Phase 1 — Generalize Pack Fetching (`src/packs/index.ts`) ✅

### 1a. Fix the storage key mismatch

Every place that downloads from Supabase must use `storagePath` from the catalog rather than deriving the key from `packId`. The local disk file is always `${packId}.json` — only the remote key needs the catalog path.

Add a helper that uses `storagePath` for Supabase but the pack ID for local disk:

```typescript
// src/packs/index.ts  (new export, add after downloadPack)

/**
 * ETag-aware download for a regular pack.
 * Uses storagePath for the Supabase key; saves to {packId}.json locally.
 * Skips the download entirely if the ETag matches the cached value.
 * Safe to call fire-and-forget — errors are swallowed.
 */
export async function prefetchPackFile(
  packId: string,
  storagePath: string,
): Promise<void> {
  assertSafeKey(packId);
  const rnfs = getRNFS();

  // Check remote ETag first to avoid unnecessary downloads
  try {
    const { data, error } = await supabase.storage.from('packs').info(storagePath);
    if (error) return; // network unavailable
    const remoteEtag = data?.etag;
    const cachedEtag = getCachedEtag(storagePath);
    if (remoteEtag && remoteEtag === cachedEtag) return; // already fresh
  } catch {
    return;
  }

  const text = await fetchFromSupabase(storagePath);
  validatePackText(text);

  if (rnfs) {
    const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
    await rnfs.mkdir(packDir).catch(() => {});
    await rnfs
      .writeFile(`${packDir}/${packId}.json`, encodeForDisk(text), 'utf8')
      .catch(() => {});
  }

  // Warm in-memory cache with decoded content
  packCache.set(`${packId}.json`, Promise.resolve(text));

  // Persist ETag
  try {
    const { data } = await supabase.storage.from('packs').info(storagePath);
    if (data?.etag) setCachedEtag(storagePath, data.etag);
  } catch {
    // Best-effort
  }
}
```

### 1b. Add preview caching for paid packs

For packs the user hasn't purchased, we download the full JSON but only persist the first puzzle to a `_preview` file. This keeps paid pack full content off disk while allowing thumbnails and the first puzzle to render.

```typescript
// src/packs/index.ts  (new export, add after prefetchPackFile)

const PREVIEW_PUZZLE_COUNT = 1;

/**
 * Downloads a pack's full JSON from Supabase, but saves only the first
 * PREVIEW_PUZZLE_COUNT puzzles to disk as {packId}_preview.json.
 * The in-memory cache is also scoped to the preview slice.
 * Does nothing if a full pack file already exists on disk.
 */
export async function cachePackPreview(
  packId: string,
  storagePath: string,
): Promise<void> {
  assertSafeKey(packId);
  const rnfs = getRNFS();
  if (!rnfs) return;

  const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
  const fullPath = `${packDir}/${packId}.json`;
  const previewPath = `${packDir}/${packId}_preview.json`;

  // Skip if the full pack is already cached — no need for a preview
  try {
    await rnfs.stat(fullPath);
    return;
  } catch {
    // not on disk
  }

  // Skip if preview is already fresh (ETag unchanged)
  const previewKey = `preview:${storagePath}`;
  try {
    const { data, error } = await supabase.storage.from('packs').info(storagePath);
    if (error) return;
    const remoteEtag = data?.etag;
    const cachedEtag = packMetaStorage.getString(`etag:${previewKey}`);
    if (remoteEtag && remoteEtag === cachedEtag) {
      // Preview already on disk and fresh
      return;
    }
  } catch {
    return;
  }

  const text = await fetchFromSupabase(storagePath);
  validatePackText(text);

  const parsed = JSON.parse(text) as { puzzles: RawPuzzle[] };
  const previewData = { puzzles: parsed.puzzles.slice(0, PREVIEW_PUZZLE_COUNT) };
  const previewText = JSON.stringify(previewData);

  await rnfs.mkdir(packDir).catch(() => {});
  await rnfs.writeFile(previewPath, encodeForDisk(previewText), 'utf8').catch(() => {});

  // Warm in-memory cache with the preview slice
  const previewCacheKey = `${packId}_preview.json`;
  packCache.set(previewCacheKey, Promise.resolve(previewText));

  // Persist ETag
  try {
    const { data } = await supabase.storage.from('packs').info(storagePath);
    if (data?.etag) packMetaStorage.set(`etag:${previewKey}`, data.etag ?? '');
  } catch {}
}
```

Also update `getPuzzlesForPack` to fall back to the preview file when the full pack isn't available:

```typescript
// src/packs/index.ts  (replace existing getPuzzlesForPack)

export async function getPuzzlesForPack(
  packId: string,
  storagePath?: string,
): Promise<RawPuzzle[] | null> {
  try {
    // Try full pack first (uses storagePath for Supabase if provided)
    const storageKey = `${packId}.json`;
    let text: string | null = null;

    const rnfs = getRNFS();
    if (rnfs) {
      const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
      // 1. Full pack on disk
      try {
        text = decodeFromDisk(await rnfs.readFile(`${packDir}/${packId}.json`, 'utf8'));
      } catch {
        // not on disk
      }
      // 2. Preview on disk
      if (!text) {
        try {
          text = decodeFromDisk(await rnfs.readFile(`${packDir}/${packId}_preview.json`, 'utf8'));
        } catch {
          // not on disk
        }
      }
    }

    // 3. In-memory cache
    if (!text) {
      const cached = packCache.get(storageKey) ?? packCache.get(`${packId}_preview.json`);
      if (cached) text = await cached;
    }

    // 4. Network (using storagePath when available to avoid key mismatch)
    if (!text) {
      const remoteKey = storagePath ?? storageKey;
      text = await fetchFromSupabase(remoteKey);
      validatePackText(text);
      if (rnfs) {
        const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
        await rnfs.mkdir(packDir).catch(() => {});
        await rnfs.writeFile(`${packDir}/${packId}.json`, encodeForDisk(text), 'utf8').catch(() => {});
      }
      packCache.set(storageKey, Promise.resolve(text));
    }

    return (JSON.parse(text) as { puzzles: RawPuzzle[] }).puzzles;
  } catch (e) {
    console.error('[packs] getPuzzlesForPack failed:', packId, e);
    return null;
  }
}
```

---

## Phase 2 — Extend Prefetch Engine (`src/packs/prefetch.ts`) ✅

Add catalog-aware prefetch functions alongside the existing `prefetchStreaks`. The tiered approach means streaks run first (fastest, always needed), then free packs, then owned packs, then previews.

```typescript
// src/packs/prefetch.ts  (full replacement)

import { supabase } from '../supabase';
import { packMetaStorage } from '../mmkv';
import { refreshStreakFile, prefetchPackFile, cachePackPreview } from './index';
import type { StreakType, PackCatalogItem, Entitlements } from '../types';

const STREAK_TYPES: StreakType[] = ['daily', 'weekly', 'monthly'];

export async function prefetchStreaks(): Promise<void> {
  await Promise.allSettled(
    STREAK_TYPES.map(async type => {
      const storageKey = `${type}.json`;
      try {
        const { data, error } = await supabase.storage.from('packs').info(storageKey);
        if (error) return;
        const remoteEtag = data?.etag;
        const cachedEtag = packMetaStorage.getString(`etag:${storageKey}`);
        if (remoteEtag && remoteEtag === cachedEtag) return;
        await refreshStreakFile(storageKey);
      } catch {
        // Silently skip — disk cache handles this type
      }
    }),
  );
}

/**
 * Downloads and caches the full content for all free packs.
 * Skips packs with no storagePath. Runs in parallel; one failure
 * does not abort others.
 */
export async function prefetchFreePacks(catalog: PackCatalogItem[]): Promise<void> {
  const freePacks = catalog.filter(p => p.isFree && p.storagePath);
  await Promise.allSettled(
    freePacks.map(pack =>
      prefetchPackFile(pack.id, pack.storagePath!).catch(() => {}),
    ),
  );
}

/**
 * Downloads full content for packs the user has purchased (but not yet cached).
 * Premium users get all non-free packs. Individual pack owners get their packs.
 */
export async function prefetchOwnedPacks(
  catalog: PackCatalogItem[],
  entitlements: Entitlements,
): Promise<void> {
  const packs = catalog.filter(p => {
    if (!p.storagePath || p.isFree) return false;
    if (entitlements.isPremium) return true;
    return entitlements.ownedPackIds.includes(p.id);
  });
  await Promise.allSettled(
    packs.map(pack =>
      prefetchPackFile(pack.id, pack.storagePath!).catch(() => {}),
    ),
  );
}

/**
 * Caches the first puzzle of each unpurchased paid pack for preview thumbnails.
 * Does not overwrite full packs. Runs at lowest priority.
 */
export async function prefetchPaidPackPreviews(
  catalog: PackCatalogItem[],
  entitlements: Entitlements,
): Promise<void> {
  const packs = catalog.filter(p => {
    if (!p.storagePath || p.isFree) return false;
    if (entitlements.isPremium) return false;
    return !entitlements.ownedPackIds.includes(p.id);
  });
  await Promise.allSettled(
    packs.map(pack =>
      cachePackPreview(pack.id, pack.storagePath!).catch(() => {}),
    ),
  );
}

/**
 * Runs a full ETag-aware refresh of all catalog packs and streaks.
 * Respects ownership: free/owned = full download, unowned = preview only.
 */
export async function prefetchAllCatalog(
  catalog: PackCatalogItem[],
  entitlements: Entitlements,
): Promise<void> {
  await Promise.allSettled([
    prefetchStreaks(),
    prefetchFreePacks(catalog),
    prefetchOwnedPacks(catalog, entitlements),
    prefetchPaidPackPreviews(catalog, entitlements),
  ]);
}

// Debounced wrapper so rapid app-foreground events collapse into one run.
// The catalog + entitlements snapshot is captured at schedule time.
let _prefetchTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePrefetch(
  catalog?: PackCatalogItem[],
  entitlements?: Entitlements,
): void {
  if (_prefetchTimer) return;
  _prefetchTimer = setTimeout(() => {
    _prefetchTimer = null;
    if (catalog && entitlements) {
      prefetchAllCatalog(catalog, entitlements).catch(() => {});
    } else {
      prefetchStreaks().catch(() => {});
    }
  }, 2000);
}
```

---

## Phase 3 — Tiered Startup Orchestration (`App.tsx`) ✅

Replace the naive subscription warm-up with a tiered approach. Tier 1 (streaks) is already gating the splash screen. Tiers 2–4 run after the splash in the background.

```typescript
// App.tsx  (replace the useEffect body sections related to packs)

useEffect(() => {
  adapty.activate(ADAPTY_SDK_KEY).catch(() => {});

  // Tier 1: Streak packs — gate splash screen on these
  const streakReady = Promise.all([
    getStreakPack('daily'),
    getStreakPack('weekly'),
    getStreakPack('monthly'),
  ]);

  Promise.race([
    streakReady,
    new Promise<void>(resolve => setTimeout(resolve, 3000)),
  ])
    .catch(() => {})
    .then(() => BootSplash.hide({ fade: true }).catch(() => {}));

  // After streaks, kick off tiered background downloads.
  // We capture catalog + entitlements at the moment they become available.
  streakReady.catch(() => {}).then(() => {
    purgeStalePacks().catch(() => {});

    const { packCatalog, entitlements } = useEntitlementsStore.getState();
    if (packCatalog.length > 0) {
      // Catalog already in store (PowerSync loaded from local SQLite)
      runTieredPrefetch(packCatalog, entitlements);
    }
  });

  useSettingsStore.getState().initialize();

  db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 });

  const watchController = new AbortController();

  db.watch(
    'SELECT id FROM packs WHERE published = 1 LIMIT 1',
    [],
    {
      onResult: async () => {
        await useEntitlementsStore.getState().loadPackCatalog();
        // After catalog loads, run tiered prefetch
        const { packCatalog, entitlements } = useEntitlementsStore.getState();
        runTieredPrefetch(packCatalog, entitlements);
      },
    },
    { signal: watchController.signal },
  );

  db.watch(
    'SELECT * FROM user_entitlements LIMIT 1',
    [],
    {
      onResult: () => {
        const userId = useAuthStore.getState().user?.id;
        if (userId) useEntitlementsStore.getState().loadEntitlements(userId);
      },
    },
    { signal: watchController.signal },
  );

  const authUnsub = useAuthStore.subscribe((state, prevState) => {
    const userId = state.user?.id;
    if (userId && userId !== prevState.user?.id) {
      useEntitlementsStore.getState().loadEntitlements(userId);
    }
  });

  const appStateSub = AppState.addEventListener('change', async nextState => {
    if (nextState === 'active') {
      await supabase.auth.refreshSession();
      // Pass current catalog + entitlements to the debounced refresh
      const { packCatalog, entitlements } = useEntitlementsStore.getState();
      schedulePrefetch(packCatalog, entitlements);
    }
  });

  const linkingSub = Linking.addEventListener('url', ({ url }) => {
    useAuthStore.getState().handleDeepLink(url);
  });

  useAuthStore.getState().initialize();

  return () => {
    authUnsub();
    watchController.abort();
    appStateSub.remove();
    linkingSub.remove();
  };
}, []);
```

Add `runTieredPrefetch` as a module-level helper in `App.tsx` (above the component):

```typescript
// App.tsx  (above the App component)

import {
  prefetchFreePacks,
  prefetchOwnedPacks,
  prefetchPaidPackPreviews,
  schedulePrefetch,
} from './src/packs/prefetch';
import type { PackCatalogItem, Entitlements } from './src/types';

function runTieredPrefetch(
  catalog: PackCatalogItem[],
  entitlements: Entitlements,
): void {
  // Tier 2: Free packs — download full content
  prefetchFreePacks(catalog).catch(() => {});

  // Tier 3: Owned / premium packs — download full content
  prefetchOwnedPacks(catalog, entitlements).catch(() => {});

  // Tier 4: Unpurchased paid packs — first puzzle preview only (lowest priority)
  prefetchPaidPackPreviews(catalog, entitlements).catch(() => {});
}
```

---

## Phase 4 — Entitlements-Triggered Downloads ✅

> **Implementation note**: moved to `App.tsx` via a `useEntitlementsStore.subscribe` callback rather than modifying `entitlementsStore.ts`. This avoids a circular dependency (`entitlementsStore` → `packs/prefetch` → back to `entitlementsStore` via store reads). The subscription detects `isPremium` flip and new `ownedPackIds` entries, then calls `runTieredPrefetch`.

### Original plan target: `src/stores/entitlementsStore.ts`

When entitlements change (premium purchase or pack purchase), trigger downloads for the newly accessible content. This ensures content is ready before the user navigates to a pack.

```typescript
// src/stores/entitlementsStore.ts  (update loadEntitlements)

import { prefetchOwnedPacks, prefetchPaidPackPreviews } from '../packs/prefetch';

loadEntitlements: async (userId: string) => {
  const entRow = await db.getOptional<{
    is_premium: number;
    premium_purchased_at: string | null;
    owned_pack_ids: string;
  }>('SELECT * FROM user_entitlements WHERE user_id = ?', [userId]);

  const entitlements: Entitlements = entRow
    ? {
        isPremium: entRow.is_premium === 1,
        premiumPurchasedAt: entRow.premium_purchased_at ?? undefined,
        ownedPackIds: parseJsonArray(entRow.owned_pack_ids),
      }
    : DEFAULT_ENTITLEMENTS;

  const prev = get().entitlements;
  set({ entitlements });

  // Trigger background downloads for newly accessible packs
  const { packCatalog } = get();
  if (packCatalog.length === 0) return;

  const becamePremium = !prev.isPremium && entitlements.isPremium;
  const newOwnedPacks = entitlements.ownedPackIds.filter(
    id => !prev.ownedPackIds.includes(id),
  );

  if (becamePremium || newOwnedPacks.length > 0) {
    prefetchOwnedPacks(packCatalog, entitlements).catch(() => {});
    // Re-evaluate previews now that ownership changed
    prefetchPaidPackPreviews(packCatalog, entitlements).catch(() => {});
  }
},
```

---

## Phase 5 — Fix `getPuzzlesForPack` Call Sites ✅

The App.tsx currently calls `getPuzzlesForPack(pack.id)` without passing `storagePath`. Update all call sites to pass the `storagePath` from the catalog so the Supabase download uses the correct key.

**HomeScreen** (wherever it calls `getPuzzlesForPack` or loads thumbnails):

```typescript
// Before
const puzzles = await getPuzzlesForPack(pack.id);

// After
const puzzles = await getPuzzlesForPack(pack.id, pack.storagePath);
```

**LibraryScreen** (same pattern):

```typescript
// Before
const puzzles = await getPuzzlesForPack(packId);

// After — packId comes from route params; storagePath comes from packCatalog
const catalogItem = packCatalog.find(p => p.id === packId);
const puzzles = await getPuzzlesForPack(packId, catalogItem?.storagePath);
```

Remove the old subscription in `App.tsx` that calls `getPuzzlesForPack` for all packs — this is now replaced by the tiered prefetch:

```typescript
// App.tsx  — DELETE this block entirely (the tiered prefetch handles it now)
const unsubPacks = useEntitlementsStore.subscribe(
  (state, prevState) => {
    if (state.packCatalog === prevState.packCatalog) return;
    const { packCatalog: catalog } = state;
    if (catalog.length === 0) return;
    for (const pack of catalog) getPuzzlesForPack(pack.id);
    unsubPacks();
  },
);
```

---

## Phase 6 — Premium Purchase Downloads (`src/utils/payments.ts`) ✅

After a premium purchase, all paid packs should be downloaded eagerly. The user just paid — they expect everything to work offline immediately.

```typescript
// src/utils/payments.ts  (update purchasePremium)

import { prefetchOwnedPacks } from '../packs/prefetch';
import { useEntitlementsStore } from '../stores/entitlementsStore';

export async function purchasePremium(): Promise<boolean> {
  const products = await getProducts();
  const product = products.find(p => p.vendorProductId === 'sb_premium_599');
  if (!product) throw new Error('Premium product not found in paywall');

  const result = await adapty.makePurchase(product);
  if (result.type === 'success') {
    if (!(result.profile.accessLevels?.premium?.isActive ?? false)) {
      throw new Error('Purchase recorded but access not yet active. Please use Restore Purchases.');
    }
    useEntitlementsStore.getState().setIsPremium(true);

    // Download all paid packs in the background — user is now premium
    const { packCatalog } = useEntitlementsStore.getState();
    const premiumEntitlements = { isPremium: true, ownedPackIds: [] };
    prefetchOwnedPacks(packCatalog, premiumEntitlements).catch(() => {});

    return true;
  }
  throw new Error('Purchase did not complete. Please try again.');
}
```

---

## Type Changes (`src/types.ts`)

No new types are needed. The existing `PackCatalogItem` and `Entitlements` types already cover everything required by the new prefetch functions.

---

## Execution Order Summary

```
App cold-start (online)
│
├── T+0ms    warmStreakPackCaches()          → daily/weekly/monthly in memory
├── T+0ms    PowerSync connects              → local SQLite available immediately
├── T+0ms    packs watch fires               → loadPackCatalog() → packCatalog set
├── T+0ms    user_entitlements watch fires   → loadEntitlements() → entitlements set
│
├── T+splash  BootSplash.hide()              → after streaks ready or 3s
│
├── T+bg     prefetchFreePacks()            → ETag check → download if stale
├── T+bg     prefetchOwnedPacks()           → ETag check → download if stale
├── T+bg     prefetchPaidPackPreviews()     → ETag check → first puzzle only
│
├── T+2000ms schedulePrefetch() fires       → ETag refresh for all content
│
App foreground restore
│
└── T+fg     schedulePrefetch(catalog, ent) → debounced ETag refresh for all
```

```
App cold-start (offline, previously synced)
│
├── T+0ms    PowerSync uses local SQLite     → packCatalog available immediately
├── T+0ms    All packs watch fires           → loadPackCatalog() succeeds
├── T+0ms    All entitlements watch fires    → loadEntitlements() succeeds
│
├── T+splash BootSplash.hide()              → streak packs hit disk cache ✅
│
├── T+bg     prefetchFreePacks()            → ETag check fails (offline) → no-op
├── T+bg     prefetchOwnedPacks()           → ETag check fails (offline) → no-op
│
All navigation: disk cache hit → instant ✅
```

---

## Testing Checklist

- [ ] Cold-start online: all 3 streak files downloaded and in memory before splash hides
- [ ] Cold-start offline: splash hides within 3s, streaks load from disk, free pack thumbnails render from disk
- [ ] First open after install (no disk cache): streaks download, free packs download, paid pack previews available
- [ ] Premium purchase: all paid packs begin downloading immediately in the background
- [ ] Pack purchase: full content downloads and pack is playable before `purchasePack()` resolves (already the case via `downloadPack` in `payments.ts`)
- [ ] Foreground restore: `schedulePrefetch` fires, ETag check skips unchanged files, re-downloads changed files
- [ ] 90-day purge: old non-streak pack files removed; streak files never touched
- [ ] ETag match: no redundant downloads when content unchanged
- [ ] Concurrent calls to same pack: `packCache` shared promise ensures only one download

---

## Risk Notes

**Bandwidth on first run**: Downloading all free packs eagerly on first install uses bandwidth. If free packs are large (>500KB each), consider adding a WiFi-only mode or deferring Tier 4 (previews) to only run on WiFi.

**storagePath null**: Some catalog entries may have `storagePath: undefined`. Both `prefetchPackFile` and `cachePackPreview` filter out null paths — these packs simply won't be pre-cached and will fall back to on-demand network fetch.

**Race condition (catalog + entitlements)**: `runTieredPrefetch` is called both from the packs watch and after streaks warm up. The second call will be a no-op for any packs already in the cache (ETag match), so double-calling is safe.

**Preview → full upgrade**: `cachePackPreview` skips its work if a full pack file already exists on disk. After purchase, `prefetchPackFile` overwrites the disk entry with full content. The preview memory cache entry (`${packId}_preview.json`) becomes stale — but `getPuzzlesForPack` prefers the full pack on disk, so correctness is preserved.
