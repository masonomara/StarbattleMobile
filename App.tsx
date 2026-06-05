import React, { useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { useTheme } from './src/hooks/useTheme';
import { useAuthStore } from './src/stores/authStore';
import { useSettingsStore, hasSeenTutorial } from './src/stores/settingsStore';
import { useEntitlementsStore } from './src/stores/entitlementsStore';
import { startupTimer } from './src/utils/startupTimer';
import { db } from './src/powersync/AppSchema';
import { PowerSyncContext } from '@powersync/react-native';
import { SupabaseConnector } from './src/powersync/Connector';
import { adapty } from 'react-native-adapty';
import { ADAPTY_SDK_KEY } from './src/config';
import { getStreakPack, loadPackHints } from './src/packs';
import { prefetchAllCatalog } from './src/packs/prefetch';
import { supabase } from './src/supabase';
import { FauxSplash } from './src/components/FauxSplash';
import { useSplashStore } from './src/stores/splashStore';
import type { PackCatalogItem } from './src/types';

function runTieredPrefetch(catalog: PackCatalogItem[]): void {
  prefetchAllCatalog(catalog).catch(() => {});
}

export default function App() {
  useEffect(() => {
    startupTimer.log('App mounted — first render complete');
  }, []);

  const theme = useTheme();
  const homeReady = useSplashStore(s => s.homeReady);
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    startupTimer.log('setup effect start');

    // First launch lands on the tutorial (no synced data needed) — lift the
    // splash immediately instead of waiting on first sync; prefetch runs below.
    if (!hasSeenTutorial()) useSplashStore.getState().markHomeReady();

    adapty.activate(ADAPTY_SDK_KEY).catch(() => {
      // Swallow "already activated" error on Fast Refresh in dev
    });
    startupTimer.log('adapty.activate called');

    // Auth must resolve (including the signInAnonymously() fallback) before any
    // Supabase Storage download fires. The packs bucket policy requires the
    // authenticated role; without a user JWT every download returns 404.
    startupTimer.log('auth initialize called');
    const authReady = useAuthStore.getState().initialize();

    // Warm streak packs so HomeScreen's previews are cached when it mounts.
    authReady
      .then(() =>
        Promise.all([
          getStreakPack('daily'),
          getStreakPack('weekly'),
          getStreakPack('monthly'),
          loadPackHints('daily').catch(() => []),
          loadPackHints('weekly').catch(() => []),
          loadPackHints('monthly').catch(() => []),
        ]),
      )
      .then(() => startupTimer.log('streak packs resolved'))
      .catch(() => {});

    // Safety ceiling: reveal the app after 10s even if first-screen data stalls.
    // The native splash and its JS twin (FauxSplash) stay up until homeReady.
    const splashSafetyTimer = setTimeout(
      () => useSplashStore.getState().markHomeReady(),
      10000,
    );

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
        onResult: async () => {
          await useEntitlementsStore.getState().loadPackCatalog();
          const { packCatalog } = useEntitlementsStore.getState();
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
        runTieredPrefetch(packCatalog);
      }
    });

    // Handle deep links that arrive while the app is already running
    // (e.g. tapping a password-reset email when the app is in the background).
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      useAuthStore.getState().handleDeepLink(url);
    });

    return () => {
      clearTimeout(splashSafetyTimer);
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
      <PowerSyncContext.Provider value={db}>
        <SafeAreaProvider>
          <Navigation />
        </SafeAreaProvider>
        {splashVisible && (
          <FauxSplash ready={homeReady} onHidden={() => setSplashVisible(false)} />
        )}
      </PowerSyncContext.Provider>
    </GestureHandlerRootView>
  );
}
