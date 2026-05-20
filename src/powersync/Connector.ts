import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/react-native';
import { UpdateType } from '@powersync/react-native';
import { supabase } from '../supabase/client';
import { POWERSYNC_URL } from '../config';

const FATAL_POSTGRES_CODES = [
  /^22...$/, // Data Exception (type mismatch etc.)
  /^23...$/, // Integrity Constraint Violation (NOT NULL, FK, UNIQUE)
  /^42501$/, // Insufficient Privilege (RLS rejection)
];

function isFatal(error: { code?: string }): boolean {
  return typeof error.code === 'string' &&
    FATAL_POSTGRES_CODES.some(re => re.test(error.code!));
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    console.log('[connector] session:', session?.user?.id ?? 'null', error?.message ?? '');
    if (error || !session) throw new Error('No active session');
    console.log('[connector] endpoint:', POWERSYNC_URL);
    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      for (const op of transaction.crud) {
        const table = supabase.from(op.table);
        let result: { error: { code?: string; message: string } | null };

        switch (op.op) {
          case UpdateType.PUT:
            result = await table.upsert({ ...op.opData, id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData ?? {}).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id);
            break;
          default:
            continue;
        }

        if (result.error) throw result.error;
      }

      await transaction.complete();
    } catch (ex) {
      if (ex !== null && typeof ex === 'object' && isFatal(ex as { code?: string })) {
        await transaction.complete();
      } else {
        throw ex;
      }
    }
  }
}
