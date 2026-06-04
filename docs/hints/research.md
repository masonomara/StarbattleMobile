# Hints Delivery — M1 Research (separate file, disk-cached + prefetched)

> Written 2026-06-04. Deep study of every moving part touching puzzle hints, in service of
> implementing **M1**: deliver hints as a standalone `{packId}-hints.json` file that is
> **disk-cached and prefetched exactly like the pack file**, read from disk at hint time.
>
> Scope: `src/packs/*`, `src/screens/PuzzleScreen.tsx`, `src/stores/puzzleStore.ts`,
> `src/components/Toolbar.tsx`, `src/hooks/*`, `src/powersync/AppSchema.ts`, `src/types.ts`,
> the `packs/` build scripts, and the staged `pack_hints` work. This is a findings/architecture
> document, not an implementation — but §10 is a concrete file-by-file change map.

---

## 0. Executive summary

**The original "hints never loaded" bug is a caching asymmetry, not an architecture problem.**
Packs persist to disk (`react-native-fs`, `DocumentDirectory/packs/{id}.json`) and are read
disk-first. Hints, by contrast, lived **only in an in-memory `Map`** and were fetched live with a
**10-second timeout** on every cold start. So hints never survived an app restart, always re-fetched,
and failed outright offline. (See §5 for the exact original code.)

**M1 fixes it by giving the hints file full parity with the pack file:** same disk cache, same
ETag-aware prefetch, same disk-first read. The `{packId}-hints.json` files **already exist in
Storage** (uploaded by `packs/split-hints.js`), and the original code **already fetched them** —
the only missing pieces are (a) write them to disk, (b) prefetch them to disk alongside packs, and
(c) read them from disk at hint time.

**This supersedes the staged `pack_hints` PowerSync table** (see §6), which contradicts the
generator's own `pack-format.md` ("there is no puzzle database table"), syncs the entire hint corpus
to every device, and is the reason hints don't show today (its sync rules were never wired). M1
deletes that work.

**Critical constraint discovered:** the home screen builds previews from **full pack files**
(`usePackPreviews` → `getStreakPack`/`getPuzzlesForPack`), and the splash waits on those. Therefore
hints must **never** ride inside the pack file or on the preview path — keeping them in a separate,
lazily-needed file is what keeps the splash fast. This is the core reason M1 (separate file) beats
bundling.

---

## 1. The two data planes (where hints belong)

The app already splits content across two independent systems. Hints belong to the **Storage** plane.

| Plane | Mechanism | Source of truth | Holds | Persistence / offline |
|---|---|---|---|---|
| **PowerSync** | `db` (op-sqlite mirror of Postgres) | Postgres (synced) | Catalog metadata (`packs`), `puzzle_progress`, `streaks`, `user_entitlements`, `streak_archive` | Local SQLite (`starbattle.db`), survives offline |
| **Supabase Storage** (`packs` bucket) | `supabase.storage.from('packs').download()` → RNFS disk cache + in-memory `Map` | Storage objects | Pack puzzle JSON `{id}.json` (SBN + solution), **hint files `{id}-hints.json`** | RNFS `DocumentDirectory/packs/`, survives offline |

`packs` table row = metadata only (`src/stores/entitlementsStore.ts:7-18`, `src/powersync/AppSchema.ts:10-22`).
The actual puzzle content (and hints) is **never** in PowerSync — it's downloaded Storage JSON.
M1 keeps hints in the Storage plane, as their own file.

---

## 2. Current pack pipeline (as-built) — the machinery M1 mirrors

Files: `src/packs/{packStorage,packFetcher,packCache,index,prefetch}.ts`.

### 2.1 Disk + memory caching (`packFetcher.ts`, `packCache.ts`, `packStorage.ts`)

- **`fetchPack(localKey, remoteKey?)`** — `packFetcher.ts:73-120`. The disk-first read:
  1. If RNFS available, read `DocumentDirectoryPath/packs/{localKey}` → `decodeFromDisk` → return.
     Evicts and refetches if `pack.version < PACK_MIN_VERSION` (`= 2`, `packFetcher.ts:13`,`91-95`).
  2. On disk miss → `fetchFromSupabase(remoteKey)` → `validatePackText` → write to disk → return.
  3. No-RNFS fallback (e.g. tests): fetch direct, no disk (`packFetcher.ts:117-119`).
- **`fetchFromSupabase(storageKey)`** — `packFetcher.ts:46-57`. `supabase.storage.from('packs').download()`
  → Blob → text. **Requires an authenticated JWT** (anon is fine); the bucket policy 404s without one
  (`App.tsx:44-46`).
- **`validatePackText(text)`** — `packFetcher.ts:26-36`. Asserts `puzzles[]` non-empty and each `sbn`
  matches `/^\d+x\d+\./`. Throws before caching tampered/malformed content. **M1 needs a hints analog.**
- **`loadPack(localKey, remoteKey?)`** — `packCache.ts:22-31`. Module-level in-memory `Map<string, Promise<Pack>>`;
  dedupes concurrent callers; evicts the entry on failure so the next call retries. Never re-reads disk
  once warm (`packCache.ts:4-12` note).
- **`packStorage.ts`** — `getRNFS()` (null in non-native envs), `assertSafeKey()` (path-traversal guard,
  `:16-20`), `encodeForDisk`/`decodeFromDisk` (**currently passthrough**, explicitly flagged as the seam
  for a future compression/encryption layer, `:22-34`). **This is the on-disk gzip hook if we want it.**

### 2.2 ETag-aware prefetch (`index.ts`, `prefetch.ts`)

- **`prefetchPackFile(packId, storagePath)`** — `index.ts:71-121`. Stat disk; fetch remote ETag via
  `fetchPackEtag` (`packFetcher.ts:61-69`, `storage.info()`); **skip if on disk AND ETag matches the
  MMKV-cached ETag**; else download → validate → write disk → `warmPackCache` → store ETag. Always
  downloads if missing from disk. **M1 mirrors this for hints.**
- **`cachePackPreview(packId, storagePath)`** — `index.ts:126-194`. For **inaccessible** packs only:
  downloads the full pack, slices `puzzles[0..1]`, writes `{packId}_preview.json`. NOTE: it downloads
  the **whole** pack to make the preview — so **keeping packs slim keeps previews cheap** (a reason
  hints must not be bundled).
- **ETag store** — `getCachedEtag`/`setCachedEtag` (`packFetcher.ts:38-44`) in a dedicated MMKV instance
  `packMetaStorage` (`src/mmkv.ts:12`), keyed `etag:{storageKey}`. M1 reuses this with key
  `etag:{packId}-hints.json`.
- **`prefetchAllCatalog(catalog)`** — `prefetch.ts:12-24`. For each catalog entry **with a `storagePath`**:
  if `hasPackAccess(id)` → `prefetchPackFile` (full); else → `cachePackPreview`. `Promise.allSettled`
  (one failure never aborts others). **Access check delegates to `useEntitlementsStore.hasPackAccess`**
  (`entitlementsStore.ts:124-131`: premium → all; else owned or free).

### 2.3 Prefetch triggers (`App.tsx`)

`runTieredPrefetch(catalog)` → `prefetchAllCatalog` fires on:
1. **Catalog load** after first PowerSync sync — `App.tsx:78-89` (`db.watch` on `packs`).
2. **Entitlement change** (purchase / premium) — `App.tsx:114-127`.
3. **Foreground** (`AppState` → active) — `App.tsx:132-138`.

Separately, **streak packs are warmed explicitly** at startup: `getStreakPack('daily'|'weekly'|'monthly')`
after auth resolves — `App.tsx:51-60`. (Streak packs are loaded by name, not via catalog `storagePath`.)

### 2.4 Pack read paths

- **Library**: `getPuzzlesForPack(packId, storagePath)` — `index.ts:14-34`. Tries full pack
  (`loadPack(localKey, remoteKey)`), falls back to `{packId}_preview.json`. Returns `RawPuzzle[]`.
- **Streak**: `getStreakPack(type)` — `index.ts:36-43`. `loadPack('{type}.json')` — the full streak pack.

---

## 3. How hints are consumed (the read side)

### 3.1 Data shapes (`src/types.ts`)

- **`HintStep`** — `types.ts:143-148`: `{ rule: string; level: number; placements: Coord[]; marks: Coord[] }`.
- **`RawPuzzle`** — `types.ts:156-160`: `{ sbn; solution; hints?: HintStep[] }`. The `hints?` is optional —
  **slim packs omit it**, so `parsePuzzle` yields `puzzle.hints = []` and hints come from elsewhere.
- **`Puzzle`** — `types.ts:162-171`: includes `hints: HintStep[]` (non-optional, defaults `[]`).
- **`PackData`** — `types.ts:188-200`: `effectivePackId` (streakType for streaks, catalog id for
  library) + `puzzleIndexInPack` (0-based position). **These two are the hint lookup key.**
- **`PackHintsRow`** — `types.ts:150-154`: staged `pack_hints` artifact, **to delete** (§6).

### 3.2 `parsePuzzle` (`src/utils/parsePuzzle.ts:65`)

Sets `hints: (raw.hints ?? []) as HintStep[]`. For slim packs (no inline hints) this is `[]`, so the
hint button starts empty and `hintsLoading` starts `true` (below). Hints are injected later via `setHints`.

### 3.3 `puzzleStore` (`src/stores/puzzleStore.ts`)

- **`loadPuzzle(puzzle)`** — `:98-130`. Sets `hintsLoading: puzzle.hints.length === 0` (`:114`). So a
  slim-pack puzzle begins with `hintsLoading = true` → toolbar shows a spinner.
- **`setHints(hints)`** — `:434-439`. `puzzle.hints = hints; hintsLoading = false`. **The injection point.**
  Must be called with `[]` on failure too, or the spinner spins forever.
- **`showHint()`** — `:400-428`. Scans `puzzle.hints` for the first step whose `placements`/`marks` aren't
  already satisfied on the board; sets `hintGhosts`. Pure consumer of `puzzle.hints`; path-agnostic.

### 3.4 `Toolbar` (`src/components/Toolbar.tsx`)

- `hasHints = puzzle.hints.length > 0` (`:35`), `hintsLoading` (`:36`).
- `hintDisabled = completed || hintsLoading` (`:44`); spinner while `hintsLoading` (`:92-96`).
- `handleHint` (`:53-59`): if `hasHints` → `showHint`; else `Alert('Hints Unavailable', 'Hints could not
  be loaded. Check your connection…')`. **So a hard offline-with-no-cache miss surfaces this alert** —
  acceptable, and M1 makes it rare (prefetch + disk cache).

### 3.5 `PuzzleScreen` (`src/screens/PuzzleScreen.tsx`)

- Resolves `packData` via `usePackData` (`:54`), destructures `effectivePackId`, `puzzleIndexInPack`,
  `streakType` (`:56-65`).
- Parses + loads the puzzle, sets `isReady` (`:165-174`).
- **Currently calls `usePuzzleHints(effectivePackId, puzzleIndexInPack, isReady)`** (`:179`) — the staged
  `pack_hints` watch. **M1 replaces this** with a disk-cached read effect (see §10).

### 3.6 Streak indexing (`src/utils/streakDate.ts`)

`getPuzzleIndex(type, packSize, date)` (`:51-73`) maps a date → 0-based puzzle position
(daily: `daysSinceEpoch % size`; weekly: `/7`; monthly: month math). `usePackData` sets
`puzzleIndexInPack = getPuzzleIndex(...)` for streaks (`usePackData.ts:49,65`). Archive puzzles use a
different date → different index, **same hints file**. So `{type}-hints.json[index]` covers today **and**
archive days uniformly.

---

## 4. The hint file format (already produced & uploaded)

`packs/split-hints.js` (the generator-side splitter) emits two files per pack and uploads both to the
`packs` Storage bucket:

- `{packId}.json` — **slim**: `{ ...meta, version: 2, puzzles: [{ sbn, solution }] }` (hints stripped,
  `split-hints.js:106-113`).
- `{packId}-hints.json` — **hints**: `{ version: 1, hints: HintStep[][] }`, where `hints[i]` aligns with
  `puzzles[i]` (`split-hints.js:115-118`). Alignment is asserted (`:123-133`).

Key facts for M1:
- **The `-hints.json` files already exist in Storage** (assuming `split-hints.js` has been run) — M1
  needs **no new generator output**, only to consume them from disk.
- Indexed by **puzzle position** — matches `puzzleIndexInPack` exactly.
- Streak files are `daily-hints.json` / `weekly-hints.json` / `monthly-hints.json`.
- `split-hints.js` currently **also** upserts the `pack_hints` table (`:72-99,160`) — that addition is
  reverted in M1 (§6); the file-upload half stays.

---

## 5. The original hint implementation (the bug, verbatim from `git show HEAD`)

Before the staged `pack_hints` work, hints worked like this (`packCache.ts` @ HEAD):

```ts
const hintsCache = new Map<string, Promise<HintStep[][]>>();   // IN-MEMORY ONLY

// loadPack side-effect: fire loadPackHints for every non-preview pack
loadPackHints(hintId).catch(...)                               // packCache.ts loadPack()

async function fetchPackHints(packId) {
  const text = await Promise.race([
    fetchFromSupabase(`${packId}-hints.json`),
    timeout(10_000),                                           // 10s HARD TIMEOUT
  ]);
  return (JSON.parse(text)).hints;                             // HintStep[][]
}

export function loadPackHints(packId) {                        // memory-cache wrapper
  const cached = hintsCache.get(packId); if (cached) return cached;
  const promise = fetchPackHints(packId);
  hintsCache.set(packId, promise);
  promise.catch(() => hintsCache.delete(packId));
  return promise;
}
```

`index.ts` @ HEAD exported `loadPackHints` and `prefetchHintsFile` (which just called `loadPackHints`
to warm the **in-memory** cache); `prefetch.ts` @ HEAD called `prefetchHintsFile(p.id)` for accessible
packs; `PuzzleScreen` @ HEAD did `loadPackHints(effectivePackId).then(all => setHints(all[idx]))
.catch(() => setHints([]))`.

**Why it failed:**
1. **No disk persistence.** `hintsCache` is a module-level `Map` — empty on every cold start. Unlike
   packs (disk-backed via `fetchPack`), hints were re-fetched from network every launch.
2. **10s live fetch on the hot path.** First hint after launch waited on a network download (a whole
   pack's hint array — up to MBs) with a 10s ceiling.
3. **Offline = no hints, ever.** No disk copy to fall back to; the fetch just failed → `setHints([])` →
   "Hints Unavailable".
4. **`prefetchHintsFile` only warmed memory** — evaporated on restart, so it didn't help cold start or
   offline.

M1's entire job: **make this disk-backed.** The shape of `loadPackHints`/`prefetchHintsFile` is right;
the storage tier is wrong.

---

## 6. The staged `pack_hints` work (to remove)

The current **staged** changes (`git diff --cached`) moved hints into a PowerSync table. This is being
**abandoned** because: it contradicts the generator's `pack-format.md` ("there is no puzzle database
table"); it syncs the **entire** hint corpus to **every** device globally (worst data cost of any
option); and it's why hints don't show today (the dashboard sync rules for `pack_hints` were never
added — the migration's own NOTE flags this as a separate manual step).

Removal inventory:

| File | Staged change | M1 action |
|---|---|---|
| `src/powersync/AppSchema.ts:71-84,92` | Added `pack_hints` Table + schema entry | **Remove** table + schema entry |
| `src/hooks/usePuzzleHints.ts` | New file — `db.watch` on `pack_hints` | **Delete file** |
| `src/types.ts:150-154` | Added `PackHintsRow` | **Remove** |
| `src/screens/PuzzleScreen.tsx:30,179` | Import + call `usePuzzleHints` | **Replace** with disk-cached hint effect (§10) |
| `src/packs/prefetch.ts:18` | Replaced hint prefetch with a comment | **Re-add** `prefetchHintsFile` (disk version) |
| `src/packs/packCache.ts` | Removed `loadPackHints`/`fetchPackHints`/`hintsCache` | **Re-add** as a **disk-cached** loader (§10) |
| `src/packs/index.ts` | Removed `loadPackHints`/`prefetchHintsFile` exports | **Re-add**, pointing at disk loader |
| `supabase/migrations/0005_pack_hints.sql` | New migration (table, RLS, publication) | **Delete** (never applied → simple delete; if applied, drop the table) |
| `packs/split-hints.js:72-99,160` | Added `upsertPackHints` to the splitter | **Remove** the upsert; keep the two file uploads |
| `packs/populate-pack-hints.js` | New backfill script for `pack_hints` | **Delete** |
| PowerSync dashboard | (sync rules for `pack_hints`) | **Remove** if added (likely never was) |

---

## 7. M1 target architecture

**Principle: the hints file is a first-class cached artifact, identical in lifecycle to the pack file,
but on a separate path that never touches previews/splash.**

### 7.1 New / restored functions (mirroring the pack machinery)

| Concern | Pack (exists) | Hints (M1) |
|---|---|---|
| Disk-first fetch | `fetchPack(localKey, remoteKey)` | `fetchHints(packId)` → read `{packId}-hints.json` from disk; else download + validate + write |
| Memory dedup cache | `loadPack` + `packCache` Map | `loadPackHints(packId)` + a `hintsCache` Map of `Promise<HintStep[][]>` |
| ETag prefetch | `prefetchPackFile(id, storagePath)` | `prefetchHintsFile(id)` → stat disk, compare `etag:{id}-hints.json`, skip/download/write |
| Validation | `validatePackText` | `validateHintsText` → assert `{ hints: any[][] }` shape |
| Disk I/O | `packStorage` (`{id}.json`) | same dir/helpers, file `{id}-hints.json` |
| ETag store | `packMetaStorage` `etag:{id}.json` | `packMetaStorage` `etag:{id}-hints.json` |

### 7.2 Read path (restores the original `PuzzleScreen` effect)

```
isReady && effectivePackId →
  loadPackHints(effectivePackId)                 // disk-first, dedup
    .then(all => setHints(all[puzzleIndexInPack] ?? []))
    .catch(() => setHints([]))                    // clears hintsLoading even on miss
```

`loadPackHints` reads disk (instant, offline) when prefetched; downloads once otherwise; caches in
memory + disk. `setHints` flips `hintsLoading=false` and populates `puzzle.hints`; `showHint`/`Toolbar`
work unchanged.

### 7.3 Prefetch path (restores hint warming, now to disk)

- `prefetchAllCatalog`: for each accessible pack, fire `prefetchHintsFile(p.id)` alongside
  `prefetchPackFile` (background, `.catch` swallowed). Inaccessible packs get no hints (consistent with
  preview-only access).
- **Streaks**: `App.tsx` streak warming (`:51-60`) should also warm streak hints
  (`loadPackHints('daily'|'weekly'|'monthly')`), because streaks may not flow through the `storagePath`
  filter in `prefetchAllCatalog` (`prefetch.ts:15`). **Open item — see §9.**

---

## 8. End-to-end scenarios under M1

| Scenario | Pack | Hints | Hint tap |
|---|---|---|---|
| **Cold launch, online** | Catalog syncs (PowerSync) → prefetch downloads slim packs (small) → previews/splash fast | Prefetch downloads `{id}-hints.json` to disk in background (after reveal) | If hints on disk → instant; else one-time download on open |
| **Warm launch (any net)** | Disk hit, instant | Disk hit, instant | Instant, offline |
| **Offline, returning user** | Slim pack on disk → plays | Hints on disk (prefetched earlier) → **full hints offline** | Instant, offline ✅ (this is the scenario the user cares about) |
| **Offline, cold first launch** | No auth (anon needs network) → nothing downloads → unplayable | n/a | n/a (same limit as packs) |
| **Install online, don't open puzzles, go offline** | Prefetch already pulled packs **and hints** to disk | ✅ available — **no "open it first" requirement** | Instant, offline ✅ |
| **Hint tap, hints missing (never cached, offline)** | — | `loadPackHints` rejects → `setHints([])` | `hintsLoading` clears; tap → "Hints Unavailable" alert (rare) |
| **Pack content update** | New ETag on `{id}.json` → prefetch re-downloads | New ETag on `{id}-hints.json` → prefetch re-downloads | Reflects new hints next session |
| **Purchase unlocks a paid pack** | Entitlement change → prefetch full pack | Same trigger → `prefetchHintsFile` | Works after background fetch |
| **Streak rotation (new day)** | `getStreakPack` already cached | `daily-hints.json[newIndex]` already in the cached file | Instant |
| **Archive streak puzzle** | Same streak pack | Same hints file, different index | Instant |

Splash impact: **none** — hints are off the `usePackPreviews` path; the splash only ever waits on slim
packs (previews) + PowerSync catalog/user data.

---

## 9. Interdependencies, edge cases & risks

1. **Auth gating.** Hint downloads use `supabase.storage.download()`, which needs an authenticated JWT
   (`App.tsx:44-46`). Same constraint as packs; no new auth work, but offline-cold-first-launch has no
   hints (and no packs — moot).
2. **Slim-pack ↔ hints-file alignment.** Hints are indexed by puzzle position; if the slim pack and its
   hints file are regenerated out of sync (different puzzle order/count), `all[idx]` mis-maps.
   `split-hints.js:123-133` asserts alignment at build; M1 should also **bounds-check** `all[idx]` (fall
   back to `[]`).
3. **Version skew.** Slim packs gate on `PACK_MIN_VERSION = 2` (evict + refetch). The hints file has its
   own `version: 1` and **no eviction gate**. If the hint format changes, stale hint files won't be
   force-evicted — only ETag changes refresh them. **Decision:** add a `HINTS_MIN_VERSION` gate, or rely
   on ETag + re-running `split-hints.js` (new upload → new ETag → refresh). ETag is probably enough.
4. **Streak prefetch coverage.** `prefetchAllCatalog` only iterates catalog entries with `storagePath`
   (`prefetch.ts:15`). Confirm streak catalog rows carry `storage_path`; if not, streak **hints** won't
   prefetch via that path. Mitigation: warm streak hints explicitly in `App.tsx:51-60` alongside
   `getStreakPack`. **Verify which is true before implementing.**
5. **Daily hints download size.** `daily-hints.json` is large (~13.9 MB raw on the `solution-first`
   17×4/365 pack; ~2 MB gzipped). Prefetched in the background, cached once. **Decision (open):** prefetch
   always (simplest, fully offline) vs Wi-Fi-only vs today-only. Library hint files are small — always
   prefetch.
6. **gzip transport.** Serving `{id}-hints.json` with `Content-Encoding: gzip` shrinks the download
   ~6–8×. Must verify (a) Supabase Storage serves the header and (b) RN's `fetch`/`Blob` path in
   `fetchFromSupabase` decompresses transparently (it generally does). Disk would then store the
   **decompressed** JSON unless we also gzip on disk via the `encodeForDisk`/`decodeFromDisk` seam
   (`packStorage.ts:22-34`) — which needs a JS gunzip (e.g. `pako`) since RN has no `zlib`. **Likely:
   transport gzip only; leave disk uncompressed.**
7. **In-memory cache lifetime.** Like `packCache`, a `hintsCache` Map is never evicted except on failure
   (`packCache.ts:4-12`). Fine — content updates come through `prefetchHintsFile`'s ETag path, not
   `loadPackHints`. Keep the two caches separate so evicting a stale pack doesn't drop hints (the original
   design rationale, `packCache.ts` @ HEAD).
8. **`hintsLoading` must always resolve.** The `.catch(() => setHints([]))` is load-bearing: without it,
   a rejected hint load leaves the toolbar spinner forever (`Toolbar.tsx:44,92`). Preserve it.
9. **No-RNFS environments** (tests / non-native). `getRNFS()` returns null; `fetchHints` must fall back to
   a direct fetch (no disk), mirroring `fetchPack`'s `:117-119` branch, so it doesn't crash.
10. **Concurrent opens.** `loadPackHints` dedup (shared in-flight Promise) prevents double-downloads when
    a pack's puzzles are opened rapidly. Mirror `loadPack`'s pattern.
11. **Disk write failures** are swallowed in the pack path (`.catch(() => {})`, `index.ts:114-116`); a
    failed hint write just means a re-download next time. Acceptable; mirror it.
12. **Preview path must stay slim — permanently.** If hints ever get folded back into `{id}.json`,
    `usePackPreviews` → full-pack load would drag hint payload onto the splash. M1's separation is the
    guardrail; document it so it isn't undone.
13. **`cachePackPreview` downloads the full (slim) pack** to slice a preview (`index.ts:166-177`). Since
    M1 keeps packs slim, this stays cheap. (It does **not** fetch hints — previews never need them.)

---

## 10. Concrete change map

### App-side — remove (staged `pack_hints`)
See §6 table. Net: delete `usePuzzleHints.ts`, `populate-pack-hints.js`, migration `0005`; strip
`pack_hints` from `AppSchema.ts`; remove `PackHintsRow`; revert `split-hints.js` upsert.

### App-side — build (disk-cached hints)
1. **`src/packs/packFetcher.ts`** — add `fetchHints(packId): Promise<HintStep[][]>` (disk-first read of
   `{packId}-hints.json`, network fallback, write to disk) + `validateHintsText` + reuse
   `fetchPackEtag`/`getCachedEtag`/`setCachedEtag` with key `{packId}-hints.json`.
2. **`src/packs/packCache.ts`** — re-add `hintsCache: Map<string, Promise<HintStep[][]>>` +
   `loadPackHints(packId)` (dedup wrapper over `fetchHints`, evict-on-failure). Do **not** re-add the
   `loadPack` side-effect (it coupled pack loads to hint loads); prefer explicit prefetch + read.
3. **`src/packs/index.ts`** — re-export `loadPackHints`; add `prefetchHintsFile(packId)` (ETag-aware
   disk prefetch, mirror `prefetchPackFile` but for `{packId}-hints.json`; storage key derived as
   `${packId}-hints.json`, independent of the pack's `storagePath`).
4. **`src/packs/prefetch.ts`** — in the `hasPackAccess` branch, also call `prefetchHintsFile(p.id)`
   (background, swallow errors) alongside `prefetchPackFile`.
5. **`src/screens/PuzzleScreen.tsx`** — remove `usePuzzleHints`; restore the effect:
   `loadPackHints(effectivePackId).then(all => setHints(all[puzzleIndexInPack] ?? [])).catch(() => setHints([]))`,
   gated on `isReady && effectivePackId`.
6. **`App.tsx`** — if streaks don't prefetch via the catalog path (§9.4), add
   `loadPackHints('daily'|'weekly'|'monthly')` to the streak-warming block (`:51-60`).

### Generator / Storage-side
- Keep `split-hints.js` emitting `{id}.json` + `{id}-hints.json` (remove the `pack_hints` upsert).
- Ensure all live packs have a current `{id}-hints.json` in the `packs` bucket.
- (Optional) Set `Content-Encoding: gzip` on the hint objects; verify client decompression.

---

## 11. Verification plan

1. **Offline completeness (the headline):** fresh install online → wait for prefetch (watch
   `[SB:HINTS]`/`[SB:PACK]` dev logs) → airplane mode → open a puzzle **never opened before** → hint
   button enables and `showHint` works.
2. **Splash non-regression:** cold launch on a throttled connection → splash reveals on slim
   packs/previews without waiting on hint downloads; no thumbnail pop-in.
3. **Disk persistence:** open a puzzle online → kill app → airplane mode → relaunch → hints still work
   (proves disk, not memory).
4. **Hint correctness:** spot-check that `showHint` ghosts match `{id}-hints.json[idx]` for a few
   library puzzles and today's daily/weekly/monthly.
5. **Failure path:** delete the hints file in Storage (or block it) → `hintsLoading` clears, tap shows
   "Hints Unavailable" (no infinite spinner).
6. **ETag refresh:** re-run `split-hints.js` for one pack (new ETag) → next foreground prefetch
   re-downloads that hints file; new hints appear next session.
7. **Streak archive:** open an archive day → correct hints for that day's index.

---

## 12. Appendix — file inventory (hint touchpoints)

| File | Role |
|---|---|
| `src/types.ts` | `HintStep` (`:143`), `RawPuzzle.hints?` (`:159`), `Puzzle.hints` (`:170`), `PackData` (`:188`), `PackHintsRow` (`:150`, delete) |
| `src/utils/parsePuzzle.ts:65` | `hints: raw.hints ?? []` (slim → `[]`) |
| `src/stores/puzzleStore.ts` | `loadPuzzle` `hintsLoading` (`:114`), `setHints` (`:434`), `showHint` (`:400`) |
| `src/components/Toolbar.tsx` | hint button: `hasHints`/`hintsLoading` (`:35-44`), `handleHint` (`:53`) |
| `src/screens/PuzzleScreen.tsx` | hint load wiring (`:179`, to replace) |
| `src/hooks/usePackData.ts` | sets `effectivePackId`, `puzzleIndexInPack` (`:64-65,87-88`) |
| `src/hooks/usePackPreviews.ts` | previews via **full** packs (`:33,41`) — the splash-coupling constraint |
| `src/utils/streakDate.ts:51` | `getPuzzleIndex` → hint index for streaks |
| `src/packs/packFetcher.ts` | `fetchPack`/`fetchFromSupabase`/ETag/validation — the pattern to mirror |
| `src/packs/packCache.ts` | `loadPack`/`packCache` — add `loadPackHints`/`hintsCache` |
| `src/packs/index.ts` | `getPuzzlesForPack`/`getStreakPack`/`prefetchPackFile`/`cachePackPreview` — add `loadPackHints`/`prefetchHintsFile` |
| `src/packs/prefetch.ts` | `prefetchAllCatalog` — add hint prefetch |
| `src/packs/packStorage.ts` | RNFS I/O, `encodeForDisk`/`decodeFromDisk` gzip seam |
| `src/mmkv.ts:12` | `packMetaStorage` ETag store |
| `App.tsx` | prefetch triggers (`:78-138`), streak warming (`:51-60`) |
| `packs/split-hints.js` | emits `{id}-hints.json` (`:115-118,159`); remove `pack_hints` upsert |
| `src/powersync/AppSchema.ts` | remove `pack_hints` (`:71-84,92`) |
| `supabase/migrations/0005_pack_hints.sql` | delete |
| `packs/populate-pack-hints.js` | delete |

### Hint file shape
```json
{ "version": 1, "hints": [ [ { "rule": "Forced Region", "level": 2, "placements": [[2,2]], "marks": [] } ], ... ] }
```
`hints[i]` ↔ `puzzles[i]`. Disk path: `DocumentDirectory/packs/{packId}-hints.json`. ETag key:
`etag:{packId}-hints.json` in `packMetaStorage`.
