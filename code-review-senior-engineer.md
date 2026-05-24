# Senior Engineer Code Review — StarbattleMobile

Reviewed: 2026-05-24  
Branch: `revie`  
Reviewer: Senior Engineer (AI-assisted)

---

## Summary

The codebase is a React Native Star Battle puzzle app with Supabase + PowerSync sync, Adapty payments, and anonymous-to-email auth. The architecture is clean and the game logic is solid. However, there are **two critical security vulnerabilities** (a payment bypass and hardcoded production secrets), several bugs with real user impact, and a handful of edge-case correctness issues. All findings are documented below with file locations, root causes, and recommended fixes.

---

## Critical Security Issues

### ~~[SEC-1] Production API Keys Hardcoded in Version-Controlled Source~~ ✅ FIXED

> **✅ FIXED** — Secrets moved to `.env` (gitignored) and injected at build time via `babel-plugin-transform-inline-env-vars`. Fail-fast guards added in `src/config.ts` — each var throws with a clear message if missing at startup.

**File**: `src/config.ts`  
**Severity**: ~~Critical~~

Every secret the app uses is hardcoded as a plain string literal committed to git:

```ts
export const SUPABASE_ANON_KEY = 'eyJhbGci...';     // JWT in git history
export const ADAPTY_SDK_KEY = 'public_live_FQFP8OKb.3ryy8Pc6BjOlgZ4jgtCT'; // production payment key
export const GOOGLE_WEB_CLIENT_ID = '312698113706-h7vqck4...';
export const GOOGLE_IOS_CLIENT_ID = '312698113706-09ejig...';
```

**Why this is a problem:**
- The Adapty key is a **production payment SDK key**. Anyone who obtains it can interact with your Adapty account, inspect subscription data, and potentially manipulate entitlements via the Adapty API.
- Keys committed to git live in history forever — rotating them does not remove them from past commits.
- `.gitignore` does not exclude `config.ts`, so there is no accident-prevention mechanism.
- The Supabase anon key is by design public (it is the row-level-security boundary), but the Adapty and Google credentials are not.

**Fix:** Move secrets to environment variables loaded at build time via a tool like `react-native-config` or Xcode build settings / Gradle `buildConfigField`. Never commit production keys to source.

---

### [SEC-2] `purchasePack` Ignores Purchase Result — Free Content Bypass

**File**: `src/utils/payments.ts`, lines 26–38  
**Severity**: Critical

```ts
export async function purchasePack(packId: string, storagePath: string): Promise<void> {
  const { products } = await fetchPaywall();
  const product = products.find(p => p.vendorProductId === `starbattle_pack_${packId}`);
  if (!product) throw new Error(`Pack product not found: starbattle_pack_${packId}`);

  await adapty.makePurchase(product);   // ← return value is discarded
  await downloadPack(packId, storagePath);  // ← runs unconditionally
}
```

`adapty.makePurchase` returns a typed result object (`{ type: 'success' | 'pending' | ... }`). The code ignores it entirely and immediately downloads the pack regardless of whether payment succeeded or the user cancelled.

Compare with the correctly implemented `purchasePremium`:
```ts
const result = await adapty.makePurchase(product);
if (result.type === 'success') {
  return result.profile.accessLevels?.premium?.isActive ?? false;
}
return false;
```

**Impact:** Any user can tap "Buy Pack," cancel the payment sheet, and receive the paid pack content for free.

**Fix:**
```ts
const result = await adapty.makePurchase(product);
if (result.type !== 'success') return; // or throw if you want to surface the cancel
await downloadPack(packId, storagePath);
```

---

### [SEC-3] Client-Side-Only Entitlement Enforcement — Paid Content Accessible Without Purchase

**File**: `src/packs/index.ts`, `src/screens/LibraryScreen.tsx`  
**Severity**: High

The entitlement check (`hasPackAccess`, `canPlayPuzzle`) is enforced in the UI layer only. The actual pack data fetch is unconditional:

```ts
// LibraryScreen.tsx — runs for every pack the screen opens, purchased or not
useEffect(() => {
  getPuzzlesForPack(packId)
    .then(setRawPuzzles)
    .catch(() => {});
}, [packId]);
```

`getPuzzlesForPack` downloads the full pack JSON from Supabase Storage using the anon key. Because no server-side access check validates whether the current user owns the pack before serving the file, anyone can download any pack file by calling the Supabase Storage API directly with the (publicly visible) anon key and bucket path.

**Impact:** Paid pack content is accessible without payment — the lock icon in the UI is purely cosmetic. The actual protection depends entirely on Supabase Storage bucket RLS policies, which are not visible here.

**Fix:**
1. Verify that the `packs` Supabase Storage bucket has RLS policies requiring premium status or pack ownership before serving paid pack files.
2. Either enforce access server-side (preferred) or skip loading pack data when `!hasPackAccess(packId)` on the client.

---

### [SEC-4] Non-Null Assertion on Apple Identity Token — Runtime Crash

**File**: `src/stores/authStore.ts`, line 103  
**Severity**: High

```ts
const { data, error } = await supabase.auth.signInWithIdToken({
  provider: 'apple',
  token: credential.identityToken!,  // ← crashes if null
});
```

Per Apple's documentation, `identityToken` can be null when sign-in encounters certain error conditions. The `!` non-null assertion bypasses TypeScript's safety check and will throw a runtime `TypeError` if `identityToken` is actually null, crashing the app without a user-facing error message.

**Fix:**
```ts
if (!credential.identityToken) throw new Error('Apple sign-in: no identity token received');
const { data, error } = await supabase.auth.signInWithIdToken({
  provider: 'apple',
  token: credential.identityToken,
});
```

---

## Bugs with User-Facing Impact

### [BUG-1] Draw-Mode Erase of Stars Does Not Recalculate Auto-Marks

**File**: `src/store.ts`, lines 315–351  
**Severity**: Medium

When a user draws to erase a star in erase mode, `applyDrawStroke` does not call `rebuildAutoMarks`. The auto-marks that were placed because of that star (adjacent cells, row/column marks, region marks) remain on the board incorrectly.

In `tapCell` (the tap-to-erase path), this case is handled:
```ts
} else if (current === 1 && next === 0) {
  newAutoMarks = rebuildAutoMarks(newCells, changes, newAutoMarks, size, puzzle, settings);
}
```

In `applyDrawStroke`, the erase path only removes the erased cell's own index from `newAutoMarks`:
```ts
for (const c of changes) {
  newCells[c.index] = c.next;
  if (c.next !== 2) newAutoMarks.delete(c.index);  // ← doesn't handle star erasure
}
```

**Fix:** After applying changes in `applyDrawStroke`, check if any erased cell was a star (`c.prev === 1 && c.next === 0`) and call `rebuildAutoMarks` if so.

---

### [BUG-2] WinBanner Displays Solve Time Twice for Streak Puzzles

**File**: `src/components/WinBanner.tsx`, lines 63–99  
**Severity**: Low

The `headline` variable is identically computed for both branches — the ternary is dead code:
```ts
const headline = streakType
  ? `Solved in ${formatTime(timeMs)}`
  : `Solved in ${formatTime(timeMs)}`;  // ← identical string either way
```

Then in JSX:
```tsx
<Text style={styles.winText}>{headline}</Text>       {/* "Solved in 1:23" */}
{streakType && (
  <Text style={styles.winTime}>Solved in {formatTime(timeMs)}</Text>  {/* also "Solved in 1:23" */}
)}
```

When `streakType` is set, the solve time renders twice in different styles. The intent seems to have been to show a streak-specific headline (e.g., "Great streak!") in `winText` and the time in `winTime`, but the ternary was written incorrectly.

**Fix:** Give the streak case a distinct headline:
```ts
const headline = streakType
  ? `${STREAK_LABELS[streakType]} Challenge Complete`
  : `Solved in ${formatTime(timeMs)}`;
```

---

### [BUG-3] `signUpWithEmail` Sets `isAnonymous: false` Before Email Confirmation

**File**: `src/stores/authStore.ts`, lines 71–75  
**Severity**: Low-Medium

```ts
signUpWithEmail: async (email: string, password: string) => {
  const { data, error } = await supabase.auth.updateUser({ email, password });
  if (error) throw error;
  if (data.user) await applySignIn(set, null, data.user);  // ← session: null
},
```

`supabase.auth.updateUser` is the correct Supabase method for converting an anonymous user to an email-password account. However:

1. It triggers an email confirmation flow. Until the user confirms their email, Supabase still treats the account as needing verification. Calling `applySignIn` immediately sets `isAnonymous: false` and calls `adapty.identify(user.id)` as if the upgrade is complete.

2. The call passes `session: null`. The existing Supabase session (from the anonymous sign-in) is still valid and already stored in MMKV. The state will have `session: null` until the `onAuthStateChange` listener fires a `USER_UPDATED` event, creating a window where the in-memory session is null but the persisted session is still valid.

3. If the user closes the app without confirming their email, the state will show `isAnonymous: false` (from the immediate `applySignIn` call), but Supabase's `getSession()` on next launch will return the unconfirmed user — and `is_anonymous` on that user object may still be `true`, reverting `isAnonymous` back to `true` in the `initialize` function. This creates a flip-flop on restart.

**Fix:** Do not call `applySignIn` immediately. Let the `onAuthStateChange` listener handle the state update when the `USER_UPDATED` event fires after email confirmation. Display a "Check your email" message instead.

---

## Edge-Case Correctness Issues

### [EDGE-1] SQL Syntax Error for Packs with Zero Puzzles

**File**: `src/utils/progress.ts`, lines 88–122  
**Severity**: Low

Both `getCompletedCountForPack` and `getCompletedPuzzleIdsForPack` generate puzzle ID arrays with `Array.from({ length: puzzleCount }, ...)`. If `puzzleCount === 0`, the `IN ()` clause in the SQL query is empty, which is invalid SQL syntax and will throw a database error.

```ts
const placeholders = ids.map(() => '?').join(',');
// If ids is empty → "IN ()" → SQL error
```

**Fix:** Guard against the empty case:
```ts
if (puzzleCount === 0) return 0; // or return new Set()
```

---

### [EDGE-2] `loadProgress` Parses Stored JSON Without Validation

**File**: `src/utils/progress.ts`, lines 60–86

```ts
return {
  cells: JSON.parse(row.cells),             // could be any shape
  autoMarks: JSON.parse(row.auto_marks ?? '[]'),
  ...
};
```

If PowerSync delivers a malformed row (corrupted sync, schema mismatch), `JSON.parse` will either throw (caught by the outer try/catch in `loadPuzzle`) or return a non-`CellValue[]` value. In the latter case, the invalid array is silently used as the game state. Cells with values other than `0|1|2` would cause rendering and logic code to behave unpredictably (the `dynamicPaths` memo in `PuzzleCanvas` would silently skip unknown cell values, but `checkWin` and `computeErrors` iterate the full array).

**Fix:** Validate the parsed data shape before using it, or at minimum clamp each cell to a valid `CellValue` with `Math.max(0, Math.min(2, v)) as CellValue`.

---

### [EDGE-3] `parsePuzzle` Accepts SBN Layouts Longer Than Expected

**File**: `src/utils/parsePuzzle.ts`, lines 14–18

The length guard is a one-sided check:
```ts
if (layout.length < size * size) {
  throw new Error(`SBN layout too short: ...`);
}
```

An oversized layout silently truncates via `layout[flatIdx]`, which is correct. However, there is no validation that `size` and `stars` are sane values (e.g., `size <= 0` would create an empty `regions` array and produce `new Array<CellValue>(0).fill(0)` in `loadPuzzle`, leading to an empty board with no error). Both values come from server-controlled data, so this is low risk but worth a guard:
```ts
if (size < 1 || size > 26 || stars < 1) throw new Error(`Invalid puzzle dimensions`);
```

---

### [EDGE-4] Fatal PowerSync Errors Silently Discard User Data

**File**: `src/powersync/Connector.ts`, lines 61–67  
**Severity**: Informational

```ts
} catch (ex) {
  if (ex !== null && typeof ex === 'object' && isFatal(ex as { code?: string })) {
    await transaction.complete();  // marks as done — data is permanently discarded
  } else {
    throw ex;
  }
}
```

Fatal Postgres error codes (RLS rejections, constraint violations, type mismatches) cause the transaction to be silently marked complete and discarded. This is intentional to prevent infinite retry loops, but it means the user can make progress that is permanently lost without any indication. An RLS rejection in particular (`42501`) could silently discard all puzzle progress saves if a server-side policy change revokes write access.

**Recommendation:** Log these silent discards (e.g., to a crash reporting service) so they can be detected and investigated.

---

### [EDGE-5] `regionFillPaths` Memo in `PuzzleCanvas` Excludes `regionColors.length`

**File**: `src/components/PuzzleCanvas.tsx`, lines 30–51

```ts
const regionFillPaths = useMemo(() => {
  const builders = new Map<...>();
  for (...) {
    const colorIdx = regions[row][col] % regionColors.length;  // ← regionColors.length used here
    ...
  }
  return [...];
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [puzzle.id, canvasSize, bw]);  // ← regionColors.length not in deps
```

`regionColors.length` is used inside the memo to compute `colorIdx`, but neither `regionColors` nor `theme` is in the dependency array. All palettes currently define 12 region colors (both light and dark), so this value never changes in practice. If a future palette added a different number of region colors, the color-to-region mapping would be stale after a palette switch.

The `eslint-disable-next-line` suppresses the exhaustive-deps warning here — the intent is to avoid recomputing on theme changes (since paths are geometry-only, colors are applied in JSX). This is safe only as long as all palettes have the same number of region colors.

**Recommendation:** Add a comment documenting this invariant, or add `regionColors.length` to the dependency array.

---

## Code Quality Notes

### [QUALITY-1] `headline` Ternary in `WinBanner` Is Dead Code

Already covered in BUG-2, but worth noting as a TypeScript / lint issue. A ternary with identical branches can be caught with `no-unneeded-ternary` / `sonarjs/no-identical-expressions`.

### [QUALITY-2] `CLAUDE.md` Requires Types in `src/types/` — Violation in `src/types.ts`

`CLAUDE.md` states: "All types live in `src/types/` folder." The project currently has a flat file `src/types.ts` (not a `types/` directory). This is inconsistent with the documented convention.

### [QUALITY-3] `storage.ts` Imports Type Without `.ts` Extension Consistency

```ts
import { UserSettings } from './types';  // no .ts extension
```

All other imports in the project use `from '../types.ts'` with the explicit `.ts` extension. `storage.ts` is the only file that doesn't, creating an inconsistency.

---

## Issue Summary Table

| ID | File | Severity | Category | Description |
|----|------|----------|----------|-------------|
| ~~SEC-1~~ | ~~`src/config.ts`~~ | ~~Critical~~ | ~~Security~~ | ~~Production API keys hardcoded in git~~ ✅ |
| SEC-2 | `src/utils/payments.ts` | Critical | Security | `purchasePack` ignores purchase result |
| SEC-3 | `src/packs/index.ts` | High | Security | No server-side entitlement check on paid content |
| SEC-4 | `src/stores/authStore.ts:103` | High | Security | Non-null assertion on nullable Apple token |
| BUG-1 | `src/store.ts:315` | Medium | Bug | Draw-erase of stars leaves stale auto-marks |
| BUG-2 | `src/components/WinBanner.tsx:68` | Low | Bug | Solve time displayed twice for streak puzzles |
| BUG-3 | `src/stores/authStore.ts:71` | Low-Med | Bug | `isAnonymous` set false before email confirmed |
| EDGE-1 | `src/utils/progress.ts:88` | Low | Edge Case | Invalid SQL `IN ()` if `puzzleCount === 0` |
| EDGE-2 | `src/utils/progress.ts:80` | Low | Edge Case | No validation of parsed cell data from DB |
| EDGE-3 | `src/utils/parsePuzzle.ts:14` | Low | Edge Case | No bounds check on `size`/`stars` values |
| EDGE-4 | `src/powersync/Connector.ts:62` | Info | Design | Fatal errors silently discard user data |
| EDGE-5 | `src/components/PuzzleCanvas.tsx:51` | Info | Correctness | Stale memo if palette regionColors count changes |
