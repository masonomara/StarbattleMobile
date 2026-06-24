## Architecture overview

The stack is React Native 0.84 and React 19.2.3. It is bare and not Expo. New Architecture. TypeScript. The bundle id is `com.omaratechnologydesign.starbattle` and the display name is Star Battle.

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
