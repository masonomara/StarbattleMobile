import React, { useEffect } from 'react';
import { AppState, InteractionManager, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { useTheme } from './src/shared/theme/useTheme';
import { useAuthStore } from './src/shared/stores/authStore';
import { useSettingsStore } from './src/shared/stores/settingsStore';
import { useEntitlementsStore } from './src/shared/stores/entitlementsStore';
import { startupTimer } from './src/shared/lib/startupTimer';
import { startStallWatch, mark, time } from './src/shared/lib/perfLog';
import { flush as flushTelemetry } from './src/shared/lib/telemetry';
import { db } from './src/powersync/AppSchema';
import { PowerSyncContext } from '@powersync/react-native';
import { SupabaseConnector } from './src/powersync/Connector';
import { adapty } from 'react-native-adapty';
import { ADAPTY_SDK_KEY } from './src/shared/lib/config';
import { getStreakPack } from './src/packs';
import { prefetchAllCatalog, prefetchStreakHints } from './src/packs/prefetch';
import { supabase } from './src/shared/lib/supabase';
import type { PackCatalogItem } from './src/types';

// Dedupes prefetch requests. Several independent signals ask for a catalog
// refresh: the packs and entitlements watches (which RE-EMIT repeatedly while the
// first sync settles, with identical rows), plus purchase and foreground events.
// Each would otherwise kick a full prefetchAllCatalog (42 ETag round-trips +
// downloads). Measured on a warm launch: it fired twice (+215ms and +1374ms),
// the second from a watch re-emitting unchanged rows — pure waste.
//
// A signature over (catalog ids/paths + entitlements) collapses unchanged
// re-emits, while `force` lets the foreground refresh re-run anyway to pick up
// server-side content updates (a new ETag on the same pack set). The in-flight
// guard ensures only one cycle runs at a time; a genuinely-new request that
// arrives mid-cycle queues exactly one follow-up.
let prefetchInFlight = false;
let prefetchRerunRequested = false;
let prefetchRerunForce = false;
let lastPrefetchSignature = '';

// Resolves once auth has initialized (the signInAnonymously() fallback included).
// Storage downloads need a user JWT — the packs bucket requires the authenticated
// role, so any prefetch that fires before this 404s every ETag and download. The
// packs watch can emit pre-auth (it fires with 0 rows before the first sync), so
// runTieredPrefetch gates on this before fanning out. Held at module scope (set in
// the setup effect) so the module-level prefetch can await it.
let authReadyPromise: Promise<void> | null = null;

function prefetchSignature(catalog: PackCatalogItem[]): string {
  const { entitlements } = useEntitlementsStore.getState();
  const packs = catalog.map(p => `${p.id}:${p.storagePath ?? ''}`).join(',');
  return `${entitlements.isPremium ? 1 : 0}|${[...entitlements.ownedPackIds]
    .sort()
    .join(',')}|${packs}`;
}

function runTieredPrefetch(
  catalog: PackCatalogItem[],
  { force = false }: { force?: boolean } = {},
): void {
  const signature = prefetchSignature(catalog);
  if (prefetchInFlight) {
    // Queue one follow-up only if this request is forced or the inputs actually
    // changed; drop unchanged watch re-emits.
    if (force || signature !== lastPrefetchSignature) {
      prefetchRerunRequested = true;
      prefetchRerunForce = prefetchRerunForce || force;
    }
    return;
  }
  // Nothing changed since the last cycle and not a forced refresh — skip.
  if (!force && signature === lastPrefetchSignature) return;
  prefetchInFlight = true;
  lastPrefetchSignature = signature;
  // Defer the catalog prefetch until interactions/animations settle so it never
  // competes with first paint or the tutorial. The disk writes inside are also
  // concurrency-capped (see writeFileThrottled); together these keep first-launch
  // caching from pinning the JS thread.
  // Mark the lag between scheduling and firing: runAfterInteractions only runs
  // once every interaction handle clears, so a leaked/long animation handle can
  // delay the whole catalog prefetch (and anything chained behind it).
  mark('STARTUP', 'runTieredPrefetch scheduled (awaiting interactions)');
  InteractionManager.runAfterInteractions(async () => {
    mark('STARTUP', 'runAfterInteractions fired — awaiting auth before prefetch');
    // Wait for auth before any download: storage needs a JWT (see authReadyPromise).
    // Without this the pre-sync packs-watch fire wastes a full cycle on 404s; with
    // it, first-launch streak hints land on disk right after anonymous sign-in
    // (~1s) instead of after the first PowerSync sync (~6s). Swallow a rejection so
    // a failed auth init can't strand the in-flight guard below.
    await authReadyPromise?.catch(() => {});
    mark('STARTUP', 'auth ready — prefetch starting');
    // Streak hints prefetch alongside (not behind) the catalog: both stream
    // natively to disk off the JS thread, and the daily puzzle is the most-opened
    // file in the app, so it shouldn't queue behind the entire catalog. Folded
    // into this cycle so it inherits the in-flight dedup, the foreground
    // force-refresh (picks up new daily content via ETag), and — most importantly
    // — the InteractionManager gate that keeps it off the first-paint path.
    Promise.all([
      prefetchAllCatalog(catalog).catch(() => {}),
      prefetchStreakHints().catch(() => {}),
    ])
      .catch(() => {})
      .finally(() => {
        prefetchInFlight = false;
        if (prefetchRerunRequested) {
          prefetchRerunRequested = false;
          const force2 = prefetchRerunForce;
          prefetchRerunForce = false;
          // Re-read the freshest catalog from the store rather than reusing the
          // possibly-stale list captured by the coalesced earlier call.
          runTieredPrefetch(useEntitlementsStore.getState().packCatalog, {
            force: force2,
          });
        }
      });
  });
}

export default function App() {
  useEffect(() => {
    startupTimer.log('App mounted — first render complete');
    // Watchdog runs for the whole session: any [SB:STALL] line timestamps a
    // JS-thread freeze that can be lined up against the operation logs to find
    // what blocked gameplay (e.g. a multi-MB hints JSON.parse on puzzle open).
    startStallWatch();
  }, []);

  const theme = useTheme();

  useEffect(() => {
    startupTimer.log('setup effect start');

    // Note: the native bootsplash is hidden in navigation.tsx's onReady, once the
    // first screen has actually painted — hiding here (on App mount) faded the
    // splash into an unpainted frame and caused a white flash on the handoff.

    adapty.activate(ADAPTY_SDK_KEY).catch(() => {
      // Swallow "already activated" error on Fast Refresh in dev
    });
    startupTimer.log('adapty.activate called');

    // Auth must resolve (including the signInAnonymously() fallback) before any
    // Supabase Storage download fires. The packs bucket policy requires the
    // authenticated role; without a user JWT every download returns 404.
    startupTimer.log('auth initialize called');
    const authReady = useAuthStore.getState().initialize();
    // Publish to module scope so runTieredPrefetch can gate downloads on a JWT.
    authReadyPromise = authReady;

    // Warm streak pack data so HomeScreen's previews are cached when it mounts.
    // Hints are intentionally NOT warmed here — they're only needed when a puzzle
    // opens, and PuzzleScreen loads them itself (sharing this cache), so warming
    // them at launch is pure startup cost for data the home screen never uses.
    authReady
      .then(() => {
        mark('STARTUP', 'authReady resolved — warming streak packs');
        const endWarm = time('STARTUP', 'warm streak packs (3x getStreakPack)');
        return Promise.all([
          getStreakPack('daily'),
          getStreakPack('weekly'),
          getStreakPack('monthly'),
        ]).then(r => {
          endWarm();
          return r;
        });
      })
      .then(() => startupTimer.log('streak packs resolved'))
      .catch(() => {});

    useSettingsStore.getState().initialize();
    startupTimer.log('settings store initialized');

    // Open local SQLite immediately — fetchCredentials() retries once auth resolves
    db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 }).catch(
      err => console.warn('[PowerSync] connect failed:', err?.message ?? err),
    );
    startupTimer.log('powersync db.connect called');

    // Surface sync failures at runtime. Without this a misconfigured sync rule
    // (a pack row that never replicates) or a storage/RLS denial fails silently:
    // the catalog watch below just never fires and packs never appear. The
    // downloadError carries the real reason. statusChanged fires often, so only
    // log on a changed error string or a connection / first-sync transition.
    let lastDownloadError = '';
    let lastUploadError = '';
    let wasConnected = false;
    let hadSynced = false;
    const removeSyncListener = db.registerListener({
      statusChanged: status => {
        const dl = status.dataFlowStatus.downloadError?.message ?? '';
        if (dl !== lastDownloadError) {
          lastDownloadError = dl;
          if (dl) console.warn('[PowerSync] download error:', dl);
        }
        const ul = status.dataFlowStatus.uploadError?.message ?? '';
        if (ul !== lastUploadError) {
          lastUploadError = ul;
          if (ul) console.warn('[PowerSync] upload error:', ul);
        }
        if (status.connected !== wasConnected) {
          wasConnected = status.connected;
          startupTimer.log(
            `powersync ${status.connected ? 'connected' : 'disconnected'}`,
          );
        }
        if (status.hasSynced && !hadSynced) {
          hadSynced = true;
          startupTimer.log('powersync first sync complete');
        }
      },
    });

    const watchController = new AbortController();

    db.watch(
      'SELECT id FROM packs WHERE published = 1 LIMIT 1',
      [],
      {
        onResult: async () => {
          const endCat = time('STARTUP', 'packs watch onResult — loadPackCatalog');
          await useEntitlementsStore.getState().loadPackCatalog();
          const { packCatalog } = useEntitlementsStore.getState();
          endCat(`${packCatalog.length} packs`);
          runTieredPrefetch(packCatalog);
        },
      },
      { signal: watchController.signal },
    );

    db.watch(
      'SELECT * FROM user_entitlements LIMIT 1',
      [],
      {
        onResult: () => {
          const userId = useAuthStore.getState().user?.id;
          if (userId) useEntitlementsStore.getState().loadEntitlements(userId);
        },
      },
      { signal: watchController.signal },
    );

    // Guard against the watch firing before initialize() resolves, and cover
    // the anonymous → named-user sign-in transition the watch can't guarantee.
    const authUnsub = useAuthStore.subscribe((state, prevState) => {
      const userId = state.user?.id;
      if (userId && userId !== prevState.user?.id) {
        useEntitlementsStore.getState().loadEntitlements(userId);
      }
    });

    // When entitlements change (purchase), trigger tiered downloads for
    // newly accessible packs without waiting for a foreground event.
    const entitlementsUnsub = useEntitlementsStore.subscribe(
      (state, prevState) => {
        const { packCatalog } = state;
        if (packCatalog.length === 0) return;
        const becamePremium =
          !prevState.entitlements.isPremium && state.entitlements.isPremium;
        const newOwnedPacks = state.entitlements.ownedPackIds.filter(
          id => !prevState.entitlements.ownedPackIds.includes(id),
        );
        if (becamePremium || newOwnedPacks.length > 0) {
          runTieredPrefetch(packCatalog);
        }
      },
    );

    // When the app returns to the foreground, refresh the session so that a
    // confirmed email is picked up immediately (onAuthStateChange fires if
    // the user's is_anonymous flag changed while the app was in background).
    const appStateSub = AppState.addEventListener('change', async nextState => {
      if (nextState === 'active') {
        await supabase.auth.refreshSession();
        const { packCatalog } = useEntitlementsStore.getState();
        // force: re-check ETags on every foreground even when the catalog and
        // entitlements are unchanged, so a server-side content update is picked up.
        runTieredPrefetch(packCatalog, { force: true });
      } else if (nextState === 'background' || nextState === 'inactive') {
        // Send any buffered telemetry before the OS suspends the JS thread.
        flushTelemetry();
      }
    });

    // Handle deep links that arrive while the app is already running
    // (e.g. tapping a password-reset email when the app is in the background).
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      useAuthStore.getState().handleDeepLink(url);
    });

    return () => {
      authUnsub();
      entitlementsUnsub();
      removeSyncListener();
      watchController.abort();
      appStateSub.remove();
      linkingSub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        backgroundColor: theme.background,
      }}
    >
      <PowerSyncContext.Provider value={db}>
        <SafeAreaProvider>
          <Navigation />
        </SafeAreaProvider>
      </PowerSyncContext.Provider>
    </GestureHandlerRootView>
  );
}
