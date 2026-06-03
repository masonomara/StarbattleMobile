# Star Battle Free — TestFlight Launch Research

> Written 2026-06-02 against branch `ig-cleanup`. It is a fresh report made for the launch. There is an older `docs/research.md` already and I did not overwrite it. This file lives at the repo root.
>
> The scope is a deep reading of `src/` and the iOS native config and the packs pipeline and the Adapty/Supabase/PowerSync wiring and the marketing site at `~/Documents/starbattlefree-website`. It is laid out along your four goals for the launch. (1) Auth (2) Website (3) Splash timing (4) Payments and test packs.

---

## 0. Executive summary — where things actually stand

The client code is in good shape and it is mostly done for all four goals. The auth migration flow and the payment flow and the splash gating logic and the website all exist. The risk to the launch is almost all of it server-side and dashboard configuration that you cannot see in this repo. And there is one splash visual mismatch that breaks goal 3 as it is written.

The largest finding is this. There is no `supabase/` directory in this repo. All the Edge Functions and the SQL functions and the RLS policies and the storage bucket and the `packs` and `user_entitlements` data and the Adapty to Supabase webhook live only in the hosted Supabase and Adapty dashboards. The app calls `supabase.functions.invoke('migrate-anon-account')` and `supabase.rpc('delete_user')` at runtime. If those are not deployed then sign-in migration and account deletion fail in production. Verifying the backend is deployed and configured is the first blocker to the launch.

What each goal needs at a glance:

| Goal | Client code | Blocking work remaining |
|------|-------------|--------------------------|
| 1. Auth | Implemented incl. anon migration | Verify the Supabase backend edge fn `delete_user` providers redirect URLs SMTP. Test every flow end to end. |
| 2. Website | Routes exist and deployed | Slot real Terms and Privacy text it is placeholders now and set the App Store URL once it is live. |
| 3. Splash | Logic done but the art is mismatched | Native bootsplash white bg square icon does not match FauxSplash black bg `splashlogo.png`. Regenerate the native splash to match. |
| 4. Payments | Implemented | Make the IAP products in App Store Connect and Adapty and configure `main_paywall` and confirm the Adapty to Supabase entitlements webhook. Make 3 test packs. Test in sandbox. |

---

## 1. Architecture overview (how the app works)

The stack is React Native 0.84 and React 19.2.3. It is bare and not Expo. New Architecture. TypeScript. The bundle id is `com.omaratechnologydesign.starbattle` and the display name is Star Battle Free.

The key libraries and what they do:
- **Supabase** (`@supabase/supabase-js`) does auth which is anonymous and Apple and Google and email. It does Storage which is the `packs` bucket of puzzle JSON. It does Edge Functions and the Postgres that PowerSync mirrors.
- **PowerSync** (`@powersync/react-native` and `@powersync/op-sqlite`) is the offline-first sync engine. The local SQLite is `starbattle.db` by way of op-sqlite and it mirrors a subset of Postgres. The app reads and writes locally and PowerSync syncs it in the background.
- **Adapty** (`react-native-adapty`) does IAP and the paywall and entitlements.
- **MMKV** (`react-native-mmkv`) is a synchronous key-value store. It backs the Supabase auth token so that the sync reads spare the app the cold-start auth-token flash that AsyncStorage would cause. It backs the settings store.
- **Zustand** holds the app state. `authStore` `entitlementsStore` `settingsStore` `puzzleStore` `streaksStore`.
- **Skia** (`@shopify/react-native-skia`) renders the puzzle board and the thumbnails.
- **react-native-bootsplash** is the native launch splash.
- React Navigation native stack. Reanimated and Gesture Handler and Worklets for the puzzle interactions. Nitro Haptics.

The data model is the PowerSync tables in `src/powersync/AppSchema.ts`:
- `packs` is the catalog metadata. name grid_size stars difficulty is_free price_usd puzzle_count storage_path published sort_order type. It is read-only on the client and the `published = 1` rows are the live catalog.
- `puzzle_progress` is the solve state per user. The composite text PK is `id = "${userId}:${puzzleId}"`.
- `streaks` is the streak rows per user. The composite text PK is `id = "${userId}:${type}"` and the type is daily or weekly or monthly.
- `user_entitlements` is the premium flag and the owned pack ids. It is written server-side by the Adapty webhook and synced down. The client never writes it as the authority. `setIsPremium` and `addOwnedPack` mutate Zustand only and they do it optimistically.
- `streak_archive` is the global calendar of which puzzle was featured on which date.

The pack delivery pipeline is in `src/packs/` and it was lately split into 4 files:
- `packStorage.ts` is the RNFS disk I/O at `DocumentDirectory/packs/*.json` with the safe-key guards and the disk encoding.
- `packFetcher.ts` is the Supabase Storage download with the ETag-aware conditional fetch and the JSON validation.
- `packCache.ts` is the in-memory `Map` cache and the hints loading.
- `index.ts` is the public API. `getPuzzlesForPack` `getStreakPack` `downloadPack` `prefetchPackFile` `cachePackPreview` `loadPackHints`.
- `prefetch.ts` is `prefetchAllCatalog`. For each catalog entry it does a full download if the user `hasPackAccess` and otherwise it caches only a 1-puzzle preview. It runs at startup and on foreground and on entitlement changes.

The pack JSON shape is confirmed from `packs/6x6-normal.json`:
```json
{ "id": "6x6-normal", "name": "6×6 / 1★ Normal", "version": 2, "free": true,
  "gridSize": 6, "stars": 1,
  "puzzles": [ { "sbn": "6x1.FEEE…v1", "solution": [[0,0],[1,2],…] }, … ] }
```
The hints are stored and loaded apart by `loadPackHints` and `packs/split-hints.js`.

The startup sequence is in `App.tsx` and it is the spine of goals 1 and 3 and 4:
1. `adapty.activate(ADAPTY_SDK_KEY)`.
2. `authStore.initialize()` restores the session from MMKV or calls `signInAnonymously()`. Everything else waits on auth because the `packs` Storage bucket needs an authenticated JWT. Without a user token the downloads 404.
3. Warm the streak packs daily weekly monthly and the pack catalog by way of `db.watch`.
4. `BootSplash.hide({fade:true})` when the streak packs and the catalog are ready or after an 8s timeout whichever comes first.
5. PowerSync `db.connect()` and the watches on `packs` and `user_entitlements` and the entitlement reload on auth change and the foreground refresh and the deep-link listener.

The config is injected at build time by `babel-plugin-transform-inline-env-vars` and `babel.config.js` calls `dotenv`. All six env vars in `.env` are set now. `SUPABASE_URL` `SUPABASE_ANON_KEY` `POWERSYNC_URL` `ADAPTY_SDK_KEY` `GOOGLE_WEB_CLIENT_ID` `GOOGLE_IOS_CLIENT_ID`. `src/config.ts` throws at import if any of them is missing.

---

## 2. Goal 1 — Authentication

### 2.1 What is implemented and it is thorough

All the auth lives in `src/stores/authStore.ts`. The UI is `src/components/settings/AccountSection.tsx` and `ResetPasswordModal.tsx`. The anonymous to named migration that is described in `anon-account-migration-brief-v2.md` is fully implemented. The brief reads as a spec and the code matches it.

The model is anonymous first. On launch `initialize()` calls `supabase.auth.getSession()` and if there is no session it calls `signInAnonymously()`. `is_anonymous` is tracked in the store. The session is held in MMKV so the users stay signed in across app restarts. That is a goal 1 requirement met and it is pending verification on a real device.

There are three sign-in providers:
- **Apple** by `@invertase/react-native-apple-authentication` and it is native. It asks for the `EMAIL` scope only. FULL_NAME is left off on purpose for GDPR minimization and Apple sends the name only once anyhow. The `com.apple.developer.applesignin` entitlement is present in `ios/StarbattleMobile/StarbattleMobile.entitlements`. It exchanges the identity token by `supabase.auth.signInWithIdToken({provider:'apple'})`.
- **Google** by `@react-native-google-signin/google-signin` and it is set with `webClientId` and `iosClientId`. The iOS reversed-client URL scheme is registered in `Info.plist` and it is `com.googleusercontent.apps.312698113706-09ejigbp1khjkk1p1dmd5kafitptkfvu`. It exchanges the ID token by `signInWithIdToken({provider:'google'})`.
- **Email** sign-**up** uses `supabase.auth.updateUser({email, password})` and it upgrades the anonymous user in place keeping the same user id and it triggers an email confirmation. Sign-**in** uses `signInWithPassword`.

The anonymous progress migration is `withAnonMigration` and it wraps Apple and Google and email sign-**in**. It does not wrap email sign-up because that is done in place.
1. Capture the anon id and a fresh anon access token.
2. `drainUploadQueue()` polls `db.getUploadQueueStats()` until it is empty with a 600ms settle delay and a 30s ceiling and it fails fast if the device is offline or on an upload error. This is so all the anon writes reach Supabase before the server-side merge reads them.
3. The provider credential exchange.
4. `applySignIn` sets `isAnonymous:false` and `adapty.identify(namedId)`.
5. If `namedId !== anonId` then `supabase.functions.invoke('migrate-anon-account', {anonId, anonToken})`.
6. `reconnectPowerSync` does `disconnectAndClear()` then `connect()` then `waitForFirstSync()` then `loadEntitlements(namedId)`. It rebuilds the local SQLite for the named user so the merged rows show and no anon rows linger.

The email confirmation handling is careful. `onAuthStateChange` does not derive `isAnonymous` on `USER_UPDATED` because Supabase can report `is_anonymous:false` during the window when the confirmation is still pending. It flips only on `SIGNED_IN` which fires when the confirmation link runs `setSession`. The UI shows a Check your inbox state after sign-up.

The password reset is `requestPasswordReset` and it calls `resetPasswordForEmail(email, { redirectTo: 'starbattle://reset-password' })`. The `starbattle://` scheme is registered in `Info.plist`. `handleDeepLink` parses the URL fragment for `access_token` and `refresh_token` and calls `setSession`. The `PASSWORD_RECOVERY` event sets `isPasswordRecovery` which presents `ResetPasswordModal`. `setNewPassword` calls `updateUser({password})`. The deep links are handled cold by `Linking.getInitialURL` and warm by `Linking.addEventListener` in `App.tsx`.

Sign out and delete. `signOut` does `supabase.auth.signOut()` and `adapty.logout()` and `resetToAnonymous()` which drops back to a fresh anon user. `deleteAccount` does `supabase.rpc('delete_user')` and `adapty.logout()` and `resetToAnonymous()`. The delete confirmation alert is right and it is App Store compliant and it explains that the receipts stay with Apple. The `delete_user()` SQL function is documented inline in `authStore.ts` and it leans on `ON DELETE CASCADE` from `auth.users`.

### 2.2 Auth blockers and things to verify before TestFlight

These are not in the repo and you must confirm them in the Supabase dashboard:

1. The `migrate-anon-account` Edge Function is deployed. The brief calls the SQL `migrate_anonymous_progress` and the client invokes the function `migrate-anon-account`. Confirm the function exists and is named exactly that and verifies the anon token and calls the merge RPC with `service_role`. Without it every Apple and Google and email sign-in from an anon session throws. The error is not swallowed on purpose so the user sees the failure.
2. The `delete_user()` SQL function is deployed with `SECURITY DEFINER` and `GRANT EXECUTE … TO authenticated` and the four user tables have `ON DELETE CASCADE` FKs to `auth.users`. Else Delete Account fails.
3. The `migrate_anonymous_progress` SQL function and the composite-id recompute. The merge must recompute `id = namedId || ':' || key` or else the next client write makes duplicate rows. See the brief at the critical composite-id detail.
4. The Supabase Auth providers are configured. Apple with the Services ID and the key and the return URL to the Supabase callback. Google with both client IDs registered. And anonymous sign-ins enabled.
5. The redirect allow-list. `starbattle://reset-password` and the signup and email-change deep links must be in Supabase Auth at URL Configuration at Redirect URLs or the email links will not deep-link back.
6. Custom SMTP. The built-in Supabase email sender is rate-limited hard at a few an hour and it is not for production. Set a real SMTP provider before you hand the builds out or the email confirmation and the password reset will fail without a sound under any real volume.
7. The email templates for confirm-signup and email-change and recovery must embed the token in a way `handleDeepLink` parses. It reads `access_token` and `refresh_token` from the URL fragment and it checks for `type=recovery|signup|email_change`.

### 2.3 Auth manual test matrix (do all of these on a physical device)

- Fresh anon then make progress then sign up with email then confirm by the emailed link then reopen the app. Still signed in and the progress intact.
- Anon with progress then Sign in with Google. The progress merges. Kill it and relaunch. Still Google and the data there and no duplicate rows after solving another puzzle.
- The same for Sign in with Apple.
- Email sign-in to an existing account that already has progress. A keep-best merge and no PK violation.
- Forgot password then the email arrives then tap the link cold and warm then the reset modal then set the new password then sign in with it.
- Sign out back to anon then sign in again.
- Delete account then confirm it is gone server-side and the app returns to a fresh anon.
- Offline sign-in attempt. Blocked with a clear message that you appear to be offline by the drain-queue guard and no silent data loss.

---

## 3. Goal 2 — Website (starbattlefree.com)

The location is `~/Documents/starbattlefree-website` and it is a separate git repo. Next.js App Router and Tailwind v4. It is statically exported by `output: 'export'` to `./out` and deployed on Vercel at `starbattlefree.com`.

The routes that exist and are built in `out/`:
- `/` the homepage and linktree. The icon and the store badges and the footer links.
- `/privacy-policy`
- `/terms-and-conditions`
- `/credits`

The app links to these exact URLs in `src/config.ts`:
- `PRIVACY_POLICY_URL = https://starbattlefree.com/privacy-policy`
- `TERMS_URL = https://starbattlefree.com/terms-and-conditions`
- `CREDITS_URL = https://starbattlefree.com/credits`

These show in the paywall and per the original SettingsModal in the legal section. The routes match the config and that is good.

The work that remains for goal 2:
1. Real legal text. The website README says plainly that Privacy and Terms are placeholders. You have the real content already in the app repo at `docs/privacy-policy.md` and `docs/terms-of-use.md`. Slot those into the website at `app/privacy-policy/page` and `app/terms-and-conditions/page`. App Store review will check that these URLs resolve to real policies.
2. The App Store URL. `APP_STORE_URL` in `app/page.tsx` is a placeholder. Set it once the App Store listing exists and it can be done after the first submission.
3. The real app icon on the site. It is `icon.svg` placeholder now. Cosmetic and not a blocker.
4. Auth on the website is not needed. The app handles password reset by the native `starbattle://` deep link so you do not need a web reset page. If you want web-based reset later as a fallback that is a separate add.

---

## 4. Goal 3 — Splash screen timing and appearance

### 4.1 How the two-phase splash works

There are two splashes and they hand off to each other.

Phase A is the native bootsplash from `react-native-bootsplash`. iOS shows it at process launch. It is hidden in `App.tsx` by `BootSplash.hide({fade:true})` when `streakReady` which is the daily and weekly and monthly packs loaded and `packCatalogReady` which is the `packs` table having data both resolve or after an 8s safety timeout.

Phase B is `FauxSplash` in `src/components/FauxSplash.tsx`. It is an absolute overlay drawn inside HomeScreen so the React Navigation focus stays valid. It starts `visible=true` from the first render and it hides when all of these are ready in `HomeScreen.tsx`. `packCatalog.length > 0 && !isPackPreviewsLoading && !isStreaksLoading && !isProgressLoading` or after a 10s safety timeout. It fades out over 150ms.

The design intent is a seamless baton-pass. Native splash then faux splash then the real HomeScreen so the user never sees a half-loaded screen. The gating logic is sound. It waits on the real data signals `usePackPreviews` and `useStreakRows` and `useCompletionData` with generous timeouts as a floor.

### 4.2 The problem. The two splashes do not look the same

Goal 3 says the native and the faux splash should look identical and use `splashlogo.png`. They do not now:

| | Native bootsplash (Phase A) | FauxSplash (Phase B) |
|---|---|---|
| Background | WHITE `BootSplashBackground` colorset = sRGB 1,1,1 | BLACK `#000000` |
| Logo art | 1024×1024 square grid/star icon `assets/bootsplash/logo*.png` from `bootsplash-logo-{light,dark}.svg` | `splashlogo.png` a 4138×1948 wide image at 85% screen width |
| Source | generated by `react-native-bootsplash` | `require('../../splashlogo.png')` |

So at the moment `BootSplash.hide()` fires the user sees a white screen with a square icon snap to a black screen with a wide logo. A visible flash and jump. It is the very thing the faux splash exists to prevent.

### 4.3 The fix for goal 3

Make the native bootsplash match the faux splash. Black background and `splashlogo.png`. Regenerate the native assets with the bootsplash CLI like so:

```bash
npx react-native-bootsplash generate splashlogo.png \
  --platforms=ios,android \
  --background=000000 \
  --logo-width=<match the faux 85%-width sizing>
```

Then re-run the pods. Verify:
- The native bg color `Colors.xcassets/BootSplashBackground-*.colorset` becomes black.
- `BootSplash.storyboard` and the Android equivalent reference the new logo.
- The native logo and the FauxSplash `splashlogo.png` render at the same size and the same position so the handoff is invisible.

There is another way that is less in line with your stated goal. Keep the native square-icon splash and restyle `FauxSplash` to match it with the white bg and the same icon. But you asked for `splashlogo.png` so regenerating the native is the right call.

A minor note on timing. The two safety timeouts of 8s native and 10s faux are independent and they are fine. If the 8s native timeout fires early the faux overlay which is up since the first render covers the gap. No change needed there.

---

## 5. Goal 4 — Payments (Adapty) and test packs

### 5.1 How payments work in the app

All the payment logic is `src/utils/payments.ts`. The UI is `src/components/settings/SubscriptionSection.tsx` and `PaywallModal.tsx`.

- Activation. `adapty.activate(ADAPTY_SDK_KEY)` in `App.tsx`. `adapty.identify(userId)` on a named sign-in. `adapty.logout()` on sign-out and delete.
- Paywall fetch. `adapty.getPaywall('main_paywall')` then `adapty.getPaywallProducts(paywall)`. The products are cached for the life of the process so a price change needs an app restart and that is noted as acceptable.
- Product IDs which are the vendor product ids:
  - Premium is `sb_premium_599` and it is exported as `PREMIUM_PRODUCT_ID`.
  - Individual packs are `starbattle_pack_${packId}`.
- Access level is `premium` and it is checked by `result.profile.accessLevels.premium.isActive`.
- Purchase premium. `makePurchase` then verify `premium.isActive` then the optimistic `setIsPremium(true)` then prefetch the packs now unlocked.
- Purchase pack. `makePurchase` then `downloadPack` then `addOwnedPack`.
- Restore. `adapty.restorePurchases()` then the premium check. The pack entitlements re-sync on their own by PowerSync once Adapty's webhook fires.
- The entitlement source of truth is the `user_entitlements` table. It is written server-side by an Adapty webhook and synced down by PowerSync. The Zustand `setIsPremium` and `addOwnedPack` are optimistic and they are reconciled on the next sync.
- The paywall UX has three contexts. `sequential` where free users are gated to play the puzzles in order and it offers premium. `paid-pack` where you buy this pack or buy premium and anon users are prompted to make an account first. `unavailable`.

### 5.2 Payment blockers and things to verify

1. The App Store Connect IAP products must exist and be in a submittable state:
   - Decide the type of premium. `sb_premium_599` at $5.99. Is it a non-consumable one-time unlock or an auto-renewing subscription. The code only checks `accessLevels.premium.isActive` so either one works but the App Store Connect setup and the Adapty config and the paywall copy Buy Premium all differ. The label Buy Premium and All Packs reads like a one-time non-consumable which is simpler for review. Confirm it and make it so.
   - One product per paid pack. `starbattle_pack_<id>` and it is non-consumable.
2. The Adapty dashboard:
   - Map each App Store product to an Adapty product.
   - Configure the `premium` access level to be granted by `sb_premium_599` and ideally each pack grants its own pack-scoped access. But the app keys pack ownership off `user_entitlements.owned_pack_ids` so see number 3.
   - Build the `main_paywall` paywall with a placement and include all the products the app references.
   - Wire the App Store Server API key. `docs/SubscriptionKey_5M2LWM6WJA.p8` is an App Store Connect API `.p8` key and it is almost surely for Adapty's server-side receipt validation and Server Notifications. Confirm it is uploaded to Adapty with the right Key ID and Issuer ID. Treat this file as a secret. It is committed under `docs/` now and you should think about removing it from version control.
3. The Adapty to Supabase entitlements webhook. The whole pack-ownership model leans on Adapty writing `user_entitlements` and the `owned_pack_ids` above all server-side. This integration is not in the repo. There is no `supabase/` dir. Confirm the Adapty webhook or integration exists and targets a Supabase Edge Function and that the function upserts `user_entitlements` keyed by the Adapty `customerUserId` which is the Supabase user id set by `adapty.identify`. Without it `purchasePack` will flip the local Zustand flag but the entitlement will not persist across a reinstall or a restore.
4. A sandbox end-to-end test with a Sandbox Apple ID. Buy premium and all the packs unlock and reinstall and Restore and the premium returns. Buy a single pack and it downloads and unlocks and reinstall and Restore or sync and the pack still owned.
5. A minor code note that is not a blocker. `App.tsx` calls `prefetchAllCatalog(catalog, entitlements)` with two args but the signature in `prefetch.ts` is `prefetchAllCatalog(catalog)` and it reads the entitlements from the store inside itself. The second arg is ignored without harm. It is worth a tidy for consistency.

### 5.3 Test packs. Suggestions and how to set them up

The context is this. The repo bundles 9 local pack JSONs in `packs/*.json` which are 5×5 6×6 8×8 10×10 14×14 in normal and hard. But the production packs are delivered from Supabase Storage and listed by the `packs` catalog table. So a test pack you can buy is (a) generate the JSON (b) upload it to the `packs` bucket (c) insert a catalog row (d) make the matching IAP product in App Store Connect and Adapty.

The suggested 3 test packs are chosen to exercise the full paywall. A cheap tier and a mid tier and a premium-versus-pack decision while keeping variety in size and difficulty:

| # | Suggested name | Grid / stars / difficulty | Count | Price | Why this one |
|---|----------------|---------------------------|-------|-------|--------------|
| 1 | 8×8 Expert | 8×8 / 2★ / hard | 30 | $1.99 | The cheapest tier. It tests the low price point and the single-pack buy button. |
| 2 | 10×10 Challenge | 10×10 / 2★ / hard | 30 | $2.99 | The mid tier. It tests the `starbattle_pack_*` flow at a different price and a bigger grid. |
| 3 | 14×14 Marathon | 14×14 / 3★ / hard | 20 | $3.99 | The premium-anchor. It makes Buy Premium · All Packs look like the better deal and it exercises the dual-button paywall in the `paid-pack` context. |

Keep at least the existing free small packs the 5×5 and 6×6 normal at `is_free=1` so the free sequential-unlock experience and the `sequential` paywall context can be tested too.

The step-by-step setup for each test pack:

1. Generate it with your generator and produce the exact JSON shape the app expects:
   ```json
   { "id": "8x8-expert", "name": "8×8 Expert", "version": 1, "free": false,
     "gridSize": 8, "stars": 2,
     "puzzles": [ { "sbn": "...", "solution": [[r,c], ...] }, ... ] }
   ```
   Generate the hints file the same way the bundled packs have hints by `loadPackHints` and `split-hints.js` because the accessible packs prefetch hints.
2. Upload the pack JSON and the hints to the Supabase `packs` Storage bucket. Note the object key. That becomes `storage_path`.
3. Insert a catalog row in the `packs` table:
   ```sql
   insert into packs
     (id, name, grid_size, stars, difficulty, is_free, price_usd,
      puzzle_count, storage_path, published, sort_order, type)
   values
     ('8x8-expert', '8×8 Expert', 8, 2, 'hard', 0, 1.99,
      30, '8x8-expert.json', 1, 100, null);
   ```
   The `type` stays `null` for library packs. `daily` and `weekly` and `monthly` are kept for streak packs. `published=1` makes it show. `price_usd` is display-only and the real price comes from Adapty and the App Store.
4. Make the IAP in App Store Connect with the product id `starbattle_pack_8x8-expert` which must equal `starbattle_pack_${id}`. The type is non-consumable and the price tier is $1.99.
5. In Adapty add the product and attach it to the `main_paywall` paywall and make sure the webhook grants the pack entitlement into `user_entitlements.owned_pack_ids` on purchase.
6. Test it in sandbox. The pack shows in the catalog then tap it then the `paid-pack` paywall then buy then it downloads then it is playable then it is owned after a reinstall and restore.

> A tip. The app derives the buyable product purely from `starbattle_pack_${packId}` so the catalog `id` and the App Store product suffix must match exactly. Keep the ids lowercase and hyphenated and stable.

---

## 6. Consolidated launch checklist (prioritized)

P0 — backend verification. Do it first. Nothing works without these:
- [ ] Confirm the Edge Function `migrate-anon-account` is deployed and verifies the anon token.
- [ ] Confirm the SQL `migrate_anonymous_progress` with the composite-id recompute and `delete_user()` exist and the FKs cascade.
- [ ] Confirm Supabase Auth. Apple and Google providers and anonymous sign-ins enabled and `starbattle://reset-password` in the redirect allow-list and custom SMTP and the email templates.
- [ ] Confirm the `packs` Storage bucket policy needs the authenticated role to match the App.tsx comment and that it holds the catalog files.
- [ ] Confirm the Adapty to Supabase entitlements webhook writes `user_entitlements`.

P0 — splash (goal 3):
- [ ] Regenerate the native bootsplash from `splashlogo.png` with a `#000000` background so it matches `FauxSplash`. Verify there is no flash at the handoff on a device.

P0 — payments (goal 4):
- [ ] Make the `sb_premium_599` IAP and decide non-consumable versus subscription and each `starbattle_pack_*`.
- [ ] Build `main_paywall` in Adapty. Upload and verify the App Store API key the `.p8`.
- [ ] Make the 3 test packs end to end. Generate then upload then catalog row then IAP then Adapty.
- [ ] Sandbox. Buy premium. Buy pack. Restore. Reinstall.

P0 — website (goal 2):
- [ ] Replace the placeholder Privacy and Terms with the real text. The source is `docs/privacy-policy.md` and `docs/terms-of-use.md`.

P1 — verification and polish:
- [ ] Run the full auth test matrix at §2.3 on a physical device.
- [ ] Run the manual test plan already written in `TESTFLIGHT_LAUNCH.md`. The 10 tests.
- [ ] Remove `docs/SubscriptionKey_*.p8` from version control. It is a secret.
- [ ] Tidy the `prefetchAllCatalog` 2-arg call site in `App.tsx`.
- [ ] App Store Connect. The privacy nutrition labels and Sign in with Apple present which is required since you offer Google and the screenshots and the age rating and the encryption declaration.

Already done and no action. The `TESTFLIGHT_LAUNCH.md` code-quality fixes per the git log. `__DEV__` log gating. `StreaksModal` to `useStreakRows`. `checkWin` and `PuzzleCell` perf. The shared header height. The dead-code removal. The anon-migration implementation. The packs and settings refactors.

---

## 7. Pointers and related docs in this repo

- `anon-account-migration-brief-v2.md` is the authoritative spec for the migration that is now implemented. Use it to write the SQL and the Edge Function if the backend turns out not to be deployed.
- `TESTFLIGHT_LAUNCH.md` is the code-review findings and a 10-step manual test plan.
- `docs/research.md` and `docs/plan.md` and `docs/goal.md` are the older and broader design docs.
- `docs/privacy-policy.md` and `docs/terms-of-use.md` are the real legal text for the site.
- `docs/testing.md` and `docs/review.md` are more testing and review notes.
