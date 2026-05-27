import React, { useEffect } from 'react';
import { AppState, Linking, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { useTheme } from './src/hooks/useTheme';
import { useAuthStore } from './src/stores/authStore';
import { useSettingsStore } from './src/stores/settingsStore';
import { useEntitlementsStore } from './src/stores/entitlementsStore';
import { syncAppIcon } from './src/utils/appIcon';
import { db } from './src/powersync/AppSchema';
import { SupabaseConnector } from './src/powersync/Connector';
import { adapty } from 'react-native-adapty';
import { ADAPTY_SDK_KEY } from './src/config';
import { getStreakPack, purgeStalePacks } from './src/packs';
import { schedulePrefetch, prefetchAllCatalog } from './src/packs/prefetch';
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
  const theme = useTheme();
  const systemScheme = useColorScheme();
  const palette = useSettingsStore(s => s.settings.palette);
  const themePref = useSettingsStore(s => s.settings.theme);

  useEffect(() => {
    const isDark =
      themePref === 'dark' ? true
      : themePref === 'light' ? false
      : systemScheme === 'dark';
    syncAppIcon(palette, isDark);
  }, [palette, themePref, systemScheme]);

  useEffect(() => {
    adapty.activate(ADAPTY_SDK_KEY).catch(() => {
      // Swallow "already activated" error on Fast Refresh in dev
    });

    // Warm streak + pack caches before HomeScreen mounts.
    // Gate the splash on streak packs (3s max) so HomeScreen renders
    // fully populated on reveal.
    const streakReady = Promise.all([
      getStreakPack('daily'),
      getStreakPack('weekly'),
      getStreakPack('monthly'),
    ]);
    Promise.race([
      streakReady,
      new Promise<void>(resolve => setTimeout(resolve, 3000)),
    ])
      .catch(() => {})
      .then(() => BootSplash.hide({ fade: true }).catch(() => {}));

    // After streak packs are warmed, kick off tiered background downloads
    // and purge stale files. At this point the catalog may not be populated
    // yet — schedulePrefetch will run streaks + whatever catalog exists.
    streakReady.catch(() => {}).then(() => {
      purgeStalePacks().catch(() => {});
      const { packCatalog, entitlements } = useEntitlementsStore.getState();
      schedulePrefetch(packCatalog, entitlements);
    });

    useSettingsStore.getState().initialize();

    // Open local SQLite immediately — fetchCredentials() retries once auth resolves
    db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 });

    const watchController = new AbortController();

    db.watch(
      'SELECT id FROM packs WHERE published = 1 LIMIT 1',
      [],
      {
        onResult: async () => {
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
        schedulePrefetch(packCatalog, entitlements);
      }
    });

    // Handle deep links that arrive while the app is already running
    // (e.g. tapping a password-reset email when the app is in the background).
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      useAuthStore.getState().handleDeepLink(url);
    });

    useAuthStore.getState().initialize();

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
