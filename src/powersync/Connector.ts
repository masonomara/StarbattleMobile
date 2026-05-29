import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/react-native';
import { UpdateType } from '@powersync/react-native';
import { supabase } from '../supabase';
import { POWERSYNC_URL } from '../config';

// Postgres error class codes that indicate the row is fundamentally malformed or
// forbidden — retrying will never succeed, so we discard the transaction rather
// than blocking the upload queue indefinitely.
//   22xxx – Data Exception: type mismatch, out-of-range value, bad format, etc.
//   23xxx – Integrity Constraint Violation: NOT NULL, FK, UNIQUE violations
//   42501 – Insufficient Privilege: RLS policy rejected the write
const FATAL_POSTGRES_CODES = [
  /^22...$/,
  /^23...$/,
  /^42501$/,
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
    if (error || !session) throw new Error('No active session');
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
        const err = ex as { code?: string; message?: string };
        // `op` here is the last processed operation — if the error came from
        // transaction.complete() rather than an individual upsert, the logged
        // op details will be the last loop iteration, not the true failure site.
        console.error(`[PowerSync] Fatal upload error (code=${err.code}) — discarded: ${err.message}`, op.table, op.op, op.id);
        await transaction.complete();
      } else {
        throw ex;
      }
    }
  }
}
