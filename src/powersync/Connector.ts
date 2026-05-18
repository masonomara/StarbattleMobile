import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/react-native';

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    throw new Error('Not implemented — configure in Phase 2');
  }

  async uploadData(_database: AbstractPowerSyncDatabase): Promise<void> {
    throw new Error('Not implemented — configure in Phase 2');
  }
}
