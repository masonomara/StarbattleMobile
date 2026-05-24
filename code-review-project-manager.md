# Code Review — Taoist Project Manager

> **Perspective**: The Tao does not strain. Code that fights itself — doing more than it needs to, holding what it should release, saying the same thing twice — is not at rest. These findings are sorted by consequence, not by pride.

---

## 1. Security

### 1.1 All API keys are hardcoded in committed source — `src/config.ts`
```
SUPABASE_ANON_KEY, POWERSYNC_URL, ADAPTY_SDK_KEY,
GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID
```
All live in a `.ts` file that is committed to the repository. Anyone with read access to the repo has every key. These belong in environment variables (`EXPO_PUBLIC_*`) or a build-time secrets manager. The Supabase anon key is technically designed for client exposure, but the Adapty SDK key and PowerSync URL are not.

### 1.2 Force-unwrap of Apple identity token — `authStore.ts:103`
```ts
token: credential.identityToken!,
```
Apple's documentation states `identityToken` can be `null` in rare failure cases. The `!` assertion will throw a cryptic runtime crash at the `signInWithIdToken` call rather than surfacing a proper error. Should be guarded:
```ts
if (!credential.identityToken) throw new Error('Apple sign-in: missing identity token');
```

### 1.3 `purchasePack` does not verify purchase success — `payments.ts:36`
```ts
await adapty.makePurchase(product);   // result ignored
await downloadPack(packId, storagePath);
```
`purchasePremium` checks `result.type === 'success'`, but `purchasePack` discards the result entirely. Adapty throws on hard failures (cancelled, payment declined), but if the purchase flow completes in an ambiguous state without throwing, the pack is downloaded without a successful entitlement. Compare with the `purchasePremium` pattern and apply consistently.

### 1.4 JSON.parse without validation — `progress.ts:82`, `entitlementsStore.ts:71`
```ts
cells: JSON.parse(row.cells),
autoMarks: JSON.parse(row.auto_marks ?? '[]'),
ownedPackIds: JSON.parse(entRow.owned_pack_ids || '[]'),
```
Corrupted MMKV data or a malformed PowerSync record causes an uncaught exception during gameplay. A try/catch with a safe fallback (empty cells, empty array) would keep the app functional instead of crashing.

### 1.5 Pack file path is derived from database values without sanitization — `packs/index.ts:59,69`
```ts
const localPath = `${packDir}/${storageKey}`;
await rnfs.writeFile(`${packDir}/${packId}.json`, text, 'utf8');
```
`storageKey` is `${packId}.json` and `packId` comes from the database. If a compromised or misconfigured Supabase row contained a `packId` with path traversal characters (`../`), files could be written outside `DocumentDirectoryPath/packs`. Low likelihood given the server controls the data, but worth noting.

---

## 2. Technical Accuracy

### 2.1 SQL.js (WASM) is used instead of native SQLite — `powersync/AppSchema.ts:2,70`
```ts
import { SQLJSOpenFactory } from '@powersync/adapter-sql-js';
// ...
database: new SQLJSOpenFactory({ dbFilename: 'starbattle.db' }),
```
`@powersync/op-sqlite` is listed as a dependency in `package.json` and is the correct native SQLite adapter for React Native. `@powersync/adapter-sql-js` runs SQLite compiled to WebAssembly — it is designed for **web** environments. Using it in a native app means:
- Significantly slower queries (WASM overhead vs. native C)
- Larger JS bundle (WASM binary)
- Higher memory usage

This should be `OPSQLiteOpenFactory` from `@powersync/op-sqlite`.

### 2.2 Timer accumulates time while the app is backgrounded — `HeaderTimer.tsx:14-25`
```ts
let last = Date.now();
const id = setInterval(() => {
  const now = Date.now();
  usePuzzleStore.getState().tick(now - last);
  last = now;
}, 1000);
```
The interval measures real elapsed time, which is correct for drift compensation — but it also means that when a user backgrounds the app for 5 minutes and returns, the timer jumps forward 5 minutes. There is no `AppState` listener to pause the timer during background/inactive states.

### 2.3 Daily archive date parsing uses UTC, streak key generation uses local time — `streakDate.ts:94`
```ts
case 'daily':
  return new Date(key);   // "2025-03-15" → UTC midnight
```
`getCurrentKey` uses `new Date()` (device local time) to generate `"2025-03-15"`. But `archiveKeyToDate('daily', '2025-03-15')` parses the string as UTC midnight via the ISO date constructor. For users in UTC-N timezones, UTC midnight `2025-03-15` is still `2025-03-14` locally. The resulting `Date` passed to `getPuzzleIndex` would compute the wrong puzzle index for archive entries.

### 2.4 `onAuthStateChange` listener is never unsubscribed — `authStore.ts:53`
```ts
supabase.auth.onAuthStateChange(async (event, session) => { ... });
```
`onAuthStateChange` returns a subscription object with an `unsubscribe()` method. If `initialize()` is ever called more than once (e.g., after a store reset or hot reload in development), multiple listeners accumulate. The subscription return value is silently discarded.

### 2.5 `db.watch` watchers in `App.tsx` are never cleaned up — `App.tsx:27,33`
```ts
db.watch('SELECT id FROM packs WHERE published = 1 LIMIT 1', [], { onResult: ... });
db.watch('SELECT * FROM user_entitlements LIMIT 1', [], { onResult: ... });
```
PowerSync's `watch` returns a subscription/disposable. Neither is returned from the `useEffect` as a cleanup function. On Fast Refresh in development, multiple watchers accumulate and fire duplicate callbacks.

### 2.6 Entitlements startup race condition — `App.tsx:33-38`
```ts
db.watch('SELECT * FROM user_entitlements LIMIT 1', [], {
  onResult: () => {
    const userId = useAuthStore.getState().user?.id;
    if (userId) useEntitlementsStore.getState().loadEntitlements(userId);
  },
});
// ...
useAuthStore.getState().initialize(); // called after the watch is set up
```
The watch can fire immediately if local SQLite already has `user_entitlements` rows (returning user). At that moment, `useAuthStore.getState().user` is still `null` because `initialize()` hasn't resolved yet. The guard `if (userId)` silently skips the load. If no subsequent PowerSync sync event fires for `user_entitlements`, entitlements are never loaded for returning users until they next open the app and a sync occurs.

### 2.7 `purchasePremium` treats a cancelled purchase as a silent success — `payments.ts:19-22`
```ts
const result = await adapty.makePurchase(product);
if (result.type === 'success') {
  return result.profile.accessLevels?.premium?.isActive ?? false;
}
return false;   // cancelled / pending — no error thrown
```
The caller is `withLoading(purchasePremium)` in `SettingsModal.tsx`, which fires `onSuccess()` on any non-throw. A cancelled purchase returns `false` with no error, causing the success callback to run. The UI should check the return value or the function should throw on non-success outcomes.

### 2.8 `CLAUDE.md` says types live in `src/types/` (folder) but the project has `src/types.ts` (file)
The project instruction is already stale. Either the rule should be updated to `src/types.ts`, or the file should be migrated to a folder. Currently `AppSchema.ts` also exports a type (`export type Database`), which violates the "no inline type exports" rule regardless.

---

## 3. Flow, Simplicity, and Scope

### 3.1 `WinBanner` displays "Solved in X:XX" twice for streak puzzles — `WinBanner.tsx:67-98`

The `headline` variable has identical values in both branches:
```ts
const headline = streakType
  ? `Solved in ${formatTime(timeMs)}`   // same
  : `Solved in ${formatTime(timeMs)}`;  // same
```
Then the render adds a *second* time display for streaks:
```tsx
<Text style={styles.winText}>{headline}</Text>
{streakType && (
  <Text style={styles.winTime}>Solved in {formatTime(timeMs)}</Text>
)}
```
For streak puzzles, "Solved in 2:14" appears twice. The `headline` conditional is dead code; one branch can be removed.

### 3.2 `_streakCount` is loaded and set but never displayed — `WinBanner.tsx:28,43-44`
```ts
const [_streakCount, setStreakCount] = useState(0);
// ...
if (found) setStreakCount(getActiveStreak(found, type));
```
The underscore prefix suppresses the lint warning, but it signals that the feature was intended and abandoned mid-implementation. The streak count is fetched from the DB and stored in state but rendered nowhere. Either remove the dead state and the `updateStreak` DB call, or complete the feature.

### 3.3 `packCatalog` is loaded twice on startup — `App.tsx:27-35` + `entitlementsStore.ts:58-64`

The `packs` watch fires → `loadPackCatalog()` sets `packCatalog`.  
The `user_entitlements` watch fires → `loadEntitlements(userId)` runs the same `PACK_QUERY` internally *and* sets `packCatalog` again.

Both methods use identical SQL. `loadEntitlements` should not re-query and set `packCatalog`; it should only update `entitlements`. The catalog is already maintained by the separate watch.

### 3.4 `settingsStore` owns visibility state for the unrelated Streaks modal — `stores/settingsStore.ts:9,29-32`
```ts
streaksModalVisible: boolean;
openStreaks: () => void;
closeStreaks: () => void;
```
The settings store has accreted modal visibility for a different feature. `streaksModalVisible` and its actions belong in either the streaks store (if one existed) or local component state. The current design means `StreaksScreen` depends on `settingsStore` for its open/close lifecycle, which is scope leak.

### 3.5 `StreaksScreen` is named and structured like a screen but is mounted as a modal — `navigation.tsx:72`
```tsx
<StreaksScreen />   // mounted alongside SettingsModal, outside the Stack
```
It is rendered as a sibling to `SettingsModal`, not as a navigator screen. The name should be `StreaksModal` to match its actual role and to match the naming convention already used by `SettingsModal`.

### 3.6 `emeraldLight` theme has identical `text` and `textSecondary` colors — `themes/palettes.ts:105-106`
```ts
text: '#575279',
textSecondary: '#575279',   // same value
```
Every UI element that uses `textSecondary` to visually de-emphasize metadata (pack meta, streak labels, secondary descriptions) will be visually identical to primary text in the "Rose Pine" light theme.

### 3.7 Premium price `'$5.99'` is hardcoded in four places
- `StreaksScreen.tsx:152`
- `PaywallModal.tsx:49`
- `PaywallModal.tsx:103`
- `SettingsModal.tsx:442`

The actual price lives in the Adapty paywall product. When the price changes, four UI strings must be manually updated. The premium product price should be fetched from `adapty.getPaywall` / `adapty.getPaywallProducts` and stored centrally, not hardcoded.

### 3.8 All pack thumbnails are parsed eagerly in `LibraryScreen` — `LibraryScreen.tsx:120-123`
```ts
const parsedPuzzles = useMemo<Puzzle[]>(() => {
  return rawPuzzles.map((raw, i) => parsePuzzle(raw, `${packId}:${i}`));
}, [packId, rawPuzzles]);
```
`parsePuzzle` runs for every puzzle in the pack before any thumbnail is visible on screen. For a 100-puzzle pack, this parses 100 SBN strings synchronously on the JS thread during render. `FlatList` only renders the visible items — parsing should be deferred to item render time or done incrementally.

### 3.9 Magic number `48` appears three times as an unexplained header height offset
- `PuzzleScreen.tsx:167`: `insets.top + 48`
- `PuzzleScreen.tsx:264`: `insets.top + 48`
- `LibraryScreen.tsx:219`: `48 + insets.top`

This is the header component's fixed content height (`height: 48 + insets.top` in `Header.tsx`). Extract as a named constant: `HEADER_CONTENT_HEIGHT = 48`.

### 3.10 `useZoom` returns three shared values the caller never uses — `hooks/useZoom.ts:121-125`
```ts
return {
  scale,          // unused by PuzzleScreen
  translateX,     // unused by PuzzleScreen
  translateY,     // unused by PuzzleScreen
  savedScale,     // used
  savedTranslateX, // used
  savedTranslateY, // used
  ...
};
```
`scale`, `translateX`, `translateY` (the live animated values) are returned but `PuzzleScreen` only destructures the `saved*` variants. Remove the three from the return shape.

### 3.11 `streakDate.ts` mixes pure date utilities with a DB query — `streakDate.ts:82-91`
```ts
import { db } from '../powersync/AppSchema';  // DB dependency
// ...
export async function getPastArchive(...) { /* DB query */ }
```
`streakDate.ts` is named as a date utility module, but `getPastArchive` is a data access function that queries the local SQLite DB. This function belongs in `progress.ts` alongside `loadStreaks`, `saveStreak`, and `recordStreak`. The `db` import in `streakDate.ts` can then be removed.

### 3.12 `HomeScreen.load` re-queries N packs on every focus event — `HomeScreen.tsx:86-110`
```ts
await Promise.all(
  packCatalog.map(async pack =>
    counts[pack.id] = await getCompletedCountForPack(pack.id, pack.puzzleCount)
  )
);
```
Every time the user returns to the Home screen, a DB query is fired for each pack. For a user with 10 packs, that is 10 queries per navigation event. Progress updates happen when the user navigates away from a puzzle, so caching the counts and invalidating only the pack that was just played would be sufficient.

### 3.13 `fontWeight` uses numeric literals in `WinBanner.tsx` — `WinBanner.tsx:133,139,146`
```ts
fontWeight: 700,   // should be '700' (string)
fontWeight: 600,   // should be '600' (string)
```
React Native's `StyleSheet` type for `fontWeight` is a string literal union (`'100'`–`'900'`). Numeric values are TypeScript type errors in strict mode and are known to fail silently on Android, where the font weight may be ignored or default to `'normal'`. All other files in the project use the correct string form (`theme.fontWeightSemibold` = `'600'`). Only `WinBanner.tsx` uses raw numbers.

### 3.14 Cross-store coupling: `settingsStore` calls into `puzzleStore` — `stores/settingsStore.ts:41`
```ts
usePuzzleStore.getState().recomputeAutoMarks();
```
The settings store directly invokes a method on the puzzle store inside its own setter. This creates a hidden coupling: changing a setting causes a puzzle-board side effect without the caller knowing. The recomputation should be triggered reactively (the puzzle store subscribes to settings changes) or explicitly at the call site.

---

## Summary Table

| # | File | Category | Severity |
|---|------|----------|----------|
| 1.1 | `config.ts` | Security | High |
| 1.2 | `authStore.ts:103` | Security | Medium |
| 1.3 | `payments.ts:36` | Security / Correctness | Medium |
| 1.4 | `progress.ts`, `entitlementsStore.ts` | Security / Stability | Medium |
| 1.5 | `packs/index.ts` | Security | Low |
| 2.1 | `AppSchema.ts` | Performance | High |
| 2.2 | `HeaderTimer.tsx` | Correctness | Medium |
| 2.3 | `streakDate.ts:94` | Correctness | Medium |
| 2.4 | `authStore.ts:53` | Stability | Low |
| 2.5 | `App.tsx:27,33` | Stability | Low |
| 2.6 | `App.tsx:33-38` | Correctness | Medium |
| 2.7 | `payments.ts:19-22` | Correctness | Medium |
| 2.8 | `CLAUDE.md` + `AppSchema.ts` | Convention | Low |
| 3.1 | `WinBanner.tsx:67-98` | Duplication | Medium |
| 3.2 | `WinBanner.tsx:28` | Dead code | Low |
| 3.3 | `App.tsx` + `entitlementsStore.ts` | Redundancy | Low |
| 3.4 | `settingsStore.ts` | Scope | Low |
| 3.5 | `StreaksScreen.tsx` + `navigation.tsx` | Naming | Low |
| 3.6 | `palettes.ts:105-106` | Visual bug | Medium |
| 3.7 | Multiple files | Fragility | Low |
| 3.8 | `LibraryScreen.tsx:120` | Performance | Low |
| 3.9 | Three screen files | Clarity | Low |
| 3.10 | `useZoom.ts` | Scope | Low |
| 3.11 | `streakDate.ts` | Cohesion | Low |
| 3.12 | `HomeScreen.tsx:86` | Performance | Low |
| 3.13 | `WinBanner.tsx:133,139,146` | Correctness | Medium |
| 3.14 | `settingsStore.ts:41` | Coupling | Low |

---

*The water does not try to be water. It simply finds the lowest place and rests there. The code that needs the most fixing is the code that is trying hardest to be something it isn't.*
