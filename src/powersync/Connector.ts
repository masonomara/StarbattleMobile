import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/react-native';
import { UpdateType } from '@powersync/react-native';
import { supabase } from '../supabase';
import { POWERSYNC_URL } from '../shared/lib/config';

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

    // NOTE: The loop processes ops sequentially. A single fatal error in op N
    // discards the entire transaction (all ops, including successfully applied
    // ops 0..N-1). This is intentional — PowerSync transactions are atomic.
    // The fatal-code check below prevents the queue from blocking on a row
    // that will never succeed; the transaction is completed (consumed) without
    // retrying. Non-fatal errors (network, transient) re-throw so PowerSync
    // retries the whole transaction.
    let lastOp: (typeof transaction.crud)[number] | undefined;
    try {
      for (const op of transaction.crud) {
        lastOp = op;
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
        // lastOp is the last processed operation — if the error came from
        // transaction.complete() rather than an individual upsert, the logged
        // op details will be the last loop iteration, not the true failure site.
        console.error(`[PowerSync] Fatal upload error (code=${err.code}) — discarded: ${err.message}`, lastOp?.table, lastOp?.op, lastOp?.id);
        await transaction.complete();
      } else {
        throw ex;
      }
    }
  }
}
