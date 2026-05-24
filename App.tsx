import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { useTheme } from './src/hooks/useTheme';
import { rgba } from './src/themes/ansi';
import { useAuthStore } from './src/stores/authStore';
import { useSettingsStore } from './src/stores/settingsStore';
import { useEntitlementsStore } from './src/stores/entitlementsStore';
import { db } from './src/powersync/AppSchema';
import { SupabaseConnector } from './src/powersync/Connector';
import { adapty } from 'react-native-adapty';
import { ADAPTY_SDK_KEY } from './src/config';

export default function App() {
  const theme = useTheme();

  useEffect(() => {
    adapty.activate(ADAPTY_SDK_KEY).catch(() => {
      // Swallow "already activated" error on Fast Refresh in dev
    });

    useSettingsStore.getState().initialize();

    // Open local SQLite immediately — fetchCredentials() retries once auth resolves
    db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 });

    db.watch('SELECT id FROM packs WHERE published = 1 LIMIT 1', [], {
      onResult: () => {
        useEntitlementsStore.getState().loadPackCatalog();
      },
    });

    db.watch('SELECT * FROM user_entitlements LIMIT 1', [], {
      onResult: () => {
        const userId = useAuthStore.getState().user?.id;
        if (userId) useEntitlementsStore.getState().loadEntitlements(userId);
      },
    });

    useAuthStore.getState().initialize();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: rgba(theme.isDark ? theme.black : theme.white, 1) }}>
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
