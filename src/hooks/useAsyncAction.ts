import { useState, useCallback } from 'react';

function toUserMessage(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);

  // User-cancelled flows — show nothing
  if (
    msg.includes('SIGN_IN_CANCELLED') ||
    msg.includes('12501') ||            // Google: user cancelled
    msg.includes('1001') ||             // Apple: user cancelled
    msg.includes('The user canceled')
  ) return null;

  // Our own already-friendly messages from payments.ts / authStore.ts
  if (
    msg.includes('Purchase did not complete') ||
    msg.includes('Account deletion failed') ||
    msg.includes('product not found') ||
    msg.includes('Progress migration failed') ||
    msg.includes('hasn\'t synced yet')
  ) return msg;

  // Supabase auth
  if (msg.includes('Invalid login credentials')) return 'Incorrect email or password.';
  if (msg.includes('Email not confirmed')) return 'Please confirm your email address before signing in.';
  if (msg.includes('User already registered')) return 'An account with this email already exists.';
  if (msg.includes('Password should be at least')) return 'Password must be at least 6 characters.';
  if (msg.includes('invalid format') || msg.includes('valid email')) return 'Please enter a valid email address.';
  if (msg.includes('signup disabled')) return 'Sign-up is currently unavailable. Please try again later.';
  if (msg.includes('Email rate limit exceeded')) return 'Too many attempts. Please wait a moment and try again.';

  // Network / connectivity
  if (msg.includes('NETWORK_ERROR') || msg.includes('network request failed') || msg.includes('fetch failed')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Supabase internal (RLS, constraints, Postgres) — never show raw to users
  if (
    msg.includes('row-level security') ||
    msg.includes('violates') ||
    msg.includes('duplicate key') ||
    msg.includes('foreign key')
  ) return 'Something went wrong. Please try again.';

  // Generic fallback for any other third-party SDK message
  return 'Something went wrong. Please try again.';
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
      console.error('[useAsyncAction]', e);
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, run };
}
