import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { useAuthStore } from './src/stores/authStore';
import { useSettingsStore } from './src/stores/settingsStore';
import { useEntitlementsStore } from './src/stores/entitlementsStore';
import { db } from './src/powersync/database';
import { SupabaseConnector } from './src/powersync/Connector';
import { adapty } from 'react-native-adapty';
import { ADAPTY_SDK_KEY } from './src/config';

export default function App() {
  useEffect(() => {
    adapty.activate(ADAPTY_SDK_KEY).catch(() => {
      // Swallow "already activated" error on Fast Refresh in dev
    });

    useSettingsStore.getState().initialize();

    useAuthStore
      .getState()
      .initialize()
      .then(() => {
        db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 })
          .catch(e => console.error('[powersync] connect error:', e?.message ?? e));

        // Temporary: log PowerSync status to validate connection
        console.log('[powersync] initial:', JSON.stringify(db.currentStatus));
        setTimeout(() => console.log('[powersync] 3s:', JSON.stringify(db.currentStatus)), 3000);
        setTimeout(() => console.log('[powersync] 10s:', JSON.stringify(db.currentStatus)), 10000);

        db.watch('SELECT * FROM user_entitlements LIMIT 1', [], {
          onResult: () => {
            const userId = useAuthStore.getState().user?.id;
            if (userId) useEntitlementsStore.getState().loadEntitlements(userId);
          },
        });
      });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
