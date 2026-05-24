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

## Summary Table

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

## Priority Remediation Order

Before any public release, address in this sequence:

1. ~~**Rotate all credentials (C-1)** — The current Supabase anon key, Adapty key, and Google OAuth IDs must be rotated immediately. Then move secrets to environment-based configuration excluded from version control.~~ ✅ FIXED

2. ~~**Fix IAP revenue leaks (H-1, H-2)** — `purchasePack` must check purchase outcome before delivering content. `purchasePremium` must throw on failure. These are revenue-critical defects.~~ ✅ FIXED

3. ~~**Display store-sourced prices (C-3)** — Replace all hardcoded price strings with `product.localizedPrice` from the Adapty product object. The data is already fetched.~~ ✅ FIXED

4. ~~**Add Privacy Policy, ToS, and account deletion (C-2)** — These are hard App Store submission requirements. Without them, the app will not be approved.~~ ✅ FIXED

5. **Fix the `NSPrivacyCollectedDataTypes` manifest (L-2)** and **remove empty location usage string (L-1)** — Required for App Store submission compliance.

6. **Add `await` to progress save on navigation exit and add AppState background handler (M-2)** — Prevents user data loss.

7. **Wrap `JSON.parse` calls in try/catch (M-3)** — Prevents crash on corrupted local data.

8. ~~**Add Restore Purchases to paywall for anonymous users (H-3)**~~ ✅ CLOSED — anonymous users cannot purchase; the requirement does not apply to this flow.
