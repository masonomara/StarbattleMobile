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
import { getStreakPack, getPuzzlesForPack } from './src/packs';
import { supabase } from './src/supabase';

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
    getStreakPack('daily');
    getStreakPack('weekly');
    getStreakPack('monthly');

    // As soon as the pack catalog is known, pre-warm every pack's JSON file
    // so HomeScreen thumbnail reads hit the in-memory cache instead of disk.
    const unsubPacks = useEntitlementsStore.subscribe(
      s => s.packCatalog,
      catalog => {
        if (catalog.length === 0) return;
        for (const pack of catalog) getPuzzlesForPack(pack.id);
        unsubPacks();
      },
    );

    useSettingsStore.getState().initialize();

    // Open local SQLite immediately — fetchCredentials() retries once auth resolves
    db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 });

    const watchController = new AbortController();

    db.watch(
      'SELECT id FROM packs WHERE published = 1 LIMIT 1',
      [],
      {
        onResult: () => {
          useEntitlementsStore.getState().loadPackCatalog();
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

    useAuthStore.getState().initialize();

    // When the app returns to the foreground, refresh the session so that a
    // confirmed email is picked up immediately (onAuthStateChange fires if
    // the user's is_anonymous flag changed while the app was in background).
    const appStateSub = AppState.addEventListener('change', async nextState => {
      if (nextState === 'active') {
        await supabase.auth.refreshSession();
      }
    });

    // Handle deep links that arrive while the app is already running
    // (e.g. tapping a password-reset email when the app is in the background).
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      useAuthStore.getState().handleDeepLink(url);
    });

    return () => {
      authUnsub();
      unsubPacks();
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
