import React, { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { useTheme } from './src/hooks/useTheme';
import { useAuthStore } from './src/stores/authStore';
import { useSettingsStore } from './src/stores/settingsStore';
import { useEntitlementsStore } from './src/stores/entitlementsStore';
import { startupTimer } from './src/utils/startupTimer';
import { db } from './src/powersync/AppSchema';
import { SupabaseConnector } from './src/powersync/Connector';
import { adapty } from 'react-native-adapty';
import { ADAPTY_SDK_KEY } from './src/config';
import { getStreakPack } from './src/packs';
import { prefetchAllCatalog } from './src/packs/prefetch';
import { supabase } from './src/supabase';
import BootSplash from 'react-native-bootsplash';
import type { PackCatalogItem, Entitlements } from './src/types';

function runTieredPrefetch(
  catalog: PackCatalogItem[],
  entitlements: Entitlements,
): void {
  prefetchAllCatalog(catalog, entitlements).catch(() => {});
}

export default function App() {
  useEffect(() => {
    startupTimer.log('App mounted — first render complete');
  }, []);

  const theme = useTheme();

  useEffect(() => {
    startupTimer.log('setup effect start');

    adapty.activate(ADAPTY_SDK_KEY).catch(() => {
      // Swallow "already activated" error on Fast Refresh in dev
    });
    startupTimer.log('adapty.activate called');

    // Auth must resolve (including the signInAnonymously() fallback) before any
    // Supabase Storage download fires. The packs bucket policy requires the
    // authenticated role; without a user JWT every download returns 404.
    startupTimer.log('auth initialize called');
    const authReady = useAuthStore.getState().initialize();

    // Warm streak + pack caches before HomeScreen mounts.
    // Gate the splash on streak packs so HomeScreen renders fully populated on reveal.
    const streakReady = authReady.then(() =>
      Promise.all([
        getStreakPack('daily'),
        getStreakPack('weekly'),
        getStreakPack('monthly'),
      ]),
    );
    streakReady.then(() => startupTimer.log('streak packs resolved'));

    // packCatalogReady resolves when the packs table has data we can trust:
    //   - Warm start: db.watch fires immediately with local data → non-empty → resolve.
    //   - Cold start: db.watch fires first with an empty local DB, then again
    //     after PowerSync syncs. We resolve on the re-emission (firstWatchFired
    //     guard) so we don't unblock on a stale empty result.
    // The 8s timeout is the safety ceiling for offline or genuinely empty catalogs.
    let packCatalogResolve!: () => void;
    const packCatalogReady = new Promise<void>(r => {
      packCatalogResolve = r;
    });
    let firstPackWatchFired = false;

    let allReady = false;
    Promise.race([
      Promise.all([streakReady, packCatalogReady]).then(() => {
        allReady = true;
      }),
      new Promise<void>(resolve => setTimeout(resolve, 8000)),
    ])
      .catch(() => {})
      .then(() => {
        startupTimer.log(
          `splash hiding — ${allReady ? 'all ready' : '8s timeout fired'}`,
        );
        BootSplash.hide({ fade: true }).catch(() => {});
      });

    useSettingsStore.getState().initialize();
    startupTimer.log('settings store initialized');

    // Open local SQLite immediately — fetchCredentials() retries once auth resolves
    db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 });
    startupTimer.log('powersync db.connect called');

    const watchController = new AbortController();

    db.watch(
      'SELECT id FROM packs WHERE published = 1 LIMIT 1',
      [],
      {
        onResult: async result => {
          const hasData = (result.rows?._array ?? []).length > 0;
          if (hasData || firstPackWatchFired) {
            // Resolve on the first non-empty emission (warm start) or on any
            // re-emission after the first (cold start: first was empty local
            // data, this one is post-sync). Either way the catalog is now as
            // populated as it's going to be at launch time.
            packCatalogResolve();
          }
          firstPackWatchFired = true;

          await useEntitlementsStore.getState().loadPackCatalog();
          const { packCatalog, entitlements } = useEntitlementsStore.getState();
          runTieredPrefetch(packCatalog, entitlements);
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
          runTieredPrefetch(packCatalog, state.entitlements);
        }
      },
    );

    // When the app returns to the foreground, refresh the session so that a
    // confirmed email is picked up immediately (onAuthStateChange fires if
    // the user's is_anonymous flag changed while the app was in background).
    const appStateSub = AppState.addEventListener('change', async nextState => {
      if (nextState === 'active') {
        await supabase.auth.refreshSession();
        const { packCatalog, entitlements } = useEntitlementsStore.getState();
        runTieredPrefetch(packCatalog, entitlements);
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
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
