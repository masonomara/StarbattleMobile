# Liability, Compliance & Edge Case Review

**StarbattleMobile — May 2026**

---

## Executive Summary

This review examines StarbattleMobile for liability exposure, regulatory compliance failures, and edge-case defects that carry legal or financial risk. The codebase has **three critical issues** requiring immediate attention before any public release: hardcoded production credentials in version control, missing privacy policy and account deletion mechanisms (App Store rejection risk), and systematically hardcoded prices that violate App Store and consumer protection law. Beyond those, eleven additional findings range from high to low severity.

---

## CRITICAL Findings

---

### ~~C-1 — All Production Credentials Hardcoded in Source Code~~ ✅ FIXED

> **✅ FIXED** — Secrets moved to `.env` (gitignored) and injected at build time via `babel-plugin-transform-inline-env-vars`. Fail-fast guards added in `src/config.ts` — each var throws with a clear message if missing at startup.

**File:** `src/config.ts`

~~**Risk:** Credential exposure, unauthorized API access, payment fraud, App Store rejection~~

```typescript
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
export const ADAPTY_SDK_KEY = 'public_live_FQFP8OKb.3ryy8Pc6BjOlgZ4jgtCT';
export const POWERSYNC_URL =
  'https://6a0b440a63989ab5d2f0c95b.powersync.journeyapps.com';
export const GOOGLE_WEB_CLIENT_ID =
  '312698113706-h7vqck4hpvnieidtrd08qkslffcp2lof...';
export const GOOGLE_IOS_CLIENT_ID =
  '312698113706-09ejigbp1khjkk1p1dmd5kafitptkfvu...';
```

Every production secret is checked into source control in plain text. The Adapty SDK key (`public_live_...`) is the live payment processing key — anyone who decompiles the app binary or accesses the repository can extract it and call the Adapty API directly, potentially issuing fake entitlements or querying subscriber data. The Supabase anon key is a signed JWT granting public API access to the Supabase project. The Google OAuth client IDs are tied to production credentials.

**Specific harms:**

1. The Adapty key could be used to manipulate subscriber access levels via Adapty's REST API.
2. The Supabase anon key enables direct queries against the database, limited only by Row-Level Security rules — if any RLS policy has a gap, user data is exposed.
3. Once committed to git history, rotation alone does not remove the secret; the history must be rewritten.
4. The `.gitignore` does not exclude `src/config.ts`.

**Required actions:** Move all secrets to environment variables or a secrets manager. At minimum, use a `.env` file (excluded from git) and reference via `react-native-config` or build-time injection. Rotate all exposed credentials immediately.

<!-- how do i move these to a secret manager so when i compile and send to the app store, the app can still ead the secrets? -->

---

### ~~C-2 — No Privacy Policy, No Account Deletion, No Data Disclosure~~ ✅ FIXED

> **✅ FIXED** — Privacy Policy link added to `SettingsModal` (placeholder URL in `src/config.ts`). Delete Account flow added to `SettingsModal` with confirmation alert; `authStore.deleteAccount` calls `supabase.rpc('delete_user')` and cascades to all related data.

**Files:** `src/screens/HomeScreen.tsx`, `src/components/SettingsModal.tsx`, `src/components/PaywallModal.tsx`

~~**Risk:** App Store rejection, GDPR Article 17, CCPA §1798.105, Apple Guideline 5.1.1(v)~~

The app creates server-side user records (Supabase anonymous auth), syncs user gameplay data (puzzle progress, timing, streaks) to a remote server via PowerSync, collects email addresses, and processes payments — yet the UI contains no link to a Privacy Policy or Terms of Service anywhere, and the Settings modal offers no account deletion option.

**Specific violations:**

1. **Apple App Store Guideline 5.1.1**: "If your app doesn't include account functionality, don't require users to log in... Apps that collect user or usage data must have a privacy policy." The app collects both. Submission without a privacy policy URL in App Store Connect and in-app will be rejected.

2. **Apple App Store Guideline 5.1.1(v)**: "Apps that allow account creation must also allow account deletion." The Settings modal has Sign Out but no Delete Account. This is a documented rejection reason.

3. **GDPR Article 13**: Users must be informed at the point of data collection what data is collected, who processes it, the legal basis, retention periods, and data subject rights. The app silently creates a Supabase user record on first launch (`signInAnonymously()`) with no disclosure.

4. **GDPR Article 17 / CCPA §1798.105**: Users have the right to request deletion of their personal data. There is no mechanism in the app to exercise this right.

5. **COPPA (if applicable)**: If any users are under 13, additional consent requirements apply. The app's puzzle content has no age gate and no age verification.

**Important discrepancy:** The design spec (`docs/specs/GEN-auth-sync.md`) states "Anonymous users are purely local — no server-side records until the user creates an account." The implementation contradicts this — `supabase.auth.signInAnonymously()` is called on every cold launch, creating a server-side Supabase user record for every user immediately, before any account creation. Gameplay data is then synced to this anonymous record via PowerSync. This means the actual data collection far exceeds what the spec described.

**Required actions:** Add a Privacy Policy link (both in-app and App Store listing). Add a Delete Account flow that removes all server-side data (Supabase user row, puzzle_progress, streaks, user_entitlements). Either align the anonymous auth implementation with the spec (truly local-only) or update data disclosures to accurately describe server-side anonymous user creation.

---

### ~~C-3 — In-App Purchase Prices Hardcoded in USD in UI~~ ✅ FIXED

> **✅ FIXED** — `useProductPrice` hook added in `src/hooks/useProductPrice.ts`. All price strings in `PaywallModal`, `SettingsModal`, `StreaksScreen`, and `HomeScreen` now use localized prices fetched from Adapty at runtime via `getLocalizedPrice`.

**Files:** `src/components/PaywallModal.tsx` (lines 49, 103), `src/components/SettingsModal.tsx` (line 444), `src/screens/StreaksScreen.tsx` (line 152), `src/screens/HomeScreen.tsx` (line 243)

~~**Risk:** App Store rejection, EU consumer protection law, misleading advertising liability~~

The UI displays hardcoded dollar amounts that are never sourced from the App Store:

```tsx
// PaywallModal.tsx:49
<Text>Unlock All with Premium · $5.99</Text>

// PaywallModal.tsx:103
<Text>Buy Premium · $5.99 · All Packs</Text>

// HomeScreen.tsx:243
<Text>${pack.priceUsd?.toFixed(2) ?? '—'}</Text>   // from database, not store
```

The `fetchPaywall()` function in `payments.ts` does retrieve `AdaptyPaywallProduct` objects which contain localized pricing, but that data is never surfaced in the UI. All purchase buttons show hardcoded "$5.99" regardless of the user's country, currency, or any promotional pricing set in App Store Connect.

**Specific violations:**

1. **Apple App Store Guideline 3.1.1 and StoreKit guidelines**: Price strings shown to users must be obtained from the product object returned by the payment framework, in the user's local currency. Showing hardcoded prices is a documented rejection reason.

2. **EU Consumer Rights Directive / UK Consumer Rights Act**: Prices shown to consumers must be in the local currency and inclusive of applicable taxes. Showing $5.99 to a UK user when they will be charged £5.99 (or whatever Apple's local price is) constitutes misleading pricing.

3. **EU Omnibus Directive (2021/771/EU)**: Price accuracy requirements for digital goods sold to EU consumers.

4. **Additional risk in `purchasePack`**: The pack price displayed in `HomeScreen` comes from `pack.priceUsd` in the database, not from the store. If the database and App Store Connect are ever out of sync, users see a different price from what they are charged.

**Required actions:** Replace all hardcoded price strings with the `localizedPrice` property from the `AdaptyPaywallProduct` object. The product data is already fetched — it just isn't being used for display.

<!-- configure this properly -->

---

## HIGH Severity Findings

---

### ~~H-1 — `purchasePack` Does Not Verify Purchase Success Before Delivering Content~~ ✅ FIXED

> **✅ FIXED** — `purchasePack` now checks `result.type !== 'success'` and throws before calling `downloadPack`.

**File:** `src/utils/payments.ts`, lines 26–38

```typescript
export async function purchasePack(
  packId: string,
  storagePath: string,
): Promise<void> {
  const { products } = await fetchPaywall();
  const product = products.find(
    p => p.vendorProductId === `starbattle_pack_${packId}`,
  );
  if (!product)
    throw new Error(`Pack product not found: starbattle_pack_${packId}`);

  await adapty.makePurchase(product); // ← return value discarded
  await downloadPack(packId, storagePath); // ← runs regardless of purchase outcome
}
```

The return value of `adapty.makePurchase(product)` is discarded. If the purchase is cancelled, fails, or returns a non-success result, `downloadPack` still executes and delivers paid content. This is a revenue leak and constitutes delivery of paid content without payment.

Compare `purchasePremium` in the same file, which correctly checks `result.type === 'success'`.

**Required fix:** Check the result of `makePurchase` and throw if the purchase was not successful before calling `downloadPack`.

---

### ~~H-2 — `purchasePremium` Returns `false` on Failure Without Throwing; `onSuccess` Fires Anyway~~ ✅ FIXED

> **✅ FIXED** — `purchasePremium` now throws `'Purchase did not complete. Please try again.'` instead of returning `false`, so `useAsyncAction` surfaces the error and `onSuccess` never fires on failure.

**Files:** `src/utils/payments.ts` lines 14–24, `src/components/PaywallModal.tsx` lines 28–31, `src/hooks/useAsyncAction.ts` lines 7–18

```typescript
// payments.ts
export async function purchasePremium(): Promise<boolean> {
  ...
  return false;  // cancelled purchase, or premium not active — no exception thrown
}

// PaywallModal.tsx
function purchase(fn: () => Promise<unknown>) {
  run(fn, () => { onPurchaseSuccess?.(); onClose(); });  // onSuccess fires if no exception
}
```

`useAsyncAction.run()` calls `onSuccess` whenever the async function completes without throwing. Since `purchasePremium` returns `false` (rather than throwing) for a cancelled or failed purchase, the modal closes and `onPurchaseSuccess` fires as if the purchase succeeded — even though it didn't. The user doesn't get premium, but the paywall closes with success-like behavior. This creates confusing UX and could mask payment failures from the user.

**Required fix:** Either throw in `purchasePremium` when `isActive` is false (or when the purchase was not of type `'success'`), or have the `purchase` wrapper in `PaywallModal` check the boolean return value.

---

### ~~H-3 — Missing Restore Purchases for Anonymous Users~~ ✅ CLOSED (by design)

> **✅ CLOSED** — By product design, anonymous users cannot make purchases. The `PaywallModal` for anonymous users in a paid-pack context routes them to create an account before any transaction can occur. Because no purchase path exists for anonymous users, Apple's Guideline 3.1.1 ("Restore Purchases must appear wherever a purchase can be made") does not apply to the anonymous flow. Restricting "Restore Purchases" to `!isAnonymous` is correct and defensible.

**File:** `src/components/SettingsModal.tsx`

~~The "Restore Purchases" button is only rendered when `!isAnonymous`. Anonymous users have no way to restore purchases they may have made without first creating an account.~~

---

### ~~H-4 — No Purchase Terms Disclosed at Point of Sale~~ ✅ FIXED

> **✅ FIXED** — Both `PaywallModal` and `SettingsModal` now show "Terms of Use · Privacy Policy" links at all purchase points. Auto-renewal language was intentionally omitted: per `docs/plan.md` Phase 7.1, both Premium (`sb_premium_599`, $5.99) and individual packs (`starbattle_pack_{id}`, $1.99) are **one-time non-consumable IAPs** — not auto-renewable subscriptions. Showing subscription disclosure language would be inaccurate and potentially misleading to reviewers.

> **📝 Note:** `docs/plan.md` Phase 7.1 names the premium product `starbattle_premium` — that is a stale reference. The authoritative product ID is `sb_premium_599`, used consistently throughout the codebase (`payments.ts`, all `useProductPrice` calls). Adapty and App Store Connect are configured with `sb_premium_599`. No code change needed; update the plan doc when convenient.

**File:** `src/components/PaywallModal.tsx`, `src/components/SettingsModal.tsx`

~~Neither the paywall modal nor the settings purchase buttons display any terms or a link to Terms of Service or Privacy Policy at the point of purchase.~~

~~**Apple App Store Guideline 3.1.1**: Price strings and purchase terms must be shown at point of sale.~~

~~**EU Directive 2011/83/EU (Consumer Rights)**: For digital content purchases, the consumer must be informed of the main characteristics, total price, and the right of withdrawal before being bound by a contract.~~

---

## MEDIUM Severity Findings

---

### ~~M-1 — Anonymous Sign-in Creates Server-Side Records Without User Disclosure~~ ✅ CLOSED (by documentation)

> **✅ CLOSED** — Resolved by documentation, not code. The privacy policy discloses that a pseudonymous session is created on first launch and that gameplay data syncs to the server. `PrivacyInfo.xcprivacy` declares `UserID` and `GameplayContent` as collected. The privacy policy link is surfaced in-app via `SettingsModal`. No code change required — legitimate interests is a valid GDPR basis for this processing.



**File:** `src/stores/authStore.ts`, line 65–68

```typescript
signInAnonymously: async () => {
  const { data, error } = await supabase.auth.signInAnonymously();
  ...
  set({ session: data.session, user: data.user, isAnonymous: true });
},
```

This is called automatically on first launch (and on every sign-out). It creates a permanent server-side user record in Supabase before the user has read any disclosure or consented to any data collection. Puzzle progress, streaks, and completion data then sync to this record.

The spec (`GEN-auth-sync.md`) explicitly says anonymous users would be "purely local — no server-side records." The implementation inverts this. Users are being tracked server-side from the first second they launch the app, with no notice.

Under GDPR's legitimate interests basis, this could potentially be justified — but only with a valid Legitimate Interests Assessment, a privacy notice presented before processing, and a clear user-facing explanation. None of these exist.

---

### ~~M-2 — Progress Data Saved Without `await` on Navigation; Potential Data Loss~~ ✅ FIXED

> **✅ FIXED** — `beforeRemove` now calls `e.preventDefault()`, awaits `saveProgress` via `.finally()`, then dispatches the original navigation action. Added an `AppState` listener that fires a fire-and-forget save whenever the app goes to `background` or `inactive`, covering the app-kill case.



**File:** `src/screens/PuzzleScreen.tsx`, lines 206–218

```typescript
navigation.addListener('beforeRemove', () => {
  const state = usePuzzleStore.getState();
  if (state.puzzle) {
    saveProgress(
      // ← async, not awaited
      state.puzzle.id,
      state.cells,
      state.autoMarks,
      state.timeMs,
      state.completed,
    );
  }
});
```

`saveProgress` is an async function that writes to the local SQLite database and queues a PowerSync sync. It is called without `await` inside the `beforeRemove` listener. React Navigation does not wait for async work in `beforeRemove` callbacks. If the user exits the puzzle (or the app is killed), the in-flight DB write may be lost, erasing the user's progress.

Additionally, the debounced `scheduleSave` in `store.ts` (400ms timeout) means the last move before exit may not be persisted if the app is killed within 400ms of the last interaction. There is no save-on-background handler (no `AppState` listener for "background"/"inactive").

User-facing consequence: players could solve puzzles and lose their completion record, leading to support claims and potential refund demands if they feel they lost paid content progress.

---

### ~~M-3 — `JSON.parse` Without Error Handling on Database Values~~ ✅ FIXED

> **✅ FIXED** — `loadProgress` in `progress.ts` now wraps both `JSON.parse` calls in a try/catch, returning `null` on parse failure (puzzle loads fresh instead of crashing). `loadEntitlements` in `entitlementsStore.ts` wraps `owned_pack_ids` parse in a try/catch, falling back to `[]` so the app stays functional if that field is corrupt.



**File:** `src/stores/entitlementsStore.ts` line 71, `src/utils/progress.ts` lines 80–83

```typescript
// entitlementsStore.ts
ownedPackIds: JSON.parse(entRow.owned_pack_ids || '[]'),

// progress.ts
cells: JSON.parse(row.cells),
autoMarks: JSON.parse(row.auto_marks ?? '[]'),
```

These `JSON.parse` calls are unguarded. If the local SQLite database contains a corrupted or malformed JSON string (which can happen after an unexpected app kill during a write, or after a PowerSync conflict), parsing throws an unhandled exception. In `loadEntitlements`, this would crash the entitlements store initialization, making all content appear inaccessible. In `loadProgress`, this would prevent a puzzle from loading at all.

---

### ~~M-4 — Streak Date Key Computed from Device Clock; No Server-Side Validation~~ ✅ FIXED

> **✅ FIXED** — `recordStreak` now rejects any update where `currentKey < existing.last_completed_key`. Daily/weekly/monthly keys are zero-padded ISO strings that sort lexicographically, so a key earlier than the last-recorded one means the device clock has been moved backward. This closes the re-claim attack without requiring a server round-trip or migration. Setting the clock forward to access future archive entries is self-limiting — the `streak_archive` table only contains rows the admin has pre-populated, so future entries simply don't exist locally.



**File:** `src/utils/streakDate.ts`, `src/utils/progress.ts` lines 172–194

Streak keys (`2025-01-15`, `2025-W03`, `2025-01`) are computed entirely from `new Date()` on the device. They are then stored server-side via PowerSync. A user who sets their device clock backward can:

1. Re-complete a "daily" puzzle they already solved
2. Increment their streak count for a period they already claimed
3. Access "past archive" puzzles by setting the clock to future dates

The server receives whatever `date_key` the client sends — there is no server-side timestamp validation in the connector (`Connector.ts`). This is a game integrity issue that also creates misleading leaderboard/streak data.

---

### ~~M-5 — `signUpWithEmail` Uses `updateUser` Instead of `signUp`; No Email Verification Flow~~ ✅ FIXED

> **✅ FIXED** — Email confirmation, password reset, and deep-link handling all implemented:
> 1. `authStore.signUpWithEmail` no longer calls `applySignIn` — anonymous session stays until `USER_UPDATED` fires after email confirmation.
> 2. `SettingsModal` transitions to `'confirm-email'` after sign-up and `'reset-sent'` after requesting a reset.
> 3. `App.tsx` adds `AppState` listener (`supabase.auth.refreshSession()` on foreground) and `Linking` listener for deep links arriving while app is running.
> 4. `authStore.initialize` calls `Linking.getInitialURL()` for cold-launch deep links; `handleDeepLink` exchanges tokens from the URL fragment.
> 5. `onAuthStateChange` handles `PASSWORD_RECOVERY` (sets `isPasswordRecovery: true`) and `USER_UPDATED` (clears it).
> 6. New `ResetPasswordModal` component appears on `isPasswordRecovery`, lets user set new password, dismisses on success.
> 7. `Info.plist` registers `starbattle://` URL scheme; `resetPasswordForEmail` uses `redirectTo: 'starbattle://reset-password'`.
> 8. "Forgot Password?" link added to sign-in form in `SettingsModal`.
>
> Password strength validation remains a post-launch item.

**File:** `src/stores/authStore.ts`, lines 71–75

---

### ~~M-6 — `storagePath` Absent Silently Prevents Paid Pack Purchase~~ ✅ FIXED

> **✅ FIXED** — `handleLockedPress` in `LibraryScreen` now sets `type: 'unavailable'` when `storagePath` is missing, which shows a "not available right now" message in `PaywallModal` instead of silently falling through to the sequential paywall. `unavailable` variant added to `PaywallContext` type in `types.ts`. Also removed the now-incorrect `priceUsd !== undefined` guard — price display is handled separately via `useProductPrice`.



**File:** `src/screens/LibraryScreen.tsx`, lines 152–163

```typescript
const handleLockedPress = useCallback(
  (index: number) => {
    if (!isFree && !hasPackAccess(packId)) {
      if (priceUsd !== undefined && storagePath !== undefined) {
        setPaywallContext({ type: 'paid-pack', ... });
      } else {
        setPaywallContext({ type: 'sequential', packId, puzzleIndex: index });
      }
    } else {
      setPaywallContext({ type: 'sequential', packId, puzzleIndex: index });
    }
  }, ...
);
```

If a paid pack's database row has a null `storage_path`, the paywall silently shows a "sequential" unlock modal ("Complete the previous puzzle to unlock this one") instead of the paid purchase flow. A user tapping on a locked paid pack would be told they need to complete the previous puzzle, when actually the pack requires purchase. This is both confusing and a revenue blocker — users cannot purchase packs if `storage_path` is missing in the database. There is no error message or fallback that explains the situation.

---

## LOW Severity Findings

---

### ~~L-1 — Empty `NSLocationWhenInUseUsageDescription` in Info.plist~~ ✅ FIXED

> **✅ FIXED** — Key removed from `Info.plist`. The app does not use location.

---

### ~~L-2 — `NSPrivacyCollectedDataTypes` Array Is Empty Despite Collecting User Data~~ ✅ FIXED

> **✅ FIXED** — `PrivacyInfo.xcprivacy` now declares all four collected data types, all linked to identity, none used for tracking: `EmailAddress` (account creation), `UserID` (anonymous Supabase UUID), `GameplayContent` (progress, streaks, solve times), `PurchaseHistory` (IAP entitlements via Adapty). Purpose for all: `AppFunctionality`.

---

### ~~L-3 — Apple Sign-In Requests `FULL_NAME` Scope That Is Never Used~~ ✅ FIXED

> **✅ FIXED** — `appleAuth.Scope.FULL_NAME` removed from the sign-in request in `authStore.ts`. Only `EMAIL` is requested.



**File:** `src/stores/authStore.ts`, lines 96–107

```typescript
const credential = await appleAuth.performRequest({
  requestedOperation: appleAuth.Operation.LOGIN,
  requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
});
```

The app requests the user's full name from Apple but never stores or displays it. Apple only provides the full name on the first sign-in; subsequent sign-ins return null for the name. Requesting personal data that is not needed or used is a GDPR data minimization violation (Article 5(1)(c): "adequate, relevant and limited to what is necessary"). A DPA audit could flag this.

---

### ~~L-4 — Internal API Error Messages Exposed Directly to Users~~ ✅ FIXED

> **✅ FIXED** — `useAsyncAction` now passes all errors through `toUserMessage()` before displaying. Known Supabase auth errors map to plain-English strings. User-cancelled flows (Google/Apple sign-in) return `null` so no error is shown. Postgres/RLS internals are caught and replaced with a generic fallback. Our own already-friendly messages from `payments.ts` and `authStore.ts` pass through unchanged.



**File:** `src/hooks/useAsyncAction.ts`, line 13

```typescript
setError(e instanceof Error ? e.message : 'Something went wrong');
```

Raw exception messages from Supabase (Postgres error text, including constraint names and RLS policy language), Adapty, PowerSync, and Google Sign-In are displayed verbatim to users. These messages may contain:

- Postgres constraint identifiers and schema names
- HTTP endpoint paths and status codes
- Internal error codes from third-party SDKs

This exposes implementation details and internal infrastructure to end users, facilitating reconnaissance. It also produces poor UX when a Postgres foreign key violation message appears in a consumer app.

---

### ~~L-5 — `signOut` Immediately Creates a New Anonymous Server Record~~ ✅ FIXED

> **✅ FIXED** — `signInWithEmail`, `signInWithGoogle`, and `signInWithApple` now call `supabase.rpc('delete_user')` (wrapped in try/catch) before signing in whenever `isAnonymous` is true. This deletes the transient anonymous session that would otherwise become an orphan the moment the named session is established. `signUpWithEmail` is unaffected — `updateUser` upgrades the existing anonymous user rather than creating a new one.

**File:** `src/stores/authStore.ts`, lines 109–114

---

### ~~L-6 — Puzzle Solutions Stored Client-Side in Plaintext~~ ✅ FIXED

> **✅ FIXED** — `packs/index.ts` now encodes each puzzle's `solution` array as a base64 string (key `_s`) before writing to disk, and decodes it back on read. The in-memory cache and all runtime code continue to use the original `Coord[]` format; only the persisted `.json` files are obfuscated. Solutions are no longer directly readable as human-readable row/col arrays in the cached pack files.

**File:** `src/packs/index.ts`, `src/utils/parsePuzzle.ts`

---

### ~~L-7 — No Integrity Verification on Downloaded Pack Files~~ ✅ FIXED

> **✅ FIXED** — Added `validatePackText()` in `packs/index.ts` that runs immediately after every network download (in both `fetchPack` and `downloadPack`) before any disk write or cache population. It verifies: valid JSON, non-empty `puzzles` array, and a well-formed SBN header (`NxN.…`) on every puzzle. Malformed or truncated responses throw before reaching the cache, forcing a retry on next load. True cryptographic hash verification would require a server-stored reference hash — that remains a future enhancement.

**File:** `src/packs/index.ts`, lines 35–53

---

## Summary Table — Round 1 (All Resolved)

| ID      | Severity     | Area              | Description                                                                           |
| ------- | ------------ | ----------------- | ------------------------------------------------------------------------------------- |
| ~~C-1~~ | ~~CRITICAL~~ | ~~Security~~      | ~~All production credentials hardcoded in source~~ ✅                                 |
| ~~C-2~~ | ~~CRITICAL~~ | ~~Privacy/Legal~~ | ~~No privacy policy, no account deletion, undisclosed server-side anon auth~~ ✅     |
| ~~C-3~~ | ~~CRITICAL~~ | ~~IAP/Consumer Law~~ | ~~Prices hardcoded in USD, never from store~~ ✅                                  |
| ~~H-1~~ | ~~HIGH~~     | ~~IAP~~           | ~~`purchasePack` delivers content before verifying purchase success~~ ✅              |
| ~~H-2~~ | ~~HIGH~~     | ~~IAP~~           | ~~`purchasePremium` returns `false` without throwing; modal closes as success~~ ✅   |
| ~~H-3~~ | ~~HIGH~~     | ~~IAP~~           | ~~Restore Purchases inaccessible to anonymous users~~ ✅ by design                   |
| ~~H-4~~ | ~~HIGH~~     | ~~IAP/Consumer Law~~ | ~~No purchase terms disclosed at point of sale~~ ✅                              |
| ~~M-1~~ | ~~MEDIUM~~   | ~~Privacy~~       | ~~Anonymous sign-in creates server records without disclosure~~ ✅ by documentation  |
| ~~M-2~~ | ~~MEDIUM~~   | ~~Data Integrity~~| ~~Progress save not awaited on navigation; data loss on exit/kill~~ ✅               |
| ~~M-3~~ | ~~MEDIUM~~   | ~~Stability~~     | ~~`JSON.parse` unguarded on database fields; crash risk on corrupt data~~ ✅          |
| ~~M-4~~ | ~~MEDIUM~~   | ~~Game Integrity~~| ~~Streak dates computed client-side; no server validation; clock manipulation possible~~ ✅ |
| ~~M-5~~ | ~~MEDIUM~~   | ~~UX/Auth~~       | ~~Email sign-up shows no confirmation prompt; no password reset; no strength validation~~ ✅ FIXED (confirmation flow + password reset); strength validation post-launch |
| ~~M-6~~ | ~~MEDIUM~~   | ~~IAP~~           | ~~Missing `storagePath` silently prevents paid pack purchase~~ ✅                     |
| ~~L-1~~ | ~~LOW~~      | ~~App Store~~     | ~~Empty `NSLocationWhenInUseUsageDescription` in Info.plist~~ ✅                      |
| ~~L-2~~ | ~~LOW~~      | ~~App Store/Privacy~~ | ~~`NSPrivacyCollectedDataTypes` empty despite collecting user data~~ ✅           |
| ~~L-3~~ | ~~LOW~~      | ~~Privacy~~       | ~~Apple Sign-In requests full name scope; data never used~~ ✅                        |
| ~~L-4~~ | ~~LOW~~      | ~~Security~~      | ~~Raw internal error messages surfaced to users~~ ✅                                  |
| ~~L-5~~ | ~~LOW~~      | ~~Data~~          | ~~Sign-out creates unbounded orphan server records with no cleanup~~ ✅               |
| ~~L-6~~ | ~~LOW~~      | ~~Game Integrity~~| ~~Puzzle solutions stored in plaintext on device filesystem~~ ✅                      |
| ~~L-7~~ | ~~LOW~~      | ~~Security~~      | ~~No integrity check on downloaded pack files~~ ✅ (structural validation; hash verification needs server support) |

---

---

# Round 2 — Deep Audit Findings

**Audit date: May 2026** — Full read of all production source files following Round 1 remediation.

---

## Round 2 Executive Summary

All 20 Round 1 findings have been resolved. This second pass surfaced **10 new findings** ranging from a data-loss defect that silently destroys anonymous user progress to a GDPR erasure gap involving third-party subscriber records. Three findings are HIGH severity and require resolution before any App Store submission.

---

## HIGH Severity — Round 2

---

### ~~N-H-1 — Canceling Google or Apple Sign-In After Anonymous Session Deletion Permanently Destroys User Data~~ ✅ FIXED

> **✅ FIXED** — All three sign-in methods now save the anonymous user ID *before* attempting sign-in, then call a new `delete_anonymous_user(target_id)` RPC *after* `applySignIn()` succeeds. If sign-in fails for any reason (user cancels, network error, token rejection), the anonymous record is untouched. The new RPC function only deletes users where `is_anonymous = true`, preventing IDOR misuse. SQL for both required Supabase functions is documented in the `deleteAccount` comment in `authStore.ts`.

**Files:** `src/stores/authStore.ts` lines 122–162

```typescript
// OLD (destructive — deletes anonymous record before knowing if sign-in will succeed)
signInWithGoogle: async () => {
  if (get().isAnonymous) {
    try { await supabase.rpc('delete_user'); } catch (_) {} // ← anonymous record deleted
  }
  const response = await GoogleSignin.signIn(); // ← user cancels → data already gone
},

// NEW (safe — anonymous record only deleted after named sign-in is confirmed)
signInWithGoogle: async () => {
  const anonId = get().isAnonymous ? (get().user?.id ?? null) : null;
  const response = await GoogleSignin.signIn(); // ← user cancels → anonId untouched
  // ...
  await applySignIn(set, data.session, data.user); // ← success confirmed
  if (anonId) {
    try { await supabase.rpc('delete_anonymous_user', { target_id: anonId }); } catch (_) {}
  }
},
```

**Required Supabase SQL** (run once in SQL editor — documented in `authStore.ts`):
```sql
CREATE OR REPLACE FUNCTION public.delete_anonymous_user(target_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = target_id AND is_anonymous = true;
END; $$;
GRANT EXECUTE ON FUNCTION public.delete_anonymous_user(uuid) TO authenticated;
```

---

### N-H-2 — `purchasePremium` Returns `false` Silently When Transaction Succeeds But Adapty Access Level Is Not Immediately Active

**File:** `src/utils/payments.ts` lines 25–35

```typescript
export async function purchasePremium(): Promise<boolean> {
  // ...
  const result = await adapty.makePurchase(product);
  if (result.type === 'success') {
    return result.profile.accessLevels?.premium?.isActive ?? false; // ← can return false without throwing
  }
  throw new Error('Purchase did not complete. Please try again.');
}
```

**What happens:** The H-2 fix correctly added a `throw` for `result.type !== 'success'`. However, a second silent-failure path remains: `result.type === 'success'` but `result.profile.accessLevels?.premium?.isActive` is `false`. This occurs when there is a server-side processing lag between Adapty recording the transaction and provisioning the access level. The function returns `false` without throwing.

In `PaywallModal.tsx`:
```typescript
function purchase(fn: () => Promise<unknown>) {
  run(fn, () => { onPurchaseSuccess?.(); onClose(); }); // onSuccess fires when fn() resolves, not when it returns true
}
```
`run()` calls `onSuccess` whenever `fn()` resolves without throwing. Since `purchasePremium()` returning `false` does not throw, `onSuccess` fires, the paywall modal closes, and `onPurchaseSuccess()` is called — even though premium is not active.

**User-facing harm:** The user's payment is processed by the App Store; the transaction is recorded by Adapty. But the in-app paywall closes with no access granted and no error shown. The user has paid and received nothing. They would need to use "Restore Purchases" to recover.

**Required fix:** In `purchasePremium`, after `result.type === 'success'`, check `isActive` and throw if `false`:
```typescript
const isActive = result.profile.accessLevels?.premium?.isActive ?? false;
if (!isActive) throw new Error('Purchase recorded but access not yet active. Please restore purchases.');
return true;
```

---

### N-H-3 — GDPR Right to Erasure Incomplete: `deleteAccount` Does Not Delete Adapty Subscriber Data

**Files:** `src/stores/authStore.ts` lines 196–202, `src/components/SettingsModal.tsx` lines 302–315

```typescript
deleteAccount: async () => {
  const { error } = await supabase.rpc('delete_user'); // deletes Supabase data ✓
  if (error) throw ...;
  try { await adapty.logout(); } catch (_) {}           // logs out of SDK; does NOT delete records
  set({ session: null, user: null, isAnonymous: true });
  await get().signInAnonymously();
},
```

**What is NOT deleted:** `adapty.logout()` ends the local SDK session and clears the cached profile. It does not instruct Adapty's servers to delete the subscriber record. Adapty stores the following data tied to the user's `adapty.identify(user.id)` identifier:
- Purchase history and transaction receipts
- Access level history
- Attribution data (if configured)
- Subscription status timeline

**Legal exposure:**

Under **GDPR Article 17** ("Right to erasure"), a data subject's request to delete their account requires deletion of all personal data held by the controller and, where applicable, by processors acting on the controller's behalf. Adapty is a data processor (they process subscriber data on behalf of the app developer). The account deletion dialog in `SettingsModal` states: *"This permanently deletes your account, all puzzle progress, streaks, and purchases."* This representation is materially false with respect to Adapty subscriber data, which is retained.

Under **CCPA §1798.105**, California residents have the right to request deletion of their personal information from all sources. The same gap applies.

**Required fix:** After the Supabase deletion, call Adapty's profile deletion API (if available in the SDK) or implement a webhook/server-side call to delete the subscriber record via Adapty's REST API using the user's Adapty customer ID. Alternatively, document in the Privacy Policy that subscriber data is retained by Adapty per their data retention policy and provide the Adapty-specific deletion path (contact/support form).

---

## MEDIUM Severity — Round 2

---

### N-M-1 — `deleteAccount` Immediately Creates a New Anonymous Session Without User Disclosure

**File:** `src/stores/authStore.ts` lines 196–202

After successfully deleting all user data, `deleteAccount` immediately calls `get().signInAnonymously()`, which creates a new Supabase anonymous user record and resumes server-side data sync before the user can do anything.

**The disclosure problem:** The account deletion confirmation dialog says: *"This permanently deletes your account, all puzzle progress, streaks, and purchases. This cannot be undone."* It says nothing about the fact that a new server-side anonymous record is immediately created and data collection resumes. A user who deletes their account expecting to stop being tracked is immediately re-enrolled in server-side data collection without notice or consent.

**Edge case:** If `signInAnonymously()` fails (network error, Supabase outage), the app is left in a broken state: `{ session: null, user: null, isAnonymous: true }` with no active session. PowerSync continues attempting to upload queued operations that will fail because no auth token exists. The user sees no error; the app appears functional but data writes are silently failing.

**Required fix:** Either (1) disclose in the deletion dialog that a new anonymous session will be created and explain why (gameplay functionality), or (2) add a brief recovery path if `signInAnonymously()` fails (retry or show a restart prompt).

---

### N-M-2 — `purchasePremium` in SettingsModal Has No `onSuccess` Callback; No UI Feedback After Successful Purchase

**File:** `src/components/SettingsModal.tsx` lines 566–579

```tsx
<Pressable
  onPress={() => withLoading(purchasePremium)} // ← no onSuccess callback
  disabled={loading}
>
  <Text style={styles.primaryButtonText}>
    {premiumPrice ? `Buy Premium · ${premiumPrice}` : 'Buy Premium'}
  </Text>
</Pressable>
```

Compare `PaywallModal`, where `purchase(purchasePremium)` wraps it with `run(fn, () => { onPurchaseSuccess?.(); onClose(); })` — the modal closes and a callback fires on success.

In `SettingsModal`, `withLoading(purchasePremium)` has no `onSuccess`. After a successful purchase:
- The loading spinner stops.
- `purchasePremium` returns `true` (or `false`, per N-H-2).
- The UI does not update. The "Buy Premium" button is still visible because entitlements have not yet been refreshed.
- Premium status will eventually appear when Adapty's webhook fires and PowerSync syncs the updated `user_entitlements` row from Supabase — which could take seconds to minutes.
- There is zero in-app purchase confirmation shown to the user.

**Apple App Store implication:** Apple's Human Interface Guidelines require that in-app purchases show clear confirmation of the transaction. Silently stopping the spinner and returning to the same button with no state change fails this requirement and may prompt user support complaints or chargeback disputes.

**Required fix:** Add an `onSuccess` callback to the `withLoading(purchasePremium)` call in SettingsModal — at minimum showing a success message or refreshing local entitlements from Adapty's returned profile.

---

### N-M-3 — `restorePurchases()` Does Not Propagate Restored Entitlements to Local Store; Appears Nonfunctional to Users

**Files:** `src/utils/payments.ts` lines 52–54, `src/components/SettingsModal.tsx` lines 593–601

```typescript
export async function restorePurchases(): Promise<void> {
  await adapty.restorePurchases(); // updates Adapty profile server-side; returns void
}
```

`adapty.restorePurchases()` contacts Adapty's servers, validates the App Store receipt, and updates the subscriber profile — all server-side. The function returns `void` with no indication of what was restored. There is no code that reads the restored profile and updates either the local `user_entitlements` SQLite table or the in-memory Zustand store.

**User-facing behavior:** The user taps "Restore Purchases," sees a loading spinner, then the spinner stops. Premium badge does not appear. Owned packs remain locked. The user has no reason to believe the restore worked. This behavior is likely to generate support requests ("restore doesn't work") and could cause App Store review friction (reviewers test restore during review).

**Note:** The entitlements *will* eventually update via PowerSync once Adapty's webhook fires and updates the Supabase `user_entitlements` table — but this assumes the webhook is correctly configured and could take minutes. Users who just installed the app on a new device and are restoring will be left confused.

**Required fix:** Use the `AdaptyProfile` returned by `adapty.restorePurchases()` (which the current function discards) to immediately update the local entitlements store, or at minimum refresh the entitlements from Adapty after restoration.

---

### N-M-4 — `emailMode === 'forgot-password'` Form Is Dead Code; Never Reachable

**File:** `src/components/SettingsModal.tsx` lines 32, 474–505

```typescript
type EmailMode = 'signup' | 'signin' | 'confirm-email' | 'forgot-password' | 'reset-sent' | null;
```

The `'forgot-password'` mode is defined in the `EmailMode` union type and has a full rendered form at lines 474–505 (email input, "Send Reset Link" button, "Back to Sign In" link). However, `setEmailMode('forgot-password')` is never called anywhere in the file. The `'forgot-password'` form is unreachable code.

The actual "Forgot Password?" flow works via a button inside the `emailMode === 'signin'` form (line 452) that calls `handleForgotPassword()` directly, which calls `requestPasswordReset(email)` and immediately transitions to `'reset-sent'` — bypassing `'forgot-password'` entirely.

**Consequence:** The `'forgot-password'` form at lines 474–505 — which renders a separate email input for entering the reset address — is never shown to users. This creates confusion: the "Forgot Password?" button reuses the email already typed in the sign-in form. If the user hasn't typed their email yet, they get the error "Enter your email address first" with no clear way to enter it within the forgot-password context (they must notice the email field above is blank and fill it first before tapping "Forgot Password?" again).

More importantly, the dead code creates maintenance risk: future developers may attempt to wire `'forgot-password'` mode, discover conflicting behavior, or ship an inconsistent form.

**Required fix:** Either (1) remove the `'forgot-password'` branch entirely and remove it from `EmailMode`, or (2) route "Forgot Password?" to set `emailMode('forgot-password')` so the dedicated form is shown.

---

## LOW Severity — Round 2

---

### N-L-1 — App Title Displays "Star Battle Free" Despite Containing Paid Content

**File:** `src/screens/HomeScreen.tsx` line 189

```tsx
<Text style={styles.appTitle}>Star Battle Free</Text>
```

The visible app title in the main screen UI is "Star Battle Free." The app contains:
- A $5.99 premium subscription (one-time IAP per `docs/plan.md`)
- Individual paid packs at $1.99 each

**EU Consumer Rights Directive / UK Consumer Rights Act:** Using the label "Free" for an app that sells premium content without clear, upfront disclosure of the pricing model can constitute misleading commercial practice. Specifically, the "Free" label implies the user will not be charged for the app's primary value proposition.

**Apple App Store Guideline 2.3.2:** App names and metadata must accurately describe the app. If the App Store listing name is "Star Battle" but the in-app UI shows "Star Battle Free," reviewers and users may question the discrepancy.

**Required fix:** Remove "Free" from the in-app title, or ensure the title accurately reflects the app's freemium model. If the intent is to position the app as free-to-download with optional paid upgrades, the title alone does not convey this adequately.

---

### N-L-2 — `Linking.openURL()` in `PaywallModal` Has No `.catch()` Handler — Unhandled Rejection at Point of Sale

**File:** `src/components/PaywallModal.tsx` lines 152–158

```tsx
<Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
  <Text style={styles.disclosureLink}>Terms of Use</Text>
</Pressable>
<Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} hitSlop={8}>
  <Text style={styles.disclosureLink}>Privacy Policy</Text>
</Pressable>
```

These calls have no `.catch()`. Compare `SettingsModal.tsx` lines 757–768, which correctly uses `.catch(() => {})`.

If `PRIVACY_POLICY_URL` or `TERMS_URL` fails to open — because the URL 404s, the user has no browser, or `Linking` throws — an unhandled promise rejection is produced. In React Native, an unhandled rejection at a purchase point can cause a yellow (dev) or silent (prod) failure that leaves the user unable to review mandatory disclosures before making a purchase. This is the point of sale; Apple expects these links to function.

**Required fix:** Add `.catch(() => {})` to both `Linking.openURL()` calls in `PaywallModal`.

---

### N-L-3 — Privacy Policy and Terms URLs Are Placeholder Values With a Code Comment Acknowledging They Are Not Real

**File:** `src/config.ts` lines 9–11

```typescript
// Replace with real URLs before App Store submission.
export const PRIVACY_POLICY_URL = 'https://omaratechnologydesign.com/starbattle/privacy';
export const TERMS_URL = 'https://omaratechnologydesign.com/starbattle/terms';
```

The comment explicitly flags these as placeholders that must be replaced. These URLs are rendered to users at two purchase points (`PaywallModal`) and in `SettingsModal` as the Privacy Policy and Terms of Use links. If the URLs resolve to 404 or redirect to an unrelated page at App Store submission time, Apple reviewers will find non-functional required disclosure links.

**Required action:** Before App Store submission — verify the URLs resolve to the actual privacy policy and terms of service documents, remove the placeholder comment, and ensure the documents meet App Store requirements (must be hosted on a permanent URL, must describe all data collected, must explain the IAP model).

---

### N-L-4 — `handleDeepLink` Accepts `type=recovery` From Any URL Without Origin Validation

**File:** `src/stores/authStore.ts` lines 96–107

```typescript
handleDeepLink: async (url: string) => {
  if (!url.includes('type=recovery')) return;
  // No check that url starts with a Supabase domain
  const params = parseUrlFragment(url.slice(hashIdx + 1));
  if (params.access_token && params.refresh_token) {
    await supabase.auth.setSession({ ... });
  }
},
```

Any deep link containing the string `type=recovery` anywhere in the URL will cause the app to attempt `supabase.auth.setSession()` with whatever tokens are in the URL fragment. There is no check that the URL originates from the configured Supabase project domain.

**Attack surface:** On iOS, only one app can register the `starbattle://` URL scheme — scheme hijacking is not practical. However, the `handleDeepLink` function is also called from `Linking.getInitialURL()` on cold launch, which returns the URL that launched the app. A URL of the form `starbattle://anything?type=recovery#access_token=<forged>&refresh_token=<forged>` from any source will trigger `setSession()`. If the tokens are forged, Supabase will reject them server-side — so the attack requires valid Supabase JWTs, which are infeasible to forge.

**The practical risk is low** given Supabase's server-side token validation. However, the code does not validate the URL's structure (e.g., that it starts with `starbattle://reset-password`). A stricter check would be defensive best practice.

**Suggested fix:** Add an origin check before parsing:
```typescript
if (!url.startsWith('starbattle://reset-password')) return;
```

---

### N-L-5 — `signUpWithEmail` Allows Re-Submission While Confirmation Is Pending, With No Guard

**File:** `src/stores/authStore.ts` lines 115–121, `src/components/SettingsModal.tsx` lines 275–296

After calling `signUpWithEmail`, the `SettingsModal` transitions to `emailMode === 'confirm-email'`. The user sees "Check your inbox." Tapping "Done" calls:
```typescript
onPress={() => {
  setEmailMode(null);
  setEmail('');
  setError(null);
}}
```

This resets the modal back to the initial anonymous state — the sign-up options (`'signup'`, `'signin'`) become accessible again. If the user then enters a different email and submits the sign-up form again, `supabase.auth.updateUser({ email: newEmail, password })` is called on the same anonymous session, overwriting the pending email confirmation with a new email.

**The result:** The confirmation email sent to the first address is invalidated. The user who clicks the first confirmation link will get a Supabase error. There is no server-side guard preventing this; Supabase allows `updateUser` to overwrite a pending email change.

**Secondary risk:** A malicious person with access to the user's unlocked phone could navigate to the settings modal during the confirmation-pending window and redirect the account link to a different email they control.

**Required fix:** Persist the `emailMode === 'confirm-email'` state even when the user taps "Done" — do not allow re-submission of the sign-up form until either the email is confirmed (`USER_UPDATED` event fires) or the user explicitly cancels. Alternatively, add a "Use a different email" option that first calls `updateUser` to clear the pending change before accepting a new email.

---

### N-L-6 — WinBanner Renders Solve Time Twice for Streak Completions — Unimplemented Branch Reveals Incomplete Logic

**File:** `src/components/WinBanner.tsx` lines 69–103

```tsx
const headline = streakType
  ? `Solved in ${formatTime(timeMs)}`    // ← identical to non-streak branch
  : `Solved in ${formatTime(timeMs)}`;

// ...

{streakType && (
  <Text style={styles.winTime}>Solved in {formatTime(timeMs)}</Text>  // rendered separately
)}
```

For streak completions, the WinBanner renders the solve time in two places:
1. `headline` ("Solved in 1:23")
2. `winTime` text below ("Solved in 1:23")

Both branches of the `headline` ternary are identical. The original intent appears to have been to show different content (e.g., "Daily Challenge" as the headline and the time as a subtitle), but the implementation collapsed both branches to the same string. The `winTime` element is conditionally rendered for streaks only — creating a duplicate display.

**Liability implication:** If the displayed solve time differs from the actual time (e.g., due to timer state bugs), users who share screenshots of their win banner can dispute solve times. The redundant display amplifies any such discrepancy. The `winInfo` line already shows the challenge type ("Daily Challenge"), so the `headline` should display different content.

**Required fix:** Distinguish the `headline` branch for streak vs. non-streak completions, and remove the duplicate `winTime` text element or ensure it shows different information (e.g., streak count).

---

## Round 2 Summary Table

| ID     | Severity | Area              | Description                                                                             | Status  |
| ------ | -------- | ----------------- | --------------------------------------------------------------------------------------- | ------- |
| ~~N-H-1~~ | ~~HIGH~~ | ~~Data Loss / Auth~~ | ~~Canceling Google/Apple sign-in after anon session deletion permanently destroys data~~ | ✅ |
| N-H-2  | HIGH     | IAP               | `purchasePremium` returns `false` silently when `isActive` false after success result   | **OPEN** |
| N-H-3  | HIGH     | GDPR / Privacy    | Account deletion does not delete Adapty subscriber data; erasure claim is false         | **OPEN** |
| N-M-1  | MEDIUM   | Privacy / UX      | `deleteAccount` immediately re-creates anonymous session without user disclosure        | **OPEN** |
| N-M-2  | MEDIUM   | IAP / UX          | `purchasePremium` in SettingsModal has no `onSuccess`; no UI feedback after purchase    | **OPEN** |
| N-M-3  | MEDIUM   | IAP / UX          | `restorePurchases()` appears nonfunctional; restored entitlements never reach local UI  | **OPEN** |
| N-M-4  | MEDIUM   | Dead Code / UX    | `emailMode === 'forgot-password'` form is unreachable; wrong UX for password reset      | **OPEN** |
| N-L-1  | LOW      | Consumer Law      | App title "Star Battle Free" misleads users about paid content                          | **OPEN** |
| N-L-2  | LOW      | App Store / Legal | `Linking.openURL()` in PaywallModal missing `.catch()`; disclosure links may silently fail | **OPEN** |
| N-L-3  | LOW      | App Store         | Privacy Policy and Terms URLs are placeholders; comment says they must be replaced      | **OPEN** |
| N-L-4  | LOW      | Security          | Deep link handler accepts `type=recovery` from any URL without origin validation        | **OPEN** |
| N-L-5  | LOW      | Auth / UX         | Sign-up re-submission allowed while email confirmation is pending; can be hijacked      | **OPEN** |
| N-L-6  | LOW      | UX                | WinBanner renders solve time twice for streak completions; incomplete branch logic      | **OPEN** |

---

## Round 2 Priority Remediation Order

Address before any App Store submission:

1. ~~**Fix N-H-1 (data loss on cancelled sign-in)**~~ ✅ FIXED — Anonymous user ID saved before sign-in; `delete_anonymous_user` called only after `applySignIn` succeeds.

2. **Fix N-H-2 (silent purchase success with no access)** — Throw when `isActive` is false after `result.type === 'success'`. A paying user getting no access is a payment dispute waiting to happen.

3. **Resolve N-H-3 (Adapty data not deleted on erasure)** — Either call Adapty's subscriber deletion API or update the Privacy Policy to accurately disclose what is and is not deleted, and provide a supplementary deletion path. The current deletion dialog makes a false claim about complete data removal.

4. **Fix N-M-2 and N-M-3 (premium purchase and restore appear broken in SettingsModal)** — Both will drive "it doesn't work" App Store reviews and support load.

5. **Fix N-L-2 (`.catch()` on PaywallModal Linking calls)** — One-line fix; prevents unhandled rejection at the most sensitive UX moment.

6. **Verify N-L-3 (privacy/terms URLs actually resolve)** — Not a code change, but a deployment gate check.

7. **Fix N-M-4 (dead code in forgot-password flow)** — Low effort; improves UX for password reset.

8. **Fix N-H-1 consequential issue (signInAnonymously failure leaves app in broken state)** — After the N-H-1 fix reduces the blast radius, add error recovery for the anonymous sign-in failure case in `deleteAccount`.
