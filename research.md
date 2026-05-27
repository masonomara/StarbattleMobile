# StarbattleMobile — Codebase Research Report

> Goal: Understand the full architecture before implementing local-first caching for streaks and packs.

---

## 1. Project Overview

**Type**: React Native + Expo puzzle game  
**Framework**: Expo SDK, TypeScript, Zustand, PowerSync, Supabase, Skia, Reanimated  
**Pattern**: Offline-first — local SQLite (PowerSync) syncs bidirectionally with Supabase Postgres

Star Battle is a constraint-based logic puzzle. Each row, column, and region must contain exactly N stars; no two stars may be adjacent (including diagonals). The app ships 3 streak types (daily, weekly, monthly) plus an expanding library of packs.

---

## 2. Directory Structure

```
StarbattleMobile/
├── App.tsx                  # Entry point, initialization, event subscriptions
├── index.js
├── src/
│   ├── types.ts             # ALL types live here (project rule)
│   ├── store.ts             # Puzzle game state (Zustand)
│   ├── navigation.tsx       # Stack navigator
│   ├── supabase.ts          # Supabase client (MMKV-backed)
│   ├── config.ts            # Env vars (URLs, keys)
│   ├── storage.ts           # Settings MMKV persistence
│   ├── mmkv.ts              # 3 MMKV instances (settings, auth, packMeta)
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── entitlementsStore.ts
│   │   ├── settingsStore.ts
│   │   └── streaksStore.ts
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── LibraryScreen.tsx
│   │   ├── PuzzleScreen.tsx
│   │   └── StreaksModal.tsx
│   ├── components/          # 14 components (Canvas, Header, WinBanner, Paywall, etc.)
│   ├── hooks/               # useTheme, useZoom, useDrawGesture, useAsyncAction, etc.
│   ├── utils/               # puzzleLogic, parsePuzzle, progress, payments, streakDate, appIcon
│   ├── packs/
│   │   ├── index.ts         # Pack loading, in-memory + disk cache
│   │   └── prefetch.ts      # ETag-based background refresh
│   ├── powersync/
│   │   ├── AppSchema.ts     # SQLite table definitions
│   │   └── Connector.ts     # Sync connector (credentials + upload)
│   └── themes/
│       ├── palettes.ts      # 6 palettes × dark/light
│       └── ansi.ts
```

---

## 3. Type System (`src/types.ts`)

All types are centralized here (project rule — no inline exports from other files).

### Navigation
```ts
RootStackParamList: {
  Home: undefined
  Library: { packId: string }
  Puzzle:
    | { packId: string; puzzleIndex: number }            // regular pack
    | { streakType: StreakType; archiveOptions?: {...} } // streak
}
```

### Game State
```ts
CellValue: 0 | 1 | 2        // empty | star | mark
TapMode: 'cycle' | 'erase'
StreakType: 'daily' | 'weekly' | 'monthly'
Streak: { type, current, lastCompletedKey }
CellChange: { index, prev, next }
Move: { changes: CellChange[], autoMarks: number[] }
```

### Puzzle Domain
```ts
RawPuzzle: { sbn: string, solution: Coord[], hints?: HintStep[] }
Puzzle: {
  id: string, size: number, stars: number,
  regions: number[][], regionCells: number[][],
  solution: number[], hints: HintStep[]
}
Pack: {
  id: string, name: string, version: number,
  free: boolean, gridSize: number, stars: number,
  puzzles: RawPuzzle[]
}
```

### Entitlements
```ts
Entitlements: { isPremium: boolean, premiumPurchasedAt?: string, ownedPackIds: string[] }
PackCatalogItem: { id, name, gridSize, stars, isFree, priceUsd, puzzleCount, storagePath, sortOrder }
PaywallContext: // 3-case discriminated union: sequential | paid-pack | unavailable
```

### Theme
```ts
ThemeName: 'original' | 'primer' | 'gruvbox' | 'rosePine' | 'seoul256' | 'tokyoNight'
RoleColors: 14 semantic tokens (text, background, surface, borders, feedback)
RegionColors: 12 colors for regions (6 base + 6 bright)
```

---

## 4. Database & Sync (`src/powersync/AppSchema.ts`)

PowerSync syncs local SQLite ↔ Supabase Postgres. Offline writes queue and sync when online.

| Table | Key Columns |
|-------|-------------|
| `packs` | name, grid_size, stars, difficulty, is_free, price_usd, puzzle_count, storage_path, published, sort_order |
| `puzzle_progress` | user_id, puzzle_id, cells (JSON), auto_marks (JSON), time_ms, completed, completed_at, updated_at |
| `streaks` | user_id, type, current_count, last_completed_key, updated_at |
| `user_entitlements` | user_id, is_premium, premium_purchased_at, owned_pack_ids (JSON), updated_at |
| `streak_archive` | type, date_key, puzzle_id |

**Indexes**: puzzle_progress on [user_id, puzzle_id]; streaks on [user_id, type]; user_entitlements on [user_id]; streak_archive on [type, date_key].

**Fatal error handling**: Postgres error codes 22xxx, 23xxx, 42501 → transaction discarded (not retried) to prevent corrupt state.

---

## 5. Pack System (`src/packs/`)

### Pack Content Format
Packs are JSON files stored in Supabase Storage (`packs` bucket):
```json
{
  "puzzles": [
    {
      "sbn": "8x2.AABBCCDD...",
      "solution": [[0,1], [3,5], ...],
      "hints": [{ "rule": "...", "level": 1, "placements": [], "marks": [] }]
    }
  ]
}
```

SBN format: `{size}x{stars}.{region_layout}` — region_layout is a string of A–Z chars, one per cell.

### Three-Layer Cache (`src/packs/index.ts`)

1. **In-Memory** (`packCache: Map<storageKey, Promise<string>>`): Shared promises prevent duplicate concurrent downloads. Evicted on fetch failure to allow retry.

2. **Disk** (react-native-fs, `DocumentDirectoryPath/packs/{packId}.json`): Solutions base64-encoded before write (prevents casual file inspection). Validated on read (SBN format check).

3. **Remote** (Supabase Storage): ETag comparison — if ETag unchanged, skip download and return disk cache.

MMKV (`packMetaStorage`) stores ETag + version metadata keyed by pack storage path.

### Prefetch Engine (`src/packs/prefetch.ts`)
- Runs on cold-start and app foreground (debounced 2s)
- Checks remote ETag vs stored ETag for all 3 streak types in parallel
- Re-downloads only on ETag mismatch
- Purges pack files not accessed in 90+ days (but streak packs are never purged)

### App Startup Pack Flow (`App.tsx`)
```
App mounts
  → warmStreakPackCaches(['daily','weekly','monthly'])  // parallel
  → hide splash after packs ready OR 3s timeout
  → schedulePackPrefetch() (debounced 2s)
  → PowerSync watch on 'packs' table → loadPackCatalog()
```

---

## 6. Streak System

### Date Keys (`src/utils/streakDate.ts`)
| Type | Key Format | Example |
|------|-----------|---------|
| daily | YYYY-MM-DD | 2026-05-26 |
| weekly | YYYY-W## | 2026-W22 |
| monthly | YYYY-MM | 2026-05 |

`getPuzzleIndex(pack, streakType)`: Deterministic puzzle selection via epoch-based modulo — same key always picks same puzzle, works offline.

`getActiveStreak(streak)`: Returns count if current OR previous period completed (allows one-day grace).

Clock skew guard in `recordStreak()`: Rejects backwards-moving date keys to prevent cheat setup.

### Streak Archive (`streak_archive` table)
Maps `(type, date_key)` → `puzzle_id`. Premium users can browse/play past streak puzzles via StreaksModal. Non-premium users see locks.

---

## 7. State Management

### Zustand Stores (no React Context, no Redux)

**`usePuzzleStore`** (`src/store.ts`) — Core game state:
- `cells: CellValue[]`, `autoMarks: number[]`, `errorCells: Set<number>`, `moveLog: Move[]`, `redoStack: Move[]`
- `loadPuzzle()`: Init fresh or restore from progress
- `tapCell(row, col)`: Place/cycle/remove star → auto-marks → error check → win detection → save (400ms debounce)
- `applyDrawStroke(indices)`: Batch mark operation from drag gesture
- `undo()` / `redo()`: Restores previous cell + auto-mark state (capped at 50 moves)
- `clearBoard()`, `showHint()`, `tick()` (1s timer increment)

**`useAuthStore`** (`src/stores/authStore.ts`):
- `session, user, isAnonymous, isPasswordRecovery`
- `initialize()`: Restore session sync from MMKV on cold-start
- `signInAnonymously()`, `signUpWithEmail()`, `signInWithEmail/Apple/Google()`
- `signOut()`: Clears session + deletes orphaned anonymous user (fire-and-forget)
- `deleteAccount()`: Calls RPC `delete_user()` with CASCADE

**`useEntitlementsStore`** (`src/stores/entitlementsStore.ts`):
- `entitlements, packCatalog`
- `loadPackCatalog()`: Query published packs from PowerSync DB
- `loadEntitlements()`: Query user's ownership from DB
- `hasPackAccess(packId)`: isPremium OR isFree OR in ownedPackIds
- `canPlayPuzzle(packId, puzzleIndex)`: Sequential unlock (free packs) or unrestricted (premium)
- Triggered by PowerSync watch on `packs` and `user_entitlements` tables

**`useSettingsStore`** (`src/stores/settingsStore.ts`):
- 11 settings: `autoXNeighbors`, `autoXRowsCols`, `autoXRegions`, `autoXOther`, `showErrors`, `showCompletedRegions`, `haptics`, `theme preference`, `palette`
- Persisted to MMKV via `storage.ts`

**`useStreaksStore`**: Just modal visibility.

---

## 8. Game Logic (`src/utils/puzzleLogic.ts`)

### Auto-Marking
`computeAutoXForStar(cells, boardSize, puzzle, settings, row, col)` → indices to mark:
- Neighbors: 8 adjacent cells
- Row/Col: Mark all empty cells in row/col when zone reaches star quota
- Region: Mark all empty cells in region when region reaches star quota

`rebuildAutoMarks(newCells, changes, oldAutoMarks, ...)` — full recompute from all placed stars. Called when a star is removed (incremental logic is insufficient).

### Error Detection
`computeErrors(cells, boardSize, puzzle)` → Set of violating cell indices:
- Adjacent stars (O(stars²) adjacency check)
- Row/col/region overcount (O(stars) zone counting)

### Win Condition
`checkWin(cells, boardSize, puzzle)` — exact match: all solution coords have stars, no extras.

---

## 9. Puzzle Canvas (`src/components/PuzzleCanvas.tsx`)

Rendered with `@shopify/react-native-skia` (2.6.2) — GPU-accelerated canvas. Not HTML Canvas.

**Rendering layers**:
1. Region fills (memoized paths, update only on puzzle/theme change)
2. Region borders (thick border between adjacent different-region cells)
3. Inner grid lines
4. Cell state overlay: stars (☆), marks (×), errors (red), hints (yellow highlight)

**Memoization**: Background paths computed once per puzzle load; only overlay redraws on state change.

---

## 10. Authentication Flow

```
Cold start → restore session from MMKV (sync read)
  → if no session → signInAnonymously() (Supabase)
  → UI shows immediately; auth runs in background

User upgrades to named account:
  → signUpWithEmail() / signInWithGoogle() / signInWithApple()
  → orphaned anonymous user deleted after new sign-in succeeds
  → adapty.identify(userId) called after sign-in (for IAP linking)

Deep links (email confirmation, password reset):
  → URL fragment parsed for access_token + refresh_token
  → supabase.auth.setSession() restores session
```

Sessions stored in MMKV (`authStorage`), auto-refreshed by Supabase SDK. App refreshes session on foreground restore.

---

## 11. Payment System (`src/utils/payments.ts`)

Adapty SDK handles IAP across iOS/Android.

- `purchasePremium()`: Buy `sb_premium_599` → `setIsPremium(true)` locally → Adapty webhook → updates `user_entitlements` in Supabase → PowerSync syncs back to device
- `purchasePack(packId)`: Buy pack → download pack JSON → add to `ownedPackIds`
- `restorePurchases()`: Reconcile with Adapty backend (handles reinstalls)
- `getLocalizedPrice(vendorProductId)`: Fetch localized string from Adapty paywall (cached as singleton promise)

Paywall is a 3-scenario discriminated union: sequential unlock prompt / paid pack purchase / unavailable (not logged in).

---

## 12. Screens

### HomeScreen
- Streak tiles (daily, weekly, monthly) with current count
- Free pack list with completion % per pack
- Paid pack list with price + completion %
- Loads previews for all packs via `loadPack()` (triggers cache layer)
- Displays product prices via `useProductPrice()`

### LibraryScreen
- 3-column grid of puzzle thumbnails
- Cell status: active / completed (checkmark) / locked (padlock icon)
- Sequential unlock: free packs require solving puzzles in order unless premium

### PuzzleScreen
- Main game interface; discriminated union on params narrows to pack vs. streak
- Pinch-zoom (0.67×–3×) + pan (spring snapping, 120px overscroll padding)
- Long-press → draw stroke (marks cells, never places stars)
- Tap → cycle cell value (star → mark → empty or based on TapMode)
- Auto-hide header on game interaction (immersive mode)
- WinBanner slides up on completion; updates streak; navigates to next puzzle

### StreaksModal
- Shows active streaks with current count
- Premium: access to past archive by date key
- Non-premium: lock overlay on past entries

---

## 13. Cold-Start Initialization Timeline

```
1. index.js → App.tsx mounts
2. GestureHandlerRootView + SafeAreaProvider + Navigation
3. useAuthStore.initialize()        → restore session from MMKV
4. useSettingsStore.initialize()    → restore preferences from MMKV
5. warmStreakPackCaches()            → fetch/cache daily + weekly + monthly
6. Splash hidden after step 5 OR 3s timeout
7. PowerSync db.connect()           → start sync
8. PowerSync watch 'packs'          → loadPackCatalog()
9. PowerSync watch 'user_entitlements' → loadEntitlements()
10. schedulePackPrefetch() (2s debounce) → ETag checks
```

---

## 14. Existing Caching Architecture — What Already Works

| Layer | What's Cached | Storage | Eviction |
|-------|--------------|---------|----------|
| In-Memory | Pack JSON (Promise) | `packCache` Map | On fetch error |
| Disk | Pack JSON files | react-native-fs | 90-day LRU (streaks: never) |
| MMKV | ETags + pack metadata | `packMetaStorage` | Manual |
| MMKV | Auth tokens | `authStorage` | On sign-out |
| MMKV | User settings | `settingsStorage` | On update |
| PowerSync SQLite | packs catalog, progress, streaks, entitlements | Local SQLite | On sync |

**Streak packs are pre-loaded at startup** (`warmStreakPackCaches`) and **never purged** from disk. They are the highest-priority content.

**Regular packs** are fetched on-demand (first LibraryScreen open or PuzzleScreen navigation) and cached to disk. Prefetch keeps them fresh via ETag.

---

## 15. What's Missing for Fully Offline-First

The current architecture is close but has gaps:

### Packs (Regular)
- Pack catalog (`packs` table) syncs via PowerSync — available offline. ✅
- Pack content (JSON) only downloads on first access — if user never opened a pack and goes offline, content is unavailable. ❌
- Prefetch currently runs for **streak packs only**, not regular packs. ❌
- Free pack content should be downloaded eagerly at startup (or soon after).
- Paid pack content: at minimum, **first puzzle** should be cached as a preview even before purchase.

### Streak Packs
- All 3 streak types ARE pre-cached at startup. ✅
- Never purged from disk. ✅
- ETag-based refresh on foreground. ✅
- Works offline as long as the app has been opened at least once online. ✅

### Pack Access Gating Offline
- `hasPackAccess()` reads from local `user_entitlements` (PowerSync) — works offline. ✅
- `canPlayPuzzle()` reads local state — works offline. ✅

### Gap Summary
| Content | Current State | Target State |
|---------|--------------|--------------|
| Streak packs | Pre-cached at startup ✅ | Already done |
| Free pack content | On-demand only ❌ | Download at startup |
| Paid pack content | On-demand only ❌ | Cache first puzzle as preview |
| Pack catalog metadata | PowerSync ✅ | Already done |

---

## 16. Key Files for Caching Work

| File | Role |
|------|------|
| `src/packs/index.ts` | Pack loading, 3-layer cache logic |
| `src/packs/prefetch.ts` | ETag-based refresh (currently streak-only) |
| `App.tsx` | Startup orchestration (warmStreakPackCaches lives here) |
| `src/stores/entitlementsStore.ts` | Pack catalog + access control |
| `src/utils/payments.ts` | Pack purchase → download flow |
| `src/screens/HomeScreen.tsx` | Pack previews (triggers loadPack) |
| `src/powersync/AppSchema.ts` | Schema (packs catalog table) |

---

## 17. Architecture Decisions & Constraints

1. **No barrel exports** — every import uses direct file path
2. **All types in `src/types.ts`** — no inline type exports elsewhere
3. **PowerSync for structured data** (progress, streaks, catalog, entitlements); **react-native-fs for blob data** (pack JSON files)
4. **Zustand for all UI state** — no React Context for business logic
5. **Skia canvas** — not React Native View-based rendering for puzzle grid
6. **Debounced saves** — progress writes at 400ms, prefetch at 2s
7. **Reanimated worklets** — zoom/pan on UI thread, not JS thread
8. **Anonymous-first** — users start without an account; progress preserved on upgrade
9. **Adapty for IAP** — not direct StoreKit/Play Billing; webhook-driven entitlement sync

---

## 18. Proposed Implementation Plan (Next Steps)

Given the goal of fully local-first pack + streak caching:

### Phase 1: Eager Free Pack Download
- After `warmStreakPackCaches()`, trigger download of all free packs
- Extend `prefetch.ts` to accept a list of `PackCatalogItem[]` (not just streak types)
- Free packs: download full content; paid packs: download first puzzle only (preview)
- Use same ETag mechanism already in place

### Phase 2: Pack-Access-Aware Downloads
- On entitlements load, if user owns a paid pack → trigger full download
- On premium purchase → trigger download of all packs (user now has access to all)
- On pack purchase → already downloads in `purchasePack()` (already implemented)

### Phase 3: Startup Orchestration
- Cold-start sequence: streaks first (already done) → free packs → owned packs
- All async, all parallel within each tier
- Splash screen can still hide after streaks ready (fastest path)
- Free/owned pack downloads run in background after splash

### Phase 4: Preview Caching for Paid Packs
- Extract first puzzle from paid pack JSON before caching to disk
- Store as `{packId}_preview.json` (or pass a `puzzleCount: 1` limit to the downloader)
- LibraryScreen shows first puzzle thumbnail even for unpurchased paid packs

These phases are additive and non-breaking — the existing 3-layer cache in `packs/index.ts` already handles the storage; we just need to trigger downloads earlier and more broadly.
