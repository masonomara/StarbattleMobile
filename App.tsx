import React, { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { useTheme } from './src/shared/theme/useTheme';
import { useAuthStore } from './src/stores/authStore';
import { useSettingsStore } from './src/stores/settingsStore';
import { useEntitlementsStore } from './src/stores/entitlementsStore';
import { startupTimer } from './src/shared/lib/startupTimer';
import { db } from './src/powersync/AppSchema';
import { PowerSyncContext } from '@powersync/react-native';
import { SupabaseConnector } from './src/powersync/Connector';
import { adapty } from 'react-native-adapty';
import { ADAPTY_SDK_KEY } from './src/shared/lib/config';
import { getStreakPack } from './src/packs';
import { prefetchAllCatalog } from './src/packs/prefetch';
import { supabase } from './src/supabase';
import type { PackCatalogItem } from './src/types';

function runTieredPrefetch(catalog: PackCatalogItem[]): void {
  prefetchAllCatalog(catalog).catch(() => {});
}

export default function App() {
  useEffect(() => {
    startupTimer.log('App mounted — first render complete');
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

    // Warm streak pack data so HomeScreen's previews are cached when it mounts.
    // Hints are intentionally NOT warmed here — they're only needed when a puzzle
    // opens, and PuzzleScreen loads them itself (sharing this cache), so warming
    // them at launch is pure startup cost for data the home screen never uses.
    authReady
      .then(() =>
        Promise.all([
          getStreakPack('daily'),
          getStreakPack('weekly'),
          getStreakPack('monthly'),
        ]),
      )
      .then(() => startupTimer.log('streak packs resolved'))
      .catch(() => {});

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
      </PowerSyncContext.Provider>
    </GestureHandlerRootView>
  );
}
