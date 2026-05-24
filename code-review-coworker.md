# Developer Practicality Review

This is a deep review of the codebase looking for things that will slow you down, introduce subtle bugs, or make the code harder to reason about over time. Findings are ordered roughly by severity.

---

## 🔴 Critical

### 1. Apple Private Key Committed to Git

`docs/SubscriptionKey_5M2LWM6WJA.p8` is tracked by git and contains a real ECDSA private key:

```
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg8+2s...
```

This is almost certainly an Apple App Store Connect subscription notification key. Private keys must never be in source control. Rotate it immediately and add `*.p8` to `.gitignore`. Even after removal from git history (via `git filter-repo`), treat the current key as compromised.

### 2. Real Production API Keys Hardcoded in `src/config.ts`

All secrets live in committed source:

```ts
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
export const ADAPTY_SDK_KEY = 'public_live_FQFP8OKb...';
export const GOOGLE_WEB_CLIENT_ID = '312698113706-h7vq...';
export const GOOGLE_IOS_CLIENT_ID = '312698113706-09ej...';
```

There's no `.env` file, no environment variable injection, no way to separate dev/staging/prod without editing source. If someone ever forks this or the repo goes public, all credentials are exposed. The immediate fix is moving these to a `.env` file (gitignored) and using a library like `react-native-config` or `expo-constants` to inject them at build time.

---

## 🟠 Architecture / Correctness

### 3. CLAUDE.md Rule Violated by the Codebase Itself

`CLAUDE.md` states: *"All types live in `src/types/` folder."*

The actual codebase has a single flat file at `src/types.ts`. There is no `src/types/` directory. This rule will confuse any new contributor and will mislead Claude itself in future sessions. Either update the rule to match reality (`src/types.ts`) or refactor types into a `src/types/` folder.

### 4. Circular Import Between `store.ts` and `stores/settingsStore.ts`

`store.ts` imports from `settingsStore.ts` and `settingsStore.ts` imports from `store.ts`:

```ts
// store.ts
import { useSettingsStore } from './stores/settingsStore';

// stores/settingsStore.ts
import { usePuzzleStore } from '../store';
```

JavaScript module systems resolve this at runtime but it creates an initialization order dependency. If either module ever tries to access the other at the module's top level (outside a function body), you'll get `undefined`. Currently both stores only access each other inside action functions, so it happens to work, but this is fragile and will make unit testing these stores in isolation impossible without mocking the other.

### 5. `db.watch` Subscriptions in `App.tsx` Are Never Cleaned Up

```ts
// App.tsx — inside useEffect([], [])
db.watch('SELECT id FROM packs WHERE published = 1 LIMIT 1', [], { onResult: ... });
db.watch('SELECT * FROM user_entitlements LIMIT 1', [], { onResult: ... });
```

`db.watch` returns a subscription handle but the return values are discarded. The useEffect has no cleanup function, so these watchers run forever. If App ever hot-reloads or remounts (e.g., during Fast Refresh), duplicate watchers will fire on every qualifying DB change. The fix is:

```ts
useEffect(() => {
  const sub1 = db.watch(...);
  const sub2 = db.watch(...);
  return () => { sub1.unsubscribe?.(); sub2.unsubscribe?.(); };
}, []);
```

### 6. Auth / Entitlements Race Condition in `App.tsx`

In the `useEffect`, `db.watch` for `user_entitlements` is registered before `useAuthStore.getState().initialize()` is called (and that function is async). The watch callback does:

```ts
db.watch('SELECT * FROM user_entitlements LIMIT 1', [], {
  onResult: () => {
    const userId = useAuthStore.getState().user?.id;
    if (userId) useEntitlementsStore.getState().loadEntitlements(userId);
  },
});
// ...
useAuthStore.getState().initialize(); // called after watch setup
```

If the watch fires immediately (before `initialize()` resolves and sets `user`), `userId` will be `null` and entitlements will never load. The watch will only re-fire if the DB row changes — it won't retry just because auth later resolves. Users who open the app on a fresh install may see no pack catalog. The fix is to trigger `loadEntitlements` inside `initialize()` after auth resolves, or to add a separate subscription to the auth state to reload entitlements when a user signs in.

### 7. `redo()` in `store.ts` Applies `c.prev` Instead of `c.next`

```ts
// redo() in store.ts:286
for (const c of entry.changes) {
  newCells[c.index] = c.prev;  // applies the redo entry's .prev field
}
```

This works by coincidence because when undo builds the redo entry, it stores the "forward" value in `prev` and the "backward" value in `next` (it reverses the semantics). This is not a currently broken bug, but the field naming creates a trap: the `CellChange` type has `prev` and `next`, and everywhere else in the codebase `prev` means "before" and `next` means "after." Any developer touching the undo/redo code will be confused and likely break it.

---

## 🟡 Developer Friction

### 8. Inconsistent `.ts` Extension on Imports

About half the codebase uses the `.ts` extension explicitly, the other half omits it:

```ts
// With extension (non-standard):
import type { UserSettings } from '../types.ts';   // settingsStore.ts
import type { Theme } from '../types.ts';            // useTheme.ts

// Without extension (standard TypeScript):
import type { Theme, CircleButtonProps } from '../types';  // CircleButton.tsx
import type { RootStackParamList } from './types';          // navigation.tsx
```

TypeScript convention is to omit the `.ts` extension. The `.ts` form works with Metro but is non-standard and will cause problems with certain tools and linters. All imports should be normalized.

### 9. Type-Only Imports Missing `type` Keyword

`store.ts` and `storage.ts` import types as values:

```ts
// store.ts:12
import { CellChange, CellValue, Move, Puzzle, TapMode } from './types';

// storage.ts:2
import { UserSettings } from './types';
```

These should be `import type { ... }`. Using value imports for types can interfere with tree-shaking and causes TypeScript's `isolatedModules` (used by Metro/Babel) to emit a warning since it can't verify they're type-only at the file level.

### 10. `PaywallModal.tsx` Is the Only Component Missing `import React`

Every other component in the codebase starts with `import React from 'react'` or `import React, { ... } from 'react'`. `PaywallModal.tsx` skips it entirely. This works fine with the new JSX transform, but it's inconsistent with all other files.

### 11. `WinBanner.tsx` Has Three Layered Bugs Around Time Display

**Bug A — Dead ternary:** `headline` is always the same string regardless of the branch:

```ts
const headline = streakType
  ? `Solved in ${formatTime(timeMs)}`   // streak path
  : `Solved in ${formatTime(timeMs)}`;  // non-streak path — IDENTICAL
```

The ternary accomplishes nothing. This looks like a copy-paste where both branches were meant to differ.

**Bug B — `_streakCount` is fetched, stored, and never used:** The banner fetches and sets a streak count in state:

```ts
const [_streakCount, setStreakCount] = useState(0);
// ...
if (found) setStreakCount(getActiveStreak(found, type));
```

The underscore prefix signals "unused" and the value is never rendered. This is dead code — either wire it up to display the streak or remove it.

**Bug C — Time displayed twice for streak puzzles:**

```tsx
<Text style={styles.winText}>{headline}</Text>       // "Solved in 1:23"
{streakType && (
  <Text style={styles.winTime}>Solved in {formatTime(timeMs)}</Text>  // "Solved in 1:23" again
)}
```

When a streak puzzle completes, both texts render with identical content. One of these should show something different (e.g., the streak count).

### 12. `WinBanner.tsx` Uses Numeric `fontWeight` Values

```ts
winText: {
  fontWeight: 700,   // TypeScript error — should be '700'
},
winInfo: {
  fontWeight: 600,   // TypeScript error — should be '600'
},
winTime: {
  fontWeight: 600,   // TypeScript error — should be '600'
},
```

React Native's `fontWeight` style property is typed as a string (`'100'` through `'900'` or named values). Numeric literals are accepted by the JS runtime but rejected by TypeScript's strict checking and may behave inconsistently across platforms.

### 13. `LibraryScreen` Returns `null` With No Loading Indicator

```ts
// LibraryScreen.tsx:200
if (!puzzleCount) return null;
```

While the pack catalog is loading (or if the pack ID doesn't exist), the entire screen silently renders nothing — no spinner, no error, nothing. This happens every time you navigate to Library before the catalog has loaded. The screen should show an `ActivityIndicator` here instead of returning `null`.

### 14. Premium Price `$5.99` Hardcoded in Four Places

```
src/screens/StreaksScreen.tsx:152        "Unlock with Premium · $5.99"
src/components/PaywallModal.tsx:49       "Unlock All with Premium · $5.99"
src/components/PaywallModal.tsx:103      "Buy Premium · $5.99 · All Packs"
src/components/SettingsModal.tsx:442     "Buy Premium · $5.99"
```

Also the product ID `'sb_premium_599'` in `payments.ts` encodes the price. Changing the price means touching 5 files. This should be a single constant (or ideally fetched from Adapty at runtime so it reflects App Store pricing).

### 15. Developer Error Message Will Surface to Production Users

```ts
// packs/index.ts:83
throw new Error('File system unavailable — run pod install');
```

`downloadPack` throws an error containing "run pod install" — a developer instruction that will reach users in production via `useAsyncAction`'s error display. Users will see a confusing dev message if RNFS is somehow unavailable on their device.

### 16. `ErrorBoundary` Has a Hardcoded Accent Color That Ignores the Theme

```ts
// ErrorBoundary.tsx
button: {
  backgroundColor: '#5865F2',  // Discord blurple — hardcoded
},
```

Every other UI element in the app uses `theme.accent` for interactive elements. The error boundary uses a hardcoded hex that doesn't change with the palette or dark mode. It will look wrong in the Crimson and Rose Pine themes.

### 17. SQL Parameter Limit Risk in `progress.ts`

`getCompletedCountForPack` and `getCompletedPuzzleIdsForPack` build dynamic IN clauses:

```ts
const ids = Array.from({ length: puzzleCount }, (_, i) => `${packId}:${i}`);
const placeholders = ids.map(() => '?').join(',');
// Query: WHERE puzzle_id IN (?, ?, ?, ...) with puzzleCount + 1 total params
```

SQLite's default `SQLITE_LIMIT_VARIABLE_NUMBER` is 999. A pack with 999+ puzzles will throw at runtime. Even for smaller packs this creates a query with O(n) bound parameters sent on every Library focus. A `LIKE '${packId}:%'` prefix check or chunked batching would be more robust.

### 18. `PuzzleScreen.tsx` Unsafe Cast to Access Route Params

```ts
// PuzzleScreen.tsx:50-53
const { isArchive, archiveKey } = route.params as {
  isArchive?: boolean;
  archiveKey?: string;
};
```

This cast works around the discriminated union in `RootStackParamList`. The right fix is to restructure the Puzzle route params so the fields don't need to be negated with `never` — the `never` trick forces consumers to cast. One clean approach: make the route take a single optional `streakOptions` object instead of flat optional fields.

### 19. `saveProgress` Is Not Atomic

```ts
// progress.ts:19-57
const existing = await db.getOptional(...);
if (existing) {
  await db.execute('UPDATE ...');
} else {
  await db.execute('INSERT ...');
}
```

This is a read-then-write pattern. PowerSync uses a local SQLite, so concurrent access is unlikely, but if two saves race (e.g., rapid navigation), the second read could see stale data. PowerSync exposes `db.writeTransaction` — wrapping this in a transaction or using `INSERT OR REPLACE` (upsert) eliminates the TOCTOU entirely.

---

## 🔵 Minor / Cleanup

### 20. Magic Number `57` for Header Height in `HomeScreen.tsx`

```ts
// HomeScreen.tsx — appears twice:
paddingTop: 57 + insets.top     // in ScrollView contentContainerStyle
height: 57 + insets.top,        // in the absolute header View
```

`57` is not defined anywhere as a constant. Meanwhile `Header.tsx` uses `48 + insets.top` for the actual header height. `57 = 48 + 9`? The discrepancy is unclear. Extract this as a named constant (`HEADER_HEIGHT = 48`) and compute offsets from it.

### 21. `getCompletedCountForPack` and `getCompletedPuzzleIdsForPack` Are Near-Identical

Both functions in `progress.ts` build the same query with the same parameter list, differing only in `SELECT COUNT(*)` vs `SELECT puzzle_id` and return type. A shared helper that returns the rows would eliminate the duplication.

### 22. `navigation.tsx` Has a Misleading "Side-Effect Import" Comment

```ts
// navigation.tsx
// Side-effect import: loads the global ReactNavigation.RootParamList augmentation...
import './types';
```

TypeScript global augmentations (`declare global { ... }`) are type-level only — they have zero runtime side effects. The comment is technically incorrect and will confuse someone trying to understand what this import actually does. The import exists so TypeScript picks up the global augmentation; a note like `// type-only: pulls in global navigation typing` is more accurate.

### 23. `SettingsModal.tsx` Has a Nested `<View style={styles.section}>` Inside Another

The Subscription section is rendered as a nested `section` inside the Account section:

```tsx
{/* Account section */}
<View style={styles.section}>
  ...
  {/* Subscription — a child of Account, styled as its own section */}
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>Subscription</Text>
    ...
  </View>
  ...
</View>
```

This creates double-gap spacing between subscription content and adjacent account content, and makes the logical structure ambiguous. The Subscription section should be a sibling of Account, not a child.

### 24. `supabase.ts` and `storage.ts` Both Call `createMMKV` Separately

Two separate MMKV instances are created (`'starbattle-settings'` and `'supabase-auth'`). That's fine — they're different stores. But the pattern of calling `createMMKV` at module level in multiple files means there's no single place to see what MMKV instances the app uses or to share configuration (encryption keys in the future, etc.). Consider a `src/mmkv.ts` that exports named instances.
