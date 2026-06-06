# Hints Delivery — M1 Implementation Plan

> Companion to [`research.md`](./research.md). Implements **M1**: deliver hints as a standalone
> `{packId}-hints.json` Storage file that is **disk-cached and prefetched exactly like the pack file**,
> read from disk at hint time. This fixes the root-cause bug (hints were memory-only + 10s live fetch)
> and removes the staged `pack_hints` PowerSync work.
>
> **Ordering is deliberate:** we build the new disk-cached path first (additive, nothing breaks), wire
> `PuzzleScreen` to it, *then* delete the staged `pack_hints` leftovers. The project typechecks at the
> end of every phase.

---

## Task checklist

Work top-to-bottom — the order keeps the build green. Resolve the **Open decisions** (bottom of this doc)
before the phases that reference them. Code-edit details and snippets live in each phase below.

**Phase 0 — Pre-flight** ✅
- [x] Create branch `hints-disk-cache` off `testflight`
- [x] `git status` — confirm the staged `pack_hints` changes are present
- [x] Baseline `npx tsc --noEmit` passes

**Phase 1 — Disk-cached hints fetch (additive)** ✅
- [x] 1a · `src/types.ts` — add `HintsFile` type next to `HintStep`
- [x] 1b · `src/packs/packStorage.ts` — import `HintsFile`; add `decodeHintsFromDisk`
- [x] 1c · `src/packs/packFetcher.ts` — add `HintStep, HintsFile` to the types import + `decodeHintsFromDisk` to the packStorage import
- [x] 1c · add `validateHintsText`
- [x] 1c · add `fetchHints` (disk-first read → network fallback → write to disk; no-RNFS direct-fetch branch)
- [x] ✅ Checkpoint: `npx tsc --noEmit` (still green; nothing consumes these yet)

**Phase 2 — In-memory dedup cache (`src/packs/packCache.ts`)** ✅
- [x] Import `HintStep` (types) + `fetchHints` (packFetcher)
- [x] Add module-level `hintsCache` Map
- [x] Add `warmHintsCache(packId, hints)`
- [x] Add `hasHintsCacheEntry(packId)`
- [x] Add `loadPackHints(packId)` (shared in-flight promise + evict-on-failure)
- [x] Confirm the old `loadPack` hint side-effect is NOT restored (keep pack/hint loads decoupled)
- [x] ✅ Checkpoint: `npx tsc --noEmit`

**Phase 3 — ETag-aware prefetch (`src/packs/index.ts` + `src/packs/prefetch.ts`)** ✅
- [x] 3a · `index.ts` — extend imports: types (`HintStep`, `HintsFile`), packFetcher (`validateHintsText`), packCache (`loadPackHints` alias, `warmHintsCache`, `hasHintsCacheEntry`)
- [x] 3a · re-export `loadPackHints`
- [x] 3a · add `prefetchHintsFile(packId)` — stat disk, ETag compare (`{id}-hints.json`), download/validate/write, `warmHintsCache`, `setCachedEtag`
- [x] 3b · `prefetch.ts` — import `prefetchHintsFile`; call it (fire-and-forget) in the `hasPackAccess` branch alongside `prefetchPackFile`
- [x] ✅ Checkpoint: `npx tsc --noEmit`

**Phase 4 — Read path + streak warming** ✅
- [x] 4a · `PuzzleScreen.tsx` — remove the `usePuzzleHints` import + call
- [x] 4a · add `import { loadPackHints } from '../packs'`
- [x] 4a · add `const setHints = usePuzzleStore(s => s.setHints)`
- [x] 4a · add the load effect (gated on `isReady && effectivePackId`; `cancelled` guard; `setHints([])` on failure)
- [x] 4b · `App.tsx` — add `loadPackHints` to the `./src/packs` import
- [x] 4b · add `loadPackHints('daily'|'weekly'|'monthly')` to the streak-warming `Promise.all` (see Open decision #1)
- [x] ✅ Checkpoint: `npx tsc --noEmit` — green; `usePuzzleHints` / `pack_hints` now unused

**Phase 5 — Remove the staged `pack_hints` work** 🟡 (code done; 5e/5f need you — remote/dashboard)
- [x] 5a · delete `src/hooks/usePuzzleHints.ts` (was untracked on this branch → `rm`, not `git rm`)
- [x] 5a · delete `packs/populate-pack-hints.js`
- [x] 5a · delete `supabase/migrations/0005_pack_hints.sql`
- [x] 5b · `AppSchema.ts` — removed the `pack_hints` const + its `new Schema({ ... })` entry
- [x] 5c · `types.ts` — removed `PackHintsRow`
- [x] 5d · `split-hints.js` — removed `upsertPackHints` fn + its call (kept the two file uploads)
- [ ] ⚠️ 5e · **MANUAL (you)** — run `drop table if exists public.pack_hints;` in the Supabase dashboard SQL editor — **NOT** `supabase db push`. (I can't perform prod DB writes; the read query was blocked by the safety guard.)
- [ ] ⚠️ 5f · **MANUAL (you)** — confirm `pack_hints` is absent from the PowerSync **sync rules** (remove if present)
- [x] ✅ Checkpoint: `npx tsc --noEmit` passes + eslint 0 errors; `rg "pack_hints|usePuzzleHints|PackHintsRow|populate-pack-hints" src/ packs/ supabase/` returns nothing
- [ ] (Optional, out of scope) reconcile 0004/0005 migration tracking via `supabase migration repair`

**Phase 6 — Storage / generator + verification** 🟡 MANUAL — needs Storage access + a device (you)
- [ ] ⚠️ 6a · Confirm every live pack has a current `{packId}-hints.json` in the `packs` bucket (run `split-hints.js` if any are missing). The app reads these; without them the hint button shows "Hints Unavailable".
- [ ] 6a · (Optional, decision #3) gzip the hint objects; verify Supabase serves `Content-Encoding: gzip` + RN decompresses
- [ ] ⚠️ 6b · Test 1 — offline completeness (open a never-opened puzzle in airplane mode after prefetch)
- [ ] ⚠️ 6b · Test 2 — splash non-regression (throttled cold launch, no thumbnail pop-in)
- [ ] ⚠️ 6b · Test 3 — disk persistence (kill app → airplane → relaunch → hints work)
- [ ] ⚠️ 6b · Test 4 — hint correctness vs `{id}-hints.json[idx]`
- [ ] ⚠️ 6b · Test 5 — failure path (blocked hints file → no infinite spinner)
- [ ] ⚠️ 6b · Test 6 — ETag refresh (re-run `split-hints.js` → re-download next foreground)
- [ ] ⚠️ 6b · Test 7 — streak archive (correct hints for an archive day)

**Open decisions**
- [x] #1 Streak `storage_path` — **resolved by implementation**: `App.tsx` warms streak hints via `loadPackHints` regardless, so coverage holds whether or not streak rows carry `storage_path`.
- [x] #2 Daily-hints prefetch policy — **implemented: always** (`prefetchHintsFile` in `prefetchAllCatalog` + streak warming in `App.tsx`). Revisit to Wi-Fi-only/today-only later if the ~2 MB daily download is a concern.
- [ ] #3 gzip transport on hint objects (Phase 6a — optional, your call)
- [x] #4 Hints version gate — **deferred as built**: ETag-only refresh (no `HINTS_MIN_VERSION`); add only if the hint format changes incompatibly.

---

## 0. Pre-flight

```bash
git checkout -b hints-disk-cache        # work off testflight
git status                              # confirm the staged pack_hints changes are present
npx tsc --noEmit                        # baseline: should pass
```

What we mirror (all already in the codebase):
- `fetchPack` (disk-first read + network fallback) — `src/packs/packFetcher.ts:73`
- `loadPack` (in-memory dedup Map) — `src/packs/packCache.ts:22`
- `prefetchPackFile` (ETag-aware disk prefetch) — `src/packs/index.ts:71`
- ETag store `packMetaStorage` — `src/mmkv.ts:12`, `getCachedEtag`/`setCachedEtag` — `packFetcher.ts:38`

The hint file already exists in Storage (`{packId}-hints.json`, shape `{ version, hints: HintStep[][] }`,
indexed by puzzle position) — produced by `packs/split-hints.js:115-118,159`.

---

## Phase 1 — Disk-cached hints fetch (additive)

### 1a. Add the `HintsFile` type — `src/types.ts`

Add next to `HintStep` (`:148`). Per CLAUDE.md, all types live here.

```ts
// On-disk / Storage shape of "{packId}-hints.json". `hints[i]` aligns with the
// pack's puzzles[i]; one HintStep[] (the full deduction chain) per puzzle.
export type HintsFile = {
  version: number;
  hints: HintStep[][];
};
```

> Leave `PackHintsRow` (`:150-154`) for now — it's deleted in Phase 5 once `usePuzzleHints` is gone.

### 1b. Add a disk decoder — `src/packs/packStorage.ts`

Mirror `decodeFromDisk` (`:32-34`). Honors the existing `encodeForDisk`/`decodeFromDisk` compression seam.

```ts
import type { Pack, HintsFile } from '../types';   // add HintsFile to the existing import

// ... existing encodeForDisk / decodeFromDisk ...

export function decodeHintsFromDisk(text: string): HintsFile {
  return JSON.parse(text) as HintsFile;
}
```

### 1c. Add validation + disk-first fetch — `src/packs/packFetcher.ts`

Add `decodeHintsFromDisk` to the `packStorage` import (`:4-9`) and `HintStep, HintsFile` to the types
import (`:3`). Then add, mirroring `validatePackText` (`:26`) and `fetchPack` (`:73`):

```ts
import type { Pack, HintStep, HintsFile } from '../types';
import {
  getRNFS,
  assertSafeKey,
  encodeForDisk,
  decodeFromDisk,
  decodeHintsFromDisk,   // add
} from './packStorage';

// Verify a downloaded hints file before caching/parsing. Throws on malformed
// content (mirrors validatePackText).
export function validateHintsText(text: string): void {
  const data = JSON.parse(text) as { hints?: unknown };
  if (!Array.isArray(data?.hints)) {
    throw new Error('Invalid hints file: missing hints array');
  }
}

// Disk-first read of "{packId}-hints.json" (mirrors fetchPack). Returns the
// HintStep[][] indexed by puzzle position. Hints get the SAME disk persistence
// as packs — the whole point of M1. No version gate: refresh is ETag-driven
// (prefetchHintsFile), matching how pack content updates propagate.
export async function fetchHints(packId: string): Promise<HintStep[][]> {
  assertSafeKey(packId);
  const key = `${packId}-hints.json`;
  const rnfs = getRNFS();

  if (rnfs) {
    const localPath = `${rnfs.DocumentDirectoryPath}/packs/${key}`;
    try {
      const raw = await rnfs.readFile(localPath, 'utf8');
      return decodeHintsFromDisk(raw).hints;
    } catch {
      // not on disk yet — fall through to network
    }
    const text = await fetchFromSupabase(key);
    validateHintsText(text);
    await rnfs.mkdir(`${rnfs.DocumentDirectoryPath}/packs`).catch(() => {});
    await rnfs.writeFile(localPath, encodeForDisk(text), 'utf8').catch(() => {});
    return (JSON.parse(text) as HintsFile).hints;
  }

  // No-RNFS env (tests): fetch direct, no disk.
  const text = await fetchFromSupabase(key);
  validateHintsText(text);
  return (JSON.parse(text) as HintsFile).hints;
}
```

**Checkpoint:** `npx tsc --noEmit` (still green; nothing consumes these yet).

---

## Phase 2 — In-memory dedup cache — `src/packs/packCache.ts`

Add a `hintsCache` Map alongside `packCache`, plus `loadPackHints`/`warmHintsCache`/`hasHintsCacheEntry`
mirroring `loadPack`/`warmPackCache`/`hasPackCacheEntry`. **Do not** restore the old `loadPack`
side-effect that auto-fetched hints — keep pack loads and hint loads decoupled (explicit prefetch + read).

```ts
import type { Pack, HintStep } from '../types';        // add HintStep
import { fetchPack, fetchHints } from './packFetcher';  // add fetchHints

// ... existing packCache Map, warmPackCache, hasPackCacheEntry, loadPack ...

// In-memory cache for hint arrays, keyed by packId (NOT filename). Separate from
// packCache so evicting a stale pack never discards hints, and so a hints fetch
// dedupes across the many puzzle-opens within a pack.
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
  // Evict on failure so the next call retries rather than re-throwing instantly.
  promise.catch(() => hintsCache.delete(packId));
  return promise;
}
```

**Checkpoint:** `npx tsc --noEmit`.

---

## Phase 3 — ETag-aware prefetch — `src/packs/index.ts` + `src/packs/prefetch.ts`

### 3a. `prefetchHintsFile` + re-export `loadPackHints` — `src/packs/index.ts`

Extend imports, then add `prefetchHintsFile` mirroring `prefetchPackFile` (`:71-121`). The hint storage
key is derived as `${packId}-hints.json` (independent of the pack's `storagePath`).

```ts
import type { RawPuzzle, Pack, StreakType, HintStep, HintsFile } from '../types';
import { getRNFS, assertSafeKey, encodeForDisk } from './packStorage';
import {
  fetchFromSupabase,
  validatePackText,
  validateHintsText,   // add
  fetchPackEtag,
  getCachedEtag,
  setCachedEtag,
} from './packFetcher';
import {
  loadPack,
  loadPackHints as _loadPackHints,   // add
  warmPackCache,
  hasPackCacheEntry,
  warmHintsCache,                     // add
  hasHintsCacheEntry,                 // add
} from './packCache';

// Re-export so screens import hint loading from the packs public API.
export function loadPackHints(packId: string): Promise<HintStep[][]> {
  return _loadPackHints(packId);
}

// ETag-aware background prefetch of "{packId}-hints.json" to DISK (mirrors
// prefetchPackFile). This is the fix vs the old prefetchHintsFile, which only
// warmed an in-memory cache that evaporated on restart.
export async function prefetchHintsFile(packId: string): Promise<void> {
  assertSafeKey(packId);
  const key = `${packId}-hints.json`;
  const rnfs = getRNFS();

  let alreadyOnDisk = false;
  if (rnfs) {
    try {
      await rnfs.stat(`${rnfs.DocumentDirectoryPath}/packs/${key}`);
      alreadyOnDisk = true;
    } catch {
      // not on disk
    }
  } else if (hasHintsCacheEntry(packId)) {
    return; // in-memory-only env, already cached
  }

  let remoteEtag: string | undefined;
  try {
    remoteEtag = await fetchPackEtag(key);
    if (alreadyOnDisk && remoteEtag && remoteEtag === getCachedEtag(key)) return;
  } catch {
    return; // network unavailable — skip silently
  }

  let text: string;
  try {
    text = await fetchFromSupabase(key);
    validateHintsText(text);
  } catch {
    return;
  }

  if (rnfs) {
    const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
    await rnfs.mkdir(packDir).catch(() => {});
    await rnfs
      .writeFile(`${packDir}/${key}`, encodeForDisk(text), 'utf8')
      .catch(() => {});
  }

  warmHintsCache(packId, (JSON.parse(text) as HintsFile).hints);
  if (remoteEtag) setCachedEtag(key, remoteEtag);
}
```

### 3b. Wire into the catalog prefetch — `src/packs/prefetch.ts`

Restore the hint prefetch the staged work removed (`:18`). Fire-and-forget, alongside the pack file.

```ts
import { prefetchPackFile, cachePackPreview, prefetchHintsFile } from './index';
// ...
      if (hasPackAccess(p.id)) {
        // Hints ride the same prefetch as the pack — disk-cached for offline.
        prefetchHintsFile(p.id).catch(() => {});
        return prefetchPackFile(p.id, p.storagePath!).catch(() => {});
      }
      return cachePackPreview(p.id, p.storagePath!).catch(() => {});
```

> Inaccessible (unpurchased) packs get a preview only — no hints — which is correct: you can't open
> their puzzles, so you never need their hints.

**Checkpoint:** `npx tsc --noEmit`.

---

## Phase 4 — Read path + streak warming (wire it up)

### 4a. `PuzzleScreen` reads hints from the disk cache — `src/screens/PuzzleScreen.tsx`

Remove the `usePuzzleHints` import (`:30`) and call (`:179`). Add `loadPackHints` from `../packs` and a
`setHints` selector, then restore the load effect (now backed by the disk cache).

```ts
// remove:  import { usePuzzleHints } from '../hooks/usePuzzleHints';
import { loadPackHints } from '../packs';   // add

// inside the component, with the other store selectors (~:71):
const setHints = usePuzzleStore(s => s.setHints);

// replace the usePuzzleHints(...) call (~:176-179) with:
// Load this puzzle's hints from the disk-cached "{packId}-hints.json".
// Disk-first + prefetched, so this is instant and offline once cached; a
// cold miss downloads once. setHints([]) on failure clears `hintsLoading`
// so the toolbar spinner never hangs. `cancelled` guards against a stale
// resolve landing on a puzzle the user already navigated away from.
useEffect(() => {
  if (!isReady || !effectivePackId) return;
  let cancelled = false;
  loadPackHints(effectivePackId)
    .then(all => { if (!cancelled) setHints(all[puzzleIndexInPack] ?? []); })
    .catch(() => { if (!cancelled) setHints([]); });
  return () => { cancelled = true; };
}, [isReady, effectivePackId, puzzleIndexInPack, setHints]);
```

> `effectivePackId` is the streakType for streak packs and the catalog id for library packs;
> `puzzleIndexInPack` is the 0-based position — exactly the `hints[]` index. `parsePuzzle` already
> seeds `puzzle.hints = []` and `loadPuzzle` sets `hintsLoading = true` for slim packs
> (`puzzleStore.ts:114`), so the spinner shows until this effect resolves.

### 4b. Warm streak hints at startup — `App.tsx`

`prefetchAllCatalog` only iterates catalog rows **with a `storagePath`** (`prefetch.ts:15`). Streak packs
are warmed explicitly via `getStreakPack` (`App.tsx:51-60`); warm their hints the same way so coverage
doesn't depend on whether streak rows carry `storage_path`. (See research §9.4 — verify against the live
`packs` table; this belt-and-suspenders call is harmless either way.)

```ts
import { getStreakPack, loadPackHints } from './src/packs';   // add loadPackHints

authReady
  .then(() =>
    Promise.all([
      getStreakPack('daily'),
      getStreakPack('weekly'),
      getStreakPack('monthly'),
      loadPackHints('daily'),     // add — warms disk-cached streak hints
      loadPackHints('weekly'),
      loadPackHints('monthly'),
    ]),
  )
  .then(() => startupTimer.log('streak packs resolved'))
  .catch(() => {});
```

**Checkpoint:** `npx tsc --noEmit` — green. The app now reads hints from disk; `usePuzzleHints` and
`pack_hints` are unused.

---

## Phase 5 — Remove the staged `pack_hints` work

> **Current remote state — verified 2026-06-04 via `supabase migration list` (linked project
> `zvqdcrszalxmgtmcnevg`):**
>
> ```
> Local | Remote
> 0001  | 0001
> 0002  | 0002
> 0003  | 0003
> 0004  |        ← local only — applied to remote MANUALLY (dashboard SQL), not migration-tracked
> 0005  |        ← same
> ```
>
> Per the note in this doc, `0005` was **run by hand** — so the `pack_hints` **table exists in remote
> Postgres**, but `migration list` shows it "pending" because it wasn't applied via `supabase db push`.
> Two consequences for cleanup (this corrects the original "never applied → simple delete" assumption):
>
> 1. **Deleting the local `0005_pack_hints.sql` file is safe and causes no drift** — the CLI already shows
>    it un-applied on remote, so removing it changes nothing in `supabase_migrations`. It also prevents a
>    future `supabase db push` from (re)creating the table.
> 2. **The live table must be dropped by hand** (5e), the same way it was created. **Do NOT use
>    `supabase db push` to clean up** — `0004` is in the same untracked-local state, so a push would also
>    try to (re)apply `0004` (user_entitlements). Use a one-off statement in the dashboard SQL editor.
>
> (Couldn't auto-confirm the table's rows/publication membership: `supabase db dump` needs Docker — not
> running — and a direct `inspect db` query against prod was blocked by the safety guard. Neither is
> required: `DROP TABLE` removes the index, RLS, and publication membership regardless. If you want exact
> confirmation of row counts, approve `supabase inspect db table-record-counts --linked`.)

Now that nothing imports them:

### 5a. Delete local files (app + the abandoned create-migration)
```bash
git rm src/hooks/usePuzzleHints.ts
git rm packs/populate-pack-hints.js
git rm supabase/migrations/0005_pack_hints.sql   # safe: untracked on remote (see above) + stops a future `db push` recreating the table
```

### 5b. `src/powersync/AppSchema.ts` — remove the `pack_hints` table
Delete the `pack_hints` const (`:71-84`) and its entry in `new Schema({ ... })` (`:92`):

```ts
export const AppSchema = new Schema({
  packs,
  puzzle_progress,
  streaks,
  user_entitlements,
  streak_archive,
  // pack_hints,   ← remove this line
});
```

### 5c. `src/types.ts` — remove `PackHintsRow` (`:150-154`).

### 5d. `packs/split-hints.js` — revert the `pack_hints` upsert
Remove `upsertPackHints` (`:72-99`) and its call (`:160`). The splitter keeps emitting the two files:

```js
  await uploadToSupabase(`${packId}.json`, slimText);
  await uploadToSupabase(`${packId}-hints.json`, hintsText);
  // remove: await upsertPackHints(packId, hintsFile.hints);
```

### 5e. Drop the live `pack_hints` table on remote
It was applied by hand, so remove it the same way — run once in the **Supabase dashboard → SQL Editor**
(project `zvqdcrszalxmgtmcnevg`):

```sql
drop table if exists public.pack_hints;
```

`DROP TABLE` also drops the `pack_hints_by_pack` index and any RLS, and auto-removes the table from the
`powersync` publication (the `0005` DO-block added it when the publication is an explicit table list) — so
no `alter publication … drop table` is needed. Again, **do not** use `supabase db push` (see the state note).

### 5f. PowerSync dashboard sync rules
Separate from the Postgres publication: if `pack_hints` was ever added to the PowerSync **sync rules**
(a bucket's `data:` queries), remove it — otherwise PowerSync errors trying to replicate a dropped table.
Almost certainly never added (that omission is why hints don't show today), but confirm.

**Checkpoint:** `npx tsc --noEmit` + lint. Grep to confirm nothing dangles:
```bash
rg "pack_hints|usePuzzleHints|PackHintsRow|populate-pack-hints" src/ packs/ supabase/
```

---

## Phase 6 — Storage / generator + verification

### 6a. Storage
- Ensure every live pack has a current `{packId}-hints.json` in the `packs` bucket (run `split-hints.js`
  if any are missing). No schema/table/sync-rules work — Storage only.
- **(Optional) gzip:** set `Content-Encoding: gzip` on the hint objects to shrink the download ~6–8×
  (daily ~13.9 MB → ~2 MB). Verify (a) Supabase serves the header and (b) `fetchFromSupabase`'s
  `download()` → Blob path decompresses transparently before enabling. Disk stays uncompressed (the
  `encodeForDisk` seam in `packStorage.ts:22-34` could gzip on disk later via `pako`, but that's not
  needed for M1).

### 6b. Verification (device)
| # | Test | Pass criteria |
|---|---|---|
| 1 | **Offline completeness** | Fresh install online → wait for prefetch (`[SB:PACK]` logs) → airplane mode → open a puzzle **never opened before** → hint works |
| 2 | **Splash non-regression** | Cold launch throttled → splash reveals on slim packs/previews; no thumbnail pop-in; no wait on hint downloads |
| 3 | **Disk persistence** | Open puzzle online → kill app → airplane mode → relaunch → hints still work (proves disk, not memory) |
| 4 | **Correctness** | `showHint` ghosts match `{id}-hints.json[idx]` for a few library puzzles + today's daily/weekly/monthly |
| 5 | **Failure path** | Block the hints file → `hintsLoading` clears, tap → "Hints Unavailable" alert (no infinite spinner) |
| 6 | **ETag refresh** | Re-run `split-hints.js` for one pack → next foreground prefetch re-downloads that hints file |
| 7 | **Streak archive** | Open an archive day → correct hints for that day's index |

---

## Summary of file changes

| File | Phase | Change |
|---|---|---|
| `src/types.ts` | 1a / 5c | + `HintsFile`; − `PackHintsRow` |
| `src/packs/packStorage.ts` | 1b | + `decodeHintsFromDisk` |
| `src/packs/packFetcher.ts` | 1c | + `validateHintsText`, `fetchHints` |
| `src/packs/packCache.ts` | 2 | + `hintsCache`, `loadPackHints`, `warmHintsCache`, `hasHintsCacheEntry` |
| `src/packs/index.ts` | 3a | + `prefetchHintsFile`, re-export `loadPackHints` |
| `src/packs/prefetch.ts` | 3b | + `prefetchHintsFile` call |
| `src/screens/PuzzleScreen.tsx` | 4a | swap `usePuzzleHints` → disk-cached load effect |
| `App.tsx` | 4b | + `loadPackHints` streak warming |
| `src/hooks/usePuzzleHints.ts` | 5a | **delete** |
| `packs/populate-pack-hints.js` | 5a | **delete** |
| `supabase/migrations/0005_pack_hints.sql` | 5a | **delete** (untracked on remote — no drift) |
| `src/powersync/AppSchema.ts` | 5b | − `pack_hints` table |
| `packs/split-hints.js` | 5d | − `pack_hints` upsert |
| (remote DB) `public.pack_hints` | 5e | **`DROP TABLE`** by hand — it was applied manually, not via `db push` |

## Rollback
App changes live on `hints-disk-cache`; revert = drop the branch. The Storage `{id}-hints.json` files are
additive (used by the old path too), so they're safe to leave.

**Server-side (corrected):** the `pack_hints` table *was* applied to remote (manually), so cleanup drops
it (Phase 5e). It is **not** migration-tracked, so there's no `supabase_migrations` entry to repair, and
deleting the local `0005` file introduces no drift. To undo the cleanup, re-run `0005`'s SQL.

> **Pre-existing observation (out of scope for M1):** `0004_powersync_user_entitlements.sql` is *also*
> applied-manually-but-untracked (Remote-blank in `migration list`), yet it's shipped and wanted. The
> repo's migration files and the remote tracking table are out of sync for both 0004 and 0005. Worth
> reconciling separately (e.g. `supabase migration repair --status applied 0004`), but it doesn't block M1.

## Open decisions (carried from research §9)
1. **Streak `storage_path`** — verify streak catalog rows carry it; if so, 4b is redundant-but-safe; if
   not, 4b is required.
2. **Daily-hints prefetch policy** — always (simplest, fully offline) vs Wi-Fi-only vs today-only.
3. **gzip** — confirm Supabase serving + RN decompression before enabling (6a).
4. **Hints version gate** — currently ETag-only refresh; add `HINTS_MIN_VERSION` eviction only if the
   hint format ever changes incompatibly.
