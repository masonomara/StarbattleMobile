# Storage System Research

## Current Architecture

### Storage Engine: MMKV

The app uses `react-native-mmkv` v4 (via `createMMKV()`) as its sole persistence layer. MMKV is a key-value store backed by memory-mapped files on-device. It is synchronous and fast, but it is **device-local** — data lives in the app's sandboxed filesystem and cannot be accessed from other devices or survive app reinstallation.

A single MMKV instance is created with id `"starbattle"`:

```ts
const storage = createMMKV({ id: 'starbattle' });
```

All data for every user lives in this one instance. Namespacing happens via key prefixes.

---

### Key Namespacing

Keys are namespaced by a `userId` variable (module-level `let`, defaults to `"local"`):

```
{userId}:settings          → UserSettings JSON
{userId}:progress:{puzzleId}  → Progress JSON
```

`setUserId(id)` and `getUserId()` are exported but **never called** anywhere in the codebase. Every read/write currently uses the default `"local"` prefix. This was scaffolded for future account support but is completely inert today.

Puzzle IDs follow the pattern `{packId}:{index}` (e.g. `"intro:0"`, `"1star-5x5:3"`).

---

### Data Shapes

**UserSettings** (`src/types/state.ts`):
| Field | Type | Default |
|---|---|---|
| autoXNeighbors | boolean | true |
| autoXRowsCols | boolean | false |
| highlightErrors | boolean | true |
| showTimer | boolean | true |
| theme | `'system' \| 'light' \| 'dark'` | `'system'` |
| haptics | boolean | true |

Stored as a single JSON blob. On read, defaults are merged over the stored value (`{ ...DEFAULT_SETTINGS, ...JSON.parse(json) }`), so new settings fields are forward-compatible.

**Progress** (`src/types/state.ts`):
| Field | Type | Notes |
|---|---|---|
| puzzleId | string | `{packId}:{index}` |
| cells | CellValue[] | Flat array, length = size\*size. 0=empty, 1=star, 2=marked |
| timeMs | number | Elapsed solve time in ms |
| completed | boolean | Win state |
| completedAt | number? | Epoch ms, set on first completion |
| updatedAt | number | Epoch ms, set on every save |

Each puzzle gets its own key. There is no aggregate "pack progress" object — pack completion counts are computed on-the-fly by iterating all puzzle keys in `getCompletedCount()`.

---

### Read/Write Call Sites

| Caller                              | Function Used                      | When                                        |
| ----------------------------------- | ---------------------------------- | ------------------------------------------- |
| `store.ts` → `loadPuzzle()`         | `getProgress(puzzleId)`            | On puzzle load, to restore saved cell state |
| `store.ts` → `tapCell()`            | `getSettings()`                    | Every tap, for autoX and haptics prefs      |
| `store.ts` → `undo()`               | `getSettings()`                    | Every undo, for haptics pref                |
| `store.ts` → `persistProgress()`    | `saveProgress(progress)`           | After every tap and undo                    |
| `HomeScreen.tsx` → `renderPack()`   | `getCompletedCount(packId, total)` | Every render / focus                        |
| `PackScreen.tsx` → `renderPuzzle()` | `getProgress(puzzleId)`            | Every render / focus                        |
| `useTheme.ts` → `useTheme()`        | `getSettings()`                    | Every component using theme                 |

**No screen or component calls `saveSettings()` today.** There is no settings UI yet. Settings are only read, never written from the UI — the defaults are used.

**No code calls `setUserId()` or `getUserId()`.** The user ID mechanism is dead code.

---

### Data Flow: Puzzle Lifecycle

1. **User navigates to PuzzleScreen** → `parsePuzzle()` creates a `Puzzle` from the raw JSON → `loadPuzzle()` is called on Zustand store.
2. **`loadPuzzle()`** calls `getProgress(puzzleId)` synchronously. If saved progress exists, cells/time/completed are restored. Otherwise, fresh empty board.
3. **User taps a cell** → `tapCell()` reads `getSettings()` synchronously for autoX/haptics prefs → mutates cells in Zustand → calls `persistProgress()`.
4. **`persistProgress()`** builds a `Progress` object from current Zustand state and calls `saveProgress()` → serializes to JSON and writes to MMKV.
5. **User completes puzzle** → `completed: true` is set → next `persistProgress()` call writes `completedAt` timestamp.
6. **User navigates back** → PackScreen/HomeScreen re-render, calling `getProgress()`/`getCompletedCount()` to show updated completion state.

All storage access is **synchronous** and happens on the JS thread. There is no batching, debouncing, or background write. Every cell tap triggers a full progress serialization and MMKV write.

---

### Data Flow: Completion Counting

`getCompletedCount(packId, puzzleCount)` iterates `0..puzzleCount-1`, calling `getProgress()` for each index. For a 25-puzzle pack, this is 25 synchronous MMKV reads + JSON parses per render. This happens in the `renderPack` function of HomeScreen, meaning it runs for every visible pack card on every focus event.

---

### What is NOT Stored

- **Move history** (`moveLog`): Lives only in Zustand runtime state. Lost on navigation away from PuzzleScreen. Not persisted.
- **Pack-level aggregates**: No stored completion count, best time, or unlock state. Computed on-the-fly.
- **User identity**: No auth token, email, display name, or account reference.
- **Sync metadata**: No `lastSyncedAt`, version vector, or conflict markers.

---

## Consumers & Coupling Analysis

### Direct MMKV Coupling

Only `src/storage.ts` touches the MMKV instance. All other code goes through exported functions. This is clean — swapping the persistence backend only requires changing `storage.ts` internals.

### Zustand Store Coupling

The Zustand store (`src/store.ts`) imports `getProgress`, `saveProgress`, and `getSettings` directly from `storage.ts`. It calls them synchronously inside actions:

- `getProgress()` in `loadPuzzle()` — blocking on mount
- `getSettings()` in `tapCell()` and `undo()` — blocking on every interaction
- `saveProgress()` in `persistProgress()` — blocking write after every mutation

This tight coupling means the store assumes storage is instant and local. If storage becomes async (e.g. network-backed), every call site needs to change.

### Screen Coupling

`HomeScreen` and `PackScreen` call storage functions directly in render paths (not through Zustand). They call `getCompletedCount()` and `getProgress()` during `renderItem` callbacks, meaning storage reads happen during list rendering. This is fine for MMKV (microsecond reads) but would be catastrophic with async storage.

### Theme Coupling

`useTheme()` calls `getSettings()` on every render of every themed component. This is the most frequent storage read in the app. It does NOT subscribe to changes — if settings change, components don't re-render until some other trigger causes them to.

---

## Gaps for User Account Migration

### 1. No User Identity Layer

`userId` exists as a module-level variable but nothing sets it. There is no:

- Auth state management (logged in / logged out / anonymous)
- User profile type
- Auth provider integration
- Session persistence

### 2. No Data Migration Path

When switching from `"local"` to an actual user ID, existing progress data under `"local:progress:*"` keys needs to be migrated to `"{newUserId}:progress:*"` keys. There is no migration function.

### 3. No Sync Infrastructure

For accounts to be useful, progress must eventually sync to a server. The current architecture has no:

- Sync queue or dirty-tracking
- Conflict resolution strategy
- Optimistic/pessimistic write modes
- Network state awareness

### 4. No Pack-Level Progress Object

Pack progress is computed by iterating individual puzzle keys. For sync purposes, a denormalized `PackProgress` record would reduce server roundtrips and provide a cleaner sync unit. The type was planned (`PackProgress` appears in the original plan.md) but was never implemented.

### 5. Settings Are Read Synchronously Everywhere

`getSettings()` is called in render paths and in every tap handler. If settings need to come from a user account (server-backed), these call sites need to become async-aware or settings need to be cached in Zustand state.

### 6. No Offline-First Design

The current design is offline-only by default (MMKV), but there's no explicit offline-first architecture that would gracefully handle:

- Writing locally while offline, syncing when online
- Merging server state with local state on login
- Handling the anonymous-to-authenticated upgrade path

### 7. Completion Counting is O(n) Per Pack

`getCompletedCount()` does N individual key lookups per pack. With 5 packs of ~25 puzzles each, that's 125 MMKV reads on HomeScreen focus. This won't scale if pack sizes grow or if reads become async.

---

## MMKV Key Inventory (Current State)

With userId = `"local"` and 5 packs:

```
local:settings
local:progress:intro:0
local:progress:intro:1
...
local:progress:intro:24   (intro has 25 puzzles)
local:progress:1star-5x5:0
...
local:progress:2star-10x10:N
```

Each progress key holds ~200-800 bytes of JSON depending on board size (a 10x10 board's cells array has 100 entries).

---

## Summary of Storage Touchpoints

```
App.tsx
  └─ Navigation
       ├─ HomeScreen
       │    └─ getCompletedCount() ← storage.ts (per pack, on focus)
       ├─ PackScreen
       │    └─ getProgress() ← storage.ts (per puzzle, on focus)
       └─ PuzzleScreen
            └─ usePuzzleStore
                 ├─ loadPuzzle() → getProgress() ← storage.ts
                 ├─ tapCell() → getSettings() ← storage.ts
                 │            → persistProgress() → saveProgress() ← storage.ts
                 └─ undo() → getSettings() ← storage.ts
                           → persistProgress() → saveProgress() ← storage.ts

useTheme() → getSettings() ← storage.ts (every themed component render)
```

Every arrow to `storage.ts` is a synchronous MMKV read or write. The store is the only writer. Screens and `useTheme` are readers.
