# StarbattleMobile — Greenfield Research

**Date:** 2026-05-17

This document synthesizes a deep read of the current beta codebase with up-to-date research on every technology layer. The goal is comprehensive understanding — not decisions. Every section covers what we have now, what alternatives exist, and what the trade-offs are.

---

## 1. Current Codebase — Deep Implementation Notes

### Store architecture

Two Zustand stores. The split is correct and should carry forward.

**`usePuzzleStore`** (`src/store.ts`, 431 lines) — ephemeral per-session game state:
- `cells: CellValue[]` — flat 1D array, index = `row * size + col`
- `autoMarks: Set<number>` — cell indices auto-marked by rules
- `errorCells: Set<number>` — constraint violations
- `moveLog: Move[]` / `redoStack: Move[]` — undo/redo history
- `hintGhosts: Map<number, 'star' | 'mark'>` — visual overlay for hints
- `tapMode: 'cycle' | 'erase'`
- `completed: boolean`, `timeMs: number`

**`useUserStore`** (`src/stores/userStore.ts`, 92 lines) — persistent user data:
- `settings: UserSettings` — 8 toggles/enums
- `progress: ProgressState` — completed puzzles per pack, total counts
- `streaks: Streak[]` — daily/weekly/monthly streak objects

There is a **store subscription outside React** at the bottom of `store.ts` (lines 415–430): the puzzle store subscribes directly to userStore for `autoX*` setting changes and calls `recomputeAutoMarks()` when they change. This is correct in principle but brittle — if `puzzle` is null at subscription fire time, it silently no-ops. The guard `if (!puzzle) return` is present but the pattern makes initialization order fragile.

### Cell indexing

Cells are stored as a 1D flat array: `index = row * puzzle.size + col`. Row and column are derived as `Math.floor(index / size)` and `index % size`. This is consistent throughout. The move log stores `{ index, prev, next }` tuples.

### Undo/redo implementation — potential bug

The redo stack construction after an undo is subtle:

```ts
// After undo, the redoMove is built like:
const redoMove = {
  changes: lastMove.changes.map(c => ({
    index: c.index,
    prev: cells[c.index],   // cells has ALREADY been mutated by the undo at this point
    next: c.prev,
  }))
}
```

This works because `cells[c.index]` after undo equals `c.prev` (the before-state that was just restored). However it's fragile — if the mutation order changes this silently produces wrong redo data. A clearer implementation would be `prev: c.next, next: c.prev` (invert the move directly without reading from mutated state).

### Auto-save: 5-second interval in PuzzleScreen

`PuzzleScreen` sets a `setInterval` every 5 seconds. There is no `onBeforeRemove` navigation listener — if the user force-closes or navigates away exactly between saves, the last changes are lost. Maximum possible loss: 4.9 seconds of moves. For a puzzle game this is acceptable but imperfect.

### Draw gesture: transform-aware coordinate math

`useDrawGesture.ts` inverts the zoom/pan transform to convert screen coordinates to board-local cell indices:

```ts
const boardX = (screenX - offsetX) / scale;
const boardY = (screenY - offsetY) / scale;
const col = Math.floor(boardX / cellSize);
const row = Math.floor(boardY / cellSize);
```

This is correct but the values `offsetX`, `offsetY`, `scale` are read from refs — not from shared values. This means there is a potential frame-latency issue: if the board is panning during a draw gesture, the offset values used for hit testing may be one frame stale. In practice this is imperceptible for a slow puzzle game.

### Gesture composition

```ts
const gesture = Gesture.Simultaneous(
  pinchGesture,
  Gesture.Race(drawGesture, panGesture),
);
```

Pinch runs simultaneously with either draw or pan, but draw and pan race (first to activate wins). The draw gesture has a 150ms `activateAfterLongPress`, so quick pan wins the race, long-press wins for drawing. This is the right architecture.

### Hint system

Hints are pre-computed solver steps in each puzzle's JSON. `showHint()` iterates `puzzle.hints` linearly to find the first incomplete step — O(n) over the hint array. For current puzzle sizes (~20–50 hints), this is instant. The system is elegant because no runtime solver runs on device — hints are baked at generation time.

### Streak puzzle selection

Active puzzle = `epochDays % packSize`. All users with the same date see the same puzzle. The epoch is hardcoded to January 1, 2025. Streak key formats: daily `YYYY-MM-DD`, weekly `YYYY-WXX`, monthly `YYYY-MM`. Incrementing requires the previous period's key to match `lastCompletedKey` — gap resets streak to 1.

### Rendering stack

```
BoardView (Animated.View with transform)
  ├── CellView × N²   (memoized, SVG star/X)
  ├── CellGridSvg     (static SVG overlay, 1px lines)
  └── RegionBordersSvg (static SVG overlay, 3px borders)
```

CellView is memoized with `React.memo` and uses `useShallow` selectors. On each cell tap, only the affected cells re-render. SVG overlays are static — they re-render only when the puzzle changes (navigation). This is efficient for the current SVG approach.

### Theme system

`useTheme()` returns 16 tokens. `cellSize: 32` is hardcoded — makes the board non-responsive to screen size and non-adaptive for larger grids (a 12x12 grid at 32px per cell = 384px wide, which fits on most phones but leaves no room for zoom without gesture). The zoom system compensates via pinch-to-zoom.

### Known implementation gaps

1. `navigation: any` — no typed navigation params anywhere; `useNavigation<any>()` throughout
2. No error boundaries anywhere
3. `Pack.free` and `Pack.version` fields are typed but unused in any UI logic
4. `parsePuzzle()` has zero input validation — any malformed SBN string throws uncaught
5. Move log is unbounded — a very long session could accumulate thousands of moves in memory
6. No `onBeforeRemove` save hook on navigation away from puzzle

---

## 2. State Management

### Zustand 5 (current)

**v5 changes from v4:** Dropped React <18, removed `use-sync-external-store` polyfill (uses native React hook), removed ES5 output, `create()` no longer accepts custom equality function. Persist middleware no longer stores initial state on create. These are all breaking changes from v4 but the app was written against v5 from the start.

**Performance:** Coarse-grained by default. All subscribers to a store re-render on any state change unless you write precise selectors with `useShallow`. The current codebase does this correctly. As state grows, selector discipline becomes mandatory.

**Persistence:** No built-in. Requires `persist` middleware + `StateStorage` adapter. The existing MMKV adapter is synchronous and correct.

**Cloud sync:** Zero built-in support. You wire it yourself (typically TanStack Query on top for server state).

**New Architecture:** Pure JS, no native modules — fully compatible.

**Verdict:** Correct choice for the beta. No reason to change for local-only gameplay state.

---

### Jotai 2

Atomic model — each `atom()` is independent. Components subscribe only to atoms they read. Fine-grained reactivity by default, no selector discipline needed.

**Best fit for settings:** One atom per setting, each persisted independently via `atomWithMMKV()`. Changing one setting re-renders only components that read it — Zustand's whole-store subscription on settings would re-render everything.

**Less fit for puzzle session state:** A puzzle session (cells, autoMarks, errorCells, moveLog, redoStack, hintGhosts, completed, timeMs, tapMode, puzzle) is naturally a coherent blob, not 10 independent atoms. Decomposing it atomically is awkward and makes cross-atom operations (undo/redo touches cells + autoMarks + redoStack simultaneously) require atom families or derived atoms.

**Community:** ~4M weekly downloads vs Zustand's 33M.

**Verdict:** Worth considering for settings store only. Not a replacement for the puzzle session store.

---

### Legend State v3

Observable/signal-based state. You define `observable()` objects, read with `.get()`, write with `.set()`. Components become reactive with `observer()` HOC. Only the component that reads a specific observable leaf re-renders when that leaf changes — inherently more granular than Zustand.

**Built-in persistence with MMKV (first-party plugin):**
```ts
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
syncObservable(store$, {
  persist: { name: 'puzzleProgress', plugin: ObservablePersistMMKV }
})
```
Zero boilerplate — declarative, automatic, real-time.

**Built-in Supabase sync (first-party plugin):**
```ts
syncObservable(store$, {
  persist: { name: 'progress', plugin: ObservablePersistMMKV },
  sync: syncedSupabase({
    supabase, collection: 'progress',
    select: (from) => from.filter('user_id', 'eq', userId),
    changesSince: 'last-sync',
  })
})
```
This handles: local persistence, offline queue, retry on reconnect, delta sync, realtime subscriptions — in one call. This is the most compelling aspect for the cloud sync roadmap.

**Performance:** Described as the fastest React state library. For a 10x10 board where one cell changes per tap, only the component rendering that exact cell re-renders. No `useShallow` discipline required.

**Risks:**
- ~50K weekly downloads (Zustand is 660× larger community)
- v3 is still maturing — API has been changing across releases
- Smaller community = fewer Stack Overflow answers and third-party recipes
- Observable/signal mental model is a learning curve shift from Zustand

**Verdict:** The most compelling alternative when cloud sync is being designed. If v3 has stabilized by the time the alpha starts, the built-in Supabase sync story would save significant infrastructure work versus a Zustand + TanStack Query custom sync layer.

---

### Valtio, Redux Toolkit, TanStack Query

**Valtio:** Proxy-based mutable state. Similar simplicity to Zustand but less structured. No built-in sync or persistence. Skip.

**Redux Toolkit:** Significantly more boilerplate for a game. RTK Query is excellent for server state but that is exactly the role TanStack Query fills better. Bundle is ~40KB+. Not recommended as primary store.

**TanStack Query v5:** Server-state synchronization library — not a state manager. Fetches, caches, invalidates server data. `PersistQueryClientProvider` + MMKV persister enables offline caching of server responses. The right tool to add when cloud sync features are built, layered on top of whichever local state solution is chosen.

---

### State Management Summary

| Library | Bundle | Granularity | Local Persistence | Cloud Sync | Community |
|---|---|---|---|---|---|
| Zustand 5 | 2.7KB | Manual selectors | Compose + MMKV | DIY | 33M/wk |
| Jotai 2 | 3.4KB | Atomic (excellent) | atomWithStorage + MMKV | DIY | 4M/wk |
| Legend State v3 | 4KB | Fine-grained (best) | First-party MMKV plugin | First-party Supabase plugin | 50K/wk |
| TanStack Query 5 | 14KB | Server state only | PersistQueryClient | First-class | 12M/wk |

**Direction:** Keep Zustand for local game session state. Evaluate Legend State v3 seriously when designing the cloud sync architecture — it could collapse the entire local + sync + persistence story into one declarative layer.

---

## 3. Navigation

### React Navigation v7 (current)

**v7 key improvements:**
- `useSyncExternalStore` decouples screen rendering from parent navigation state — components don't re-render from nav changes they don't read
- Native stack (`@react-navigation/native-stack`) uses `UINavigationController` on iOS and `FragmentTransaction` on Android — real native transitions
- Swipe-back runs on the UI thread at 60fps even when JS thread is busy
- Static API for type-safe navigation without manual param list declarations

**v7 typed navigation (static API):**
```ts
const RootStack = createNativeStackNavigator({
  screens: { Home: HomeScreen, Pack: PackScreen, Puzzle: PuzzleScreen }
});
type RootStackParamList = StaticParamList<typeof RootStack>;
// useNavigation() is now fully typed everywhere — no casting to any
```
The current codebase uses `navigation: any` everywhere. Adopting the static API on the alpha would fix this completely.

### React Navigation v8 (alpha, April 2026)

- **`React.Activity` screen pausing** — inactive screens pause rendering entirely using React 19's concurrent feature. For a puzzle game, this means the puzzle board stops all renders (including the timer tick) when navigating to the home screen — correct behavior, zero implementation work.
- Bottom Tab Navigator uses native iOS 26 / Material You primitives by default
- Deep linking enabled by default with automatic path generation from screen names
- TypeScript inference reworked — "technically possible to write an entire app without any manual type annotations for navigation"
- `pushParams` for history-style navigation without pushing a full new screen

**Verdict:** React Navigation v7 native-stack is the correct choice now. Watch v8 for stable release — the `React.Activity` screen pausing is directly relevant and would solve the timer/autosave lifecycle problem elegantly. The static API in v7 should be adopted on the alpha to eliminate all `navigation: any` casts.

### React Native Navigation (Wix)

100% native navigation — state lives on the native side, no JS navigation layer. Genuine 60fps transitions on older devices. However:
- Significantly more complex setup in bare RN
- Component registration model (`Navigation.registerComponent`) vs declarative JSX
- New Architecture support has lagged React Navigation in responsiveness
- Not justified for a three-screen puzzle game

**Verdict:** Skip.

---

## 4. Local Storage

### MMKV v4 / Nitro (current — `react-native-mmkv`)

**v4 is a Nitro Module** — pure C++ via `react-native-nitro-modules`. All reads/writes are synchronous on the JS thread with zero bridge round-trips. ~30× faster than AsyncStorage in benchmarks.

**Strengths:**
- Per-instance AES-128/256 encryption
- Multiple isolated instances (one per user, one for settings)
- Reactive `addOnValueChangedListener` for Zustand/Jotai persistence adapters
- Tiny footprint

**Hard limits:**
- Key-value only — no queries, no relational data
- All data must be JSON blobs — no way to ask "all packs where `completed > 0`" without deserializing and filtering in JS
- File grows but does not shrink — 1,000 puzzles × progress blobs = meaningful file bloat over time
- Not queryable for the account/entitlement model (which pack did the user purchase? when did they subscribe?)

**Verdict:** Keep for settings, auth tokens, small fast blobs. Insufficient as the sole store once structured data arrives (purchase records, per-puzzle state at scale, relational queries).

---

### op-sqlite

JSI-based SQLite. Direct successor to `react-native-quick-sqlite`. 5–8× faster than non-JSI SQLite packages. Pairs with Drizzle ORM or TypeORM for type-safe queries.

**Strengths:**
- Full SQL — complex queries, joins, indexes, foreign keys
- Scales to thousands of puzzles and granular per-cell state
- WAL mode for concurrent read/write
- Used by PowerSync as its embedded SQLite runtime
- No Expo dependencies

**Weaknesses:**
- No reactive subscriptions out of the box
- No built-in sync protocol
- Schema migrations are your responsibility (Drizzle handles this)

**Verdict:** The right local engine for structured game data. Use alongside MMKV (not instead of it).

---

### WatermelonDB

Reactive SQLite ORM with a built-in sync protocol. The sync design is mature.

**Critical blocker:** GitHub issue #1851 (November 2024) — WatermelonDB's JSI path is incompatible with React Native 0.76+ new architecture. No fix has shipped and no timeline has been given. Running without JSI works but gives up the performance advantages and may not be viable as the old arch is fully phased out.

**Verdict:** Avoid for a greenfield app on RN 0.76+. The architecture incompatibility is a real risk.

---

### Realm / Atlas Device SDK

MongoDB deprecated Atlas Device Sync in September 2024. End-of-life was September 30, 2025. The sync service has been shut down. **Do not use.**

---

### Storage Summary

| Library | Type | Queryable | Sync | New Arch | Bare RN |
|---|---|---|---|---|---|
| MMKV v4 | Key-value | No | No | Yes (Nitro) | Yes |
| op-sqlite + Drizzle | Relational SQL | Full SQL | No | Yes (JSI) | Yes |
| WatermelonDB | Reactive ORM | Limited | Built-in | Broken (0.76+) | Yes |
| Realm/Atlas | Object store | Yes | Dead | Unknown | Yes |

**Recommended local stack:** MMKV for auth tokens + settings + small blobs. op-sqlite + Drizzle for all structured game data.

---

## 5. Cloud Sync and Backend

### Supabase

Postgres + PostgREST + Realtime + Auth + Storage + Edge Functions. Hosted or self-hostable.

**React Native SDK:** `@supabase/supabase-js` — pure JavaScript, no native modules. Token storage pluggable (use MMKV wrapper).

**Offline-first reality:** Supabase has NO native offline sync. The JS client does not queue writes or cache reads offline. If the device is offline, writes fail with network errors and reads return nothing. Auth token refresh also fails offline.

**Offline workarounds used in production:**
1. PowerSync on top of Supabase (purpose-built, see below)
2. Legend State Supabase plugin (lightweight reactive observable with offline queue)
3. WatermelonDB push/pull functions to Supabase (blocked by the new arch issue)

**Verdict:** The right backend choice (Postgres, self-hostable, excellent DX). But you must add PowerSync or Legend State to get offline-first semantics.

---

### Firebase / Firestore

Document database with built-in offline persistence. **Firestore offline mode is first-class and enabled by default on mobile.** Local writes apply optimistically and sync when connectivity returns. The SDK queues offline writes automatically.

**React Native SDK:** `@react-native-firebase` — native modules (Objective-C/Java). Excellent bare RN support, no Expo dependencies.

**Conflict resolution:** Last-write-wins at the field level. No custom conflict logic.

**Cost risk:** No hard spending caps. $0.06 per 100,000 reads beyond the free tier. A game doing 50 reads/session at 10K DAU = ~$270/month in reads alone. Firebase requires careful data modeling to minimize reads from day one. Bill shock is a well-documented, real risk.

**No self-hosting.**

**Verdict:** Best native offline experience with zero sync setup. Cost unpredictability at scale and no self-hosting are the reasons teams choose Supabase + PowerSync instead. If offline simplicity matters more than cost control at scale, Firebase is a legitimate choice.

---

### PowerSync

A sync engine that sits between Postgres (Supabase, Neon, etc.) and client SQLite. Reads the Postgres WAL and streams changes to the client. Client writes go to your own API endpoint.

**Architecture:** Client embeds SQLite (op-sqlite fork). PowerSync service manages sync protocol. Your Postgres is source of truth. Sync is read-direction from Postgres to client; writes go through your backend API (which you write).

**Offline-first semantics:** Proper. Local SQLite reads work with zero network. Writes queue locally and flush on reconnect. This is the correct offline-first architecture.

**React Native SDK:** `@powersync/react-native` — actively maintained, uses embedded SQLite, supports bare RN.

**Pricing:** Free: 50 concurrent connections, 2 GB synced/month. Pro: $49/month — 1,000 peak concurrent connections, 30 GB/month. Self-hosted open-edition available (free, source-available).

**Conflict resolution:** Custom — you implement conflict logic in your backend when processing write requests.

**Verdict:** The most architecturally sound offline-first choice when using Supabase. Adds complexity (you need PowerSync service + your own write API) but gives genuine SQLite offline querying, Postgres as source of truth, and avoids Firebase vendor lock-in.

---

### Electric SQL

Postgres-to-client sync via shape-based subscriptions. Primarily targets web and Expo. Bare RN integration requires more custom wiring than PowerSync. Less mature for bare RN.

**Verdict:** Monitor. PowerSync is the better choice for bare RN today.

---

### Backend Summary

| Service | Offline-first | Conflict Resolution | RN SDK | Cost at Scale | Self-host |
|---|---|---|---|---|---|
| Supabase alone | No | Manual | Excellent (pure JS) | Low (Postgres) | Yes |
| Firestore | Yes (native) | Last-write-wins | Excellent (native modules) | Risky at scale | No |
| PowerSync + Supabase | Yes (SQLite) | Custom (your API) | Good, active | $49+/month | Yes (OSS) |
| Electric SQL | Partial (Expo-first) | Last-write-wins | Developing | TBD | Yes |

**Recommended backend:** Supabase + PowerSync. Real Postgres backend, self-hostable sync, genuine offline-first, no Firebase vendor lock-in, no unpredictable billing.

---

## 6. Authentication

### Supabase Auth

Pure JavaScript client — no native modules, no Expo dependencies. Token storage pluggable via MMKV.

**Apple Sign In (required by App Store):** `signInWithIdToken()` — you get the Apple credential using `@invertase/react-native-apple-authentication`, then pass the token to Supabase. This is the standard bare RN pattern, well-documented.

**Google Sign In:** Same pattern — `@react-native-google-signin/google-signin` gets the token, pass to Supabase.

**Anonymous → permanent upgrade:** `signInAnonymously()` creates an anonymous session. Upgrading uses `updateUser()` or `linkIdentity()`. Known bug: `linkIdentity()` with Apple in React Native returns a web OAuth URL instead of triggering native Apple auth. Workaround: pass the native Apple ID token via `signInWithIdToken()` to convert/link the session. Workable but requires explicit handling.

**Verdict:** Natural fit if using Supabase backend. No Expo dependencies.

---

### Firebase Auth

Native modules via `@react-native-firebase/auth`. Excellent bare RN support.

**Apple Sign In:** `@invertase/react-native-apple-authentication` → `firebase.auth.AppleAuthProvider.credential()` → `signInWithCredential()`. Well-documented.

**Anonymous → permanent upgrade:** `linkWithCredential()` — promotes anonymous user to permanent while preserving UID and all data. **This is the best-implemented anonymous upgrade flow of all options.** Firestore data owned by the anonymous UID is automatically accessible after upgrade.

**Verdict:** Best anonymous-to-account upgrade flow. Natural choice if going all-in on Firebase.

---

### Clerk

Auth-as-a-service with hosted UI components. Native Apple Sign In added November 2025.

**Bare RN reality:** Clerk's React Native SDK is `@clerk/expo`. It has `expo: >=53 <56` as a peer dependency and uses `expo-secure-store`, `expo-apple-authentication`, and `expo-crypto`. There is no non-Expo Clerk SDK. You can install these individual Expo modules in a bare RN project, but you are importing Expo native module infrastructure into a non-Expo project. Not clean.

**Verdict:** Avoid for bare RN. Best for Expo-first teams.

---

### Auth Summary

| Solution | Bare RN | Native Apple Sign In | Anonymous → Permanent | Complexity |
|---|---|---|---|---|
| Supabase Auth | Yes (pure JS) | Yes (via token passthrough) | Yes (linkIdentity workaround) | Medium |
| Firebase Auth | Yes (native modules) | Yes | Yes (best-in-class) | Medium |
| Clerk | Workable (needs Expo modules) | Yes (Nov 2025) | Yes | Low (hosted UI) |
| react-native-app-auth | Yes | No (web OAuth only) | No built-in | High |

**Recommended:** Supabase Auth if using Supabase + PowerSync. Firebase Auth if going all-in Firebase.

---

## 7. Payments and Subscriptions

### RevenueCat

Industry standard for mobile subscriptions. Wraps StoreKit (iOS) and Google Play Billing (Android), manages entitlements, receipt validation, and subscription lifecycle server-side.

**React Native SDK:** `react-native-purchases` — bare RN compatible, no Expo dependency. Minimum RN 0.73.

**Key features:**
- Entitlement system: define "premium" once, SDK reports whether user has it regardless of how they bought it (subscription, one-time purchase, promo code)
- Server-side receipt validation
- Cross-device entitlement sync: subscribe on iPhone, open on Android — entitlements sync via RevenueCat backend
- Per-pack (consumable) purchases alongside subscriptions
- Webhooks for lifecycle events → connect to your backend to update Postgres

**Pricing:** Free up to $2,500 MTR, then 1% of revenue beyond.

---

### Adapty

RevenueCat alternative with identical architecture.

**Differentiators:**
- Free up to $5,000 MTR (double RevenueCat)
- Built-in visual paywall builder with 50+ templates and A/B testing
- Web payments via Stripe/Paddle in addition to StoreKit/Play Billing
- Smaller community and fewer third-party integrations

**Pricing:** Free up to $5,000 MTR, then 1% beyond.

---

### Direct StoreKit / Google Play Billing

Writing your own receipt validation, subscription lifecycle, and entitlement management. `react-native-iap` is the most popular community library for this.

**Cost:** Free SDK. However: two completely different APIs (iOS/Android), complex edge cases (offer codes, grace periods, refunds, StoreKit 1 vs 2), requires your own server for receipt validation, and documented reliability issues with `react-native-iap`.

**Only worth it above ~$10M ARR** where the 1% SDK fee exceeds the engineering cost.

---

### Payments Summary

| Solution | Bare RN | Entitlements | Cross-device | Free Tier MTR | Beyond Free |
|---|---|---|---|---|---|
| RevenueCat | Yes | Yes | Yes | $0–$2.5K | 1% |
| Adapty | Yes | Yes | Yes | $0–$5K | 1% |
| Direct StoreKit | Yes (react-native-iap) | DIY | DIY | Free | Engineering cost |

**Recommended:** Adapty for a new game — better free tier, strong paywall A/B testing, bare RN SDK. Migrate to RevenueCat if ecosystem integrations (Amplitude, Braze, etc.) become important later. Adapty → RevenueCat migration is documented and typically takes <24 hours.

**Entitlement webhook flow:** Adapty webhook → Supabase Edge Function → update `user_entitlements` table in Postgres → PowerSync streams the change to client SQLite.

---

## 8. Rendering

### react-native-svg (current)

SVG elements are native React Native view nodes that go through full React reconciliation. Every state change re-renders the affected SVG subtree. For static grids this is invisible. For a 12x12 grid with per-cell state-driven animations simultaneously (star placement, error flash, hint overlay, win sweep), frame budget pressure becomes real on mid-range Android.

**Known issues:**
- GitHub issue #2660: flickering and incomplete rendering with ~100+ concurrent SVG elements containing images
- Memory leaks on iOS with deeply nested SVG hierarchies
- No worklet-side draw path — all SVG updates go through the JS thread

**Touch on SVG:** SVG elements support `onPress` but composing pinch-to-zoom with per-cell taps requires careful layering. Not as clean as a Skia canvas where all touch is handled by one GestureDetector.

**Performance ceiling:** Static grids are fine. Many simultaneously animated cells on larger grids is marginal on mid-range Android.

---

### react-native-skia

Skia renders directly to the GPU via Shopify's binding of Google's Skia engine. The entire canvas is a single native view. All draw calls happen on the GPU without going through React's reconciler per frame. Shared values from Reanimated update canvas elements in worklets on the UI thread — zero JS thread involvement per frame.

**Performance:** SkiaList benchmarks show 120fps with thousands of shapes. On Samsung Galaxy A54 (budget Android): 120fps at 10 moving entities, 48fps at 50 simultaneously animated. A 12x12 puzzle grid with a handful of animated cells is well within budget.

**Touch on Skia:** Skia canvas elements are drawing instructions, not real views — no built-in per-element hit testing. The correct pattern for a fixed grid:
```ts
// GestureDetector wraps the entire Canvas
// Compute cell from gesture coordinates in the worklet:
const col = Math.floor(gestureX / cellSize);
const row = Math.floor(gestureY / cellSize);
```
No per-cell tap handler registration needed. The grid puzzle is an ideal case for this — fixed layout, uniform cell size, no dynamic repositioning.

**Draw gesture with Skia:** First-class support via `Skia.PathBuilder.Make()` as a shared value, built in worklets, rendered via `useDerivedValue`. The current draw-across-cells mechanic maps cleanly onto this model.

**New Architecture requirement:** Skia + Reanimated 4 requires RN 0.81+. Since new arch is the default from RN 0.76+, this is already the direction the ecosystem has committed to.

**Bundle size cost:** ~4MB addition.

---

### Plain React Native Views

Competitive when the grid is static layout (cells are colored Views) and interaction is tap-only with no zoom/pan. Inferior when you add pinch-to-zoom (transform container breaks individual cell Pressable hit areas), multi-cell draw gestures (no native equivalent), and custom shape rendering (non-rectangular region fills, star icons).

**Verdict:** Not appropriate for Star Battle's rendering needs.

---

### Rendering Summary

| Approach | Custom Shapes | Animated Cells (12x12) | Pinch+Pan | Draw Gesture | Worklet-driven | New Arch Required |
|---|---|---|---|---|---|---|
| react-native-svg | Good | Marginal | Complex | Complex overlay | No | No |
| react-native-skia | Excellent | Excellent | Native | Worklet PathBuilder | Yes | Yes (0.81+) |
| Plain RN Views | Poor | OK (tap only) | Breaks hit areas | Impossible natively | No | No |

**Recommended: Migrate to react-native-skia.** The rendering and gesture models are a better fit for a grid puzzle than SVG. The entire touch model simplifies: one GestureDetector on the canvas, coordinate math in worklets, no per-cell view registration.

---

## 9. Gestures

### RNGH v2 (current) vs v3

**v3 (current major version):**
- New Architecture only — drops legacy Paper/bridge support
- Hook-based API — React Compiler compatible
- SharedValues directly in gesture config — change gesture properties without re-renders
- Composition relations (`Simultaneous`, `Exclusive`, `Race`) now require all gestures to use the hooks API
- Callback renames: `onStart` → `onActivate`, `onEnd` → `onDeactivate`
- LLM-assisted migration tool available

The current app uses v2's new API (not the legacy handler API), so migration to v3 is primarily name changes.

---

### Correct gesture composition for Star Battle

The cleanest architecture for pinch + pan + long-press-draw uses `activateAfterLongPress` on the draw Pan gesture rather than composing a separate LongPress + Pan:

```ts
const drawGesture = Gesture.Pan()
  .activateAfterLongPress(400)   // Draw only activates after 400ms hold
  .maxPointers(1)                // Single finger only
  .onStart((e) => {
    'worklet';
    // begin painting at cell(e.x / cellSize | 0, e.y / cellSize | 0)
  })
  .onChange((e) => {
    'worklet';
    // paint current cell from coordinates
  });

const pinchGesture = Gesture.Pinch()...;
const panViewport = Gesture.Pan().minPointers(2)...;
const tapCell = Gesture.Tap().maxDuration(200)...;

const composed = Gesture.Simultaneous(
  Gesture.Simultaneous(pinchGesture, panViewport),
  Gesture.Exclusive(drawGesture, tapCell)
);
```

If the finger moves before the 400ms expires, the gesture fails — it becomes the pan-viewport gesture instead. This is the correct behavior.

**Known pitfalls:**
1. **Pointer count bleed** — when pinch fingers lift and user continues panning, state machine can get confused. Fix: `minPointers(2)` / `maxPointers(2)` on viewport pan, `maxPointers(1)` on draw.
2. **Android emulator pinch** — simultaneous pinch + pan is broken on Android emulator. Real device behavior is correct. Don't debug this on emulator.
3. **Coordinate space for hit testing** — gesture coordinates are in screen space. When board has been pinched/panned, invert the transform to get board-local coordinates. Store scale and offset as shared values, read in worklets.
4. **v3 composition requirement** — mixing old handler API and new `Gesture.*` composition silently breaks simultaneous/exclusive relations. Keep all gestures in one API style.

---

## 10. Animation

### Reanimated v3 (current) vs v4

**v4 (stable mid-2025, requires RN 0.81+):**
- **CSS Animations API** — declarative keyframe animations without shared values or worklet boilerplate
- **CSS Transitions API** — auto-animate property changes on state update (cell highlight on star placement, error flash, etc.)
- `react-native-worklets` extracted as independent package — non-animation libraries can now use the worklet runtime
- New scheduling APIs: `runOnRuntimeSync`, `runOnRuntimeAsync`, `scheduleOnRuntimeWithId`
- Spring animation: `duration` + `dampingRatio` instead of `stiffness`/`mass`
- **Fully API-compatible with v3** — no breaking code changes on upgrade

**For Star Battle:**

| Animation | Recommended Tool |
|---|---|
| Cell flash on star placement | Reanimated v4 CSS Transition on backgroundColor |
| Error pulse (wrong placement) | `withSequence(withTiming(red), withTiming(white))` worklet |
| Hint ghost overlay | `useDerivedValue` computing opacity from hint state |
| Win banner entrance | CSS Animation keyframes (v4) or `withSpring` + layout animation |
| Board zoom/pan transform | `useAnimatedStyle` with scale/translate shared values (unchanged from v3) |
| Cell scale pop on star | `withSpring(1.3)` then `withSpring(1)` — one-liner |

**Verdict:** Reanimated v4 if targeting RN 0.81+. The CSS Transitions API is a clean fit for per-cell state animations. Keep Reanimated shared values for gesture-driven transforms.

---

## 11. Haptics

### Current: `react-native-haptic-feedback` v3

Works on both old and new architecture. Does **not** support worklet invocation — calling it from inside a RNGH worklet callback silently fails or throws. The current app calls haptics from store actions (JS thread), not from worklets, so this works. If gestures are migrated to worklet-first (Skia + GH 3), haptics need a worklet-compatible library.

---

### Worklet-compatible alternatives

**`react-native-nitro-haptics` (recommended):**
- Built by oblador (author of `react-native-vector-icons`, trusted)
- Built on Nitro Modules — same JSI-based native module system as VisionCamera
- Worklet support via `NitroModules.box(Haptics)` — boxed object can be called from any worklet context
- New Architecture only
- iOS: all UIImpactFeedbackGenerator levels (light/medium/heavy/soft/rigid) + notification types + selection
- Android: 18 distinct HapticFeedbackConstants types

```ts
const boxedHaptics = NitroModules.box(Haptics);

const tapGesture = Gesture.Tap().onEnd(() => {
  'worklet';
  boxedHaptics.unbox().impact('light');
});
```

**Pulsar (Software Mansion):**
- 147 preset haptic patterns
- Worklet-compatible
- Useful if you want distinct patterns for star placement, error, and board completion

**`expo-haptics`:** Requires Expo SDK. Not appropriate for bare RN.

---

## 12. New React Native Architecture

### Status in 2026

New Architecture is **mandatory** since RN 0.76 (enabled by default) and the old bridge was permanently removed in RN 0.82. The app is already on new arch.

**What this means:**
- JSI replaces the async bridge — JS holds direct C++ references, enabling synchronous native calls
- TurboModules replace NativeModules — lazy-loaded, JSI-backed
- Fabric replaces the UI Manager — C++ rendering core, synchronous layout

**Shopify production numbers:** 43% faster cold startup, 39% improved rendering, 25% memory reduction.

**Library compatibility status:**

| Library | New Arch Status |
|---|---|
| Zustand 5 | Yes (pure JS) |
| Jotai 2 | Yes (pure JS) |
| Legend State v3 | Yes (pure JS) |
| react-native-mmkv v4 | Yes (Nitro Module) |
| React Navigation v7 | Yes |
| RNGH v3 | New arch only (dropped old arch) |
| Reanimated v4 | Yes, optimized for new arch |
| react-native-skia | Yes (requires RN 0.81+) |
| react-native-nitro-haptics | Yes (Nitro Module) |
| WatermelonDB | Broken on 0.76+ |

**For Star Battle:** The full recommended stack (Skia + GH 3 + Reanimated 4 + Nitro haptics) converges on new arch as a hard requirement. This is already the direction the ecosystem has committed to and the app is already in the right place.

---

## 13. Recommended Stack for the Alpha

Synthesizing all research into a concrete technology recommendation:

### Rendering
**react-native-skia** — single canvas, GPU-accelerated, worklet-driven. One GestureDetector on the canvas handles all touch; coordinate math in worklets computes cell from screen position. Eliminates N² CellView renders, enables per-cell animations without JS thread involvement.

### Gestures
**react-native-gesture-handler v3** — hooks API, New Arch only, worklet-based. Compose: `Simultaneous(pinch + two-finger-pan, Exclusive(long-press-draw, tap))`. Use `activateAfterLongPress` on the draw Pan gesture.

### Animation
**react-native-reanimated v4** — CSS Transitions API for per-cell state animations, shared values for gesture-driven board transforms.

### Haptics
**react-native-nitro-haptics** — worklet-compatible via Nitro boxing, New Arch only.

### Local State
**Zustand 5** for puzzle session state. Evaluate **Legend State v3** when designing cloud sync — its built-in MMKV + Supabase sync story may collapse the persistence and sync layers into one declarative solution.

### Local Storage
**react-native-mmkv v4** for settings, auth tokens, small blobs.  
**op-sqlite + Drizzle** for all structured data (puzzle progress, purchase records, entitlements).

### Navigation
**React Navigation v7** (native-stack). Adopt the static API for full TypeScript inference. Watch v8 for `React.Activity` screen pausing.

### Backend
**Supabase** — Postgres + Auth + Storage + Edge Functions. Self-hostable.

### Offline Sync
**PowerSync** on top of Supabase — genuine offline-first SQLite on client, Postgres WAL as source of truth, your own write API for conflict control.

### Authentication
**Supabase Auth** — pure JS, no Expo deps. Native Apple Sign In via `@invertase/react-native-apple-authentication` → `signInWithIdToken`. Anonymous-first, upgrade to permanent account when user opts in.

### Payments
**Adapty** — better free tier ($5K MTR), built-in paywall A/B testing, bare RN SDK. Entitlement webhooks → Supabase Edge Function → `user_entitlements` table → PowerSync streams to client.

---

## 14. Current Beta Specifics Worth Carrying Forward

These patterns from the beta are correct and should inform the alpha architecture:

- **Two-store separation** — game session state vs. persistent user data. Do not merge.
- **Cells as 1D flat array** — `index = row * size + col`. Simple and cache-friendly.
- **Move log with before/after state** — correct undo/redo design. Carry forward but clarify the redo construction to avoid the implicit state-read pattern.
- **Hint steps pre-computed at generation time** — no runtime solver on device. The alpha should maintain this; the Rust generator already produces hint steps.
- **Streak key format** — `YYYY-MM-DD`, `YYYY-WXX`, `YYYY-MM`. Simple, portable, correct.
- **MMKV for settings** — synchronous, fast, correct. Keep.
- **`autoX*` as independent toggles** — the three-way decomposition of auto-marking is a good UX design. Keep.
- **Sequential pack unlock (free tier)** — intentional design. Carry forward with the premium unlock layer on top.
- **Gesture composition pattern** — `Simultaneous(pinch, Race(draw, pan))`. The architecture is right; the implementation can be tightened with v3 hooks API and `activateAfterLongPress`.
