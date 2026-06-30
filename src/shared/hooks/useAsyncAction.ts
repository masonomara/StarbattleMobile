import { useState, useCallback } from 'react';
import i18n from '../lib/i18n';
import { UserFacingError, CancelledError } from '../lib/errors';

function toUserMessage(e: unknown): string | null {
  // Explicit cancellation (e.g. dismissed purchase sheet) — show nothing.
  if (e instanceof CancelledError) return null;

  const msg = e instanceof Error ? e.message : String(e);

  // User-cancelled flows — show nothing
  if (
    msg.includes('SIGN_IN_CANCELLED') ||
    msg.includes('12501') ||            // Google: user cancelled
    msg.includes('1001') ||             // Apple: user cancelled
    msg.includes('The user canceled')
  ) return null;

  // Our own errors from payments.ts / authStore.ts / packs already carry a
  // localized, user-presentable message — show it verbatim. Tagged via the
  // UserFacingError class so this works regardless of the active language
  // (substring matching on English would break once the text is translated).
  if (e instanceof UserFacingError) return e.message;

  // The branches below match raw SDK output, which Supabase/Google/Apple always
  // emit in English regardless of app language — so the .includes() keys stay
  // English while the returned message is localized.

  // Supabase auth
  if (msg.includes('Invalid login credentials')) return i18n.t('errors.incorrectCredentials');
  if (msg.includes('Email not confirmed')) return i18n.t('errors.confirmEmail');
  if (msg.includes('User already registered')) return i18n.t('errors.accountExists');
  if (msg.includes('Password should be at least')) return i18n.t('errors.passwordLength');
  if (msg.includes('invalid format') || msg.includes('valid email')) return i18n.t('errors.invalidEmail');
  if (msg.includes('signup disabled')) return i18n.t('errors.signupUnavailable');
  if (msg.includes('Email rate limit exceeded')) return i18n.t('errors.tooManyAttempts');

  // Network / connectivity
  if (msg.includes('NETWORK_ERROR') || msg.includes('network request failed') || msg.includes('fetch failed')) {
    return i18n.t('errors.network');
  }

  // Supabase internal (RLS, constraints, Postgres) — never show raw to users
  if (
    msg.includes('row-level security') ||
    msg.includes('violates') ||
    msg.includes('duplicate key') ||
    msg.includes('foreign key')
  ) return i18n.t('errors.generic');

  // Generic fallback for any other third-party SDK message
  return i18n.t('errors.generic');
}

export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>, onSuccess?: () => void) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
      onSuccess?.();
    } catch (e) {
      // Log everything including user cancellations — cancellations return null
      // from toUserMessage() so no error is shown, but the log helps debugging.
      console.error('[useAsyncAction]', e);
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, run };
}
