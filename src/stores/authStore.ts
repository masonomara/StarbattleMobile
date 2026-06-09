import { create } from 'zustand';
import { Linking } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../shared/lib/supabase';
import { adapty } from 'react-native-adapty';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../shared/lib/config';
import { startupTimer } from '../shared/lib/startupTimer';
import { db } from '../powersync/AppSchema';
import { SupabaseConnector } from '../powersync/Connector';
import { useEntitlementsStore } from './entitlementsStore';

type AuthState = {
  session: Session | null;
  user: User | null;
  isAnonymous: boolean;
  isPasswordRecovery: boolean;
  initialize: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  setNewPassword: (password: string) => Promise<void>;
  handleDeepLink: (url: string) => Promise<void>;
};

// Simplified set signature used by helper functions outside the create closure.
// We only ever pass partial objects, so the full Zustand type isn't needed.
type SetState = (partial: Partial<AuthState>) => void;

// Updates store state and identifies the user in Adapty for entitlements.
// Always sets isAnonymous: false — callers must not use this for anonymous sign-ins.
async function applySignIn(set: SetState, session: Session | null, user: User): Promise<void> {
  set({ session, user, isAnonymous: false });
  try { await adapty.identify(user.id); } catch {}
}

// Clears the named session and drops back to a fresh anonymous user.
// Used by both signOut and deleteAccount, which share identical post-action cleanup.
async function resetToAnonymous(set: SetState, get: () => AuthState): Promise<void> {
  set({ session: null, user: null, isAnonymous: true });
  try { await get().signInAnonymously(); } catch {}
}

// Parses a URL fragment string ("key=val&key2=val2") into a plain object.
// Uses a manual loop instead of URLSearchParams because React Native's URL
// implementation doesn't handle fragment params without a polyfill.
// NOTE: If a React Native polyfill for URL/URLSearchParams is ever added (e.g.
// via react-native-url-polyfill), this function can be replaced with two lines.
function parseUrlFragment(fragment: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of fragment.split('&')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      result[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1));
    }
  }
  return result;
}

// Polls the PowerSync upload queue until empty, with a timeout.
// Must complete before the Supabase session exchange so all anonymous writes
// reach Supabase before migrate_anonymous_progress reads them server-side.
// Throws if the queue can't drain (offline, upload error, or timeout).
const QUEUE_SETTLE_DELAY_MS = 600;

async function drainUploadQueue(timeoutMs = 30_000): Promise<void> {
  // Grace period: fire-and-forget writes (e.g. recordStreak) may not have
  // entered the queue yet. Wait briefly before the first check.
  await new Promise<void>(resolve => setTimeout(resolve, QUEUE_SETTLE_DELAY_MS));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stats = await db.getUploadQueueStats();
    if (stats.count === 0) return;

    // Fail fast if PowerSync has given up uploading.
    if (!db.connected) {
      throw new Error('You appear to be offline. Please check your connection and try again.');
    }
    const uploadError = db.currentStatus.dataFlowStatus?.uploadError;
    if (uploadError) {
      throw new Error('Progress sync failed. Please check your connection and try again.');
    }

    await new Promise<void>(resolve => setTimeout(resolve, 500));
  }
  throw new Error(
    'Your progress is taking too long to sync. Please check your connection and try again.',
  );
}

// Invokes the server-side merge Edge Function.
// Errors surface to the caller — failures are NOT swallowed because the anon
// user is still intact at this point, so a retry is safe.
async function migrateAnonProgress(anonId: string, anonToken: string): Promise<void> {
  const { error } = await supabase.functions.invoke('migrate-anon-account', {
    body: { anonId, anonToken },
  });
  if (error) throw new Error(`Progress migration failed: ${error.message}`);
}

// After a successful merge, wipes the local PowerSync database and rebuilds it
// for the named user. Prevents anon rows from coexisting with named-user rows
// locally and ensures the UI reads merged data before it becomes visible.
async function reconnectPowerSync(namedId: string): Promise<void> {
  await db.disconnectAndClear();
  await db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 });
  await db.waitForFirstSync();
  await useEntitlementsStore.getState().loadEntitlements(namedId);
}

// Shared wrapper for all three social/password sign-in flows.
//
// Every sign-in that could replace an anonymous session follows this sequence:
//   1. Capture anon identity before the exchange (drain queue for safety).
//   2. Run the provider-specific credential exchange (doSignIn).
//   3. Merge anonymous progress server-side if IDs differ.
//   4. Rebuild PowerSync for the named user.
//
// doSignIn is the only part that differs between email, Google, and Apple.
// If doSignIn throws, steps 3–4 are skipped and the anon session remains intact.
async function withAnonMigration(
  get: () => AuthState,
  set: SetState,
  doSignIn: () => Promise<{ session: Session | null; user: User }>,
): Promise<void> {
  const anonId = get().isAnonymous ? (get().user?.id ?? null) : null;
  // Fresh session fetch (not from store) to ensure the token is current before
  // passing it to the server-side merge function.
  const anonToken = anonId
    ? ((await supabase.auth.getSession()).data.session?.access_token ?? null)
    : null;

  // Drain before the credential exchange so all anon writes reach the server
  // before the merge Edge Function reads them.
  if (anonId) await drainUploadQueue();

  const { session, user } = await doSignIn();
  await applySignIn(set, session, user);

  const namedId = user.id;
  // Skip migration when signing into the same account that was already linked
  // to this device (namedId === anonId means no actual account switch occurred).
  if (anonId && anonToken && namedId !== anonId) {
    await migrateAnonProgress(anonId, anonToken);
  }

  await reconnectPowerSync(namedId);
}

// Held at module scope so initialize() can unsubscribe the previous listener
// before attaching a new one (guards against React Fast Refresh stacking duplicates).
// NOTE: authSubscription never gets cleaned up if initialize() is never called
// again (which is the normal production path). That is correct — the listener
// must remain active for the lifetime of the app. Fast Refresh is the only
// case where re-subscribing without clearing would stack listeners.
let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isAnonymous: true,
  isPasswordRecovery: false,

  initialize: async () => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
    });

    const {
      data: { session: initialSession },
    } = await supabase.auth.getSession();

    if (initialSession) {
      const isAnonymous = initialSession.user.is_anonymous ?? true;
      set({ session: initialSession, user: initialSession.user, isAnonymous });
      // Identify named users in Adapty for entitlement checks.
      // Can't use applySignIn() here because that always sets isAnonymous: false,
      // but we need to preserve the value derived from the existing session.
      if (!isAnonymous) {
        try { await adapty.identify(initialSession.user.id); } catch {}
      }
    } else {
      await get().signInAnonymously();
    }
    startupTimer.log(`auth check complete — ${initialSession ? 'existing session' : 'new anonymous sign-in'}`);

    authSubscription?.unsubscribe();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        set({ session, user: session?.user ?? null, isAnonymous: false, isPasswordRecovery: true });
        if (session) try { await adapty.identify(session.user.id); } catch {}
        return;
      }
      if (event === 'USER_UPDATED') {
        // Do NOT derive isAnonymous here. Supabase fires USER_UPDATED after
        // updateUser() during the pending-email-confirmation window, at which
        // point is_anonymous may already read false even though the email has
        // not been confirmed. isAnonymous is only updated on SIGNED_IN (which
        // fires when the confirmation link is clicked and setSession() runs).
        if (get().isPasswordRecovery) set({ isPasswordRecovery: false });
        set({ session, user: session?.user ?? null });
        return;
      }
      const isAnonymous = session?.user?.is_anonymous ?? true;
      set({ session, user: session?.user ?? null, isAnonymous });
      if (session && !isAnonymous) {
        try { await adapty.identify(session.user.id); } catch {}
      }
      if (event === 'SIGNED_OUT') {
        try { await adapty.logout(); } catch {}
      }
    });
    authSubscription = subscription;

    // Handle deep links that launched the app cold (e.g. password recovery email).
    // Fire-and-forget — we don't await so initialization isn't blocked.
    Linking.getInitialURL()
      .then(url => { if (url) get().handleDeepLink(url); })
      .catch(() => {});
  },

  handleDeepLink: async (url: string) => {
    // Supabase embeds the link type as a query param OR fragment param depending
    // on the flow. Checking the full URL string catches both cases.
    if (!url.includes('type=recovery') && !url.includes('type=signup') && !url.includes('type=email_change')) return;

    const hashIdx = url.indexOf('#');
    const fragment = hashIdx >= 0 ? parseUrlFragment(url.slice(hashIdx + 1)) : {};
    if (fragment.access_token && fragment.refresh_token) {
      await supabase.auth.setSession({
        access_token: fragment.access_token,
        refresh_token: fragment.refresh_token,
      });
      return;
    }

    // token_hash flow: some Supabase email templates deep-link with
    // ?token_hash=...&type=recovery instead of an implicit-grant fragment.
    const queryStart = url.indexOf('?');
    const queryEnd = hashIdx >= 0 ? hashIdx : url.length;
    const query =
      queryStart >= 0 ? parseUrlFragment(url.slice(queryStart + 1, queryEnd)) : {};
    const tokenHash = query.token_hash ?? fragment.token_hash;
    const otpType = query.type ?? fragment.type;
    if (
      tokenHash &&
      (otpType === 'recovery' || otpType === 'signup' || otpType === 'email_change')
    ) {
      await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });
    }
  },

  signInAnonymously: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    set({ session: data.session, user: data.user, isAnonymous: true });
  },

  signUpWithEmail: async (email: string, password: string) => {
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) throw error;
    // Don't set isAnonymous: false yet — wait for email confirmation.
    // onAuthStateChange fires USER_UPDATED once the link is clicked.
    // This is an in-place upgrade (same user ID) so no migration is needed.
  },

  signInWithEmail: async (email: string, password: string) => {
    await withAnonMigration(get, set, async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { session: data.session, user: data.user };
    });
  },

  signInWithGoogle: async () => {
    await withAnonMigration(get, set, async () => {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!response.data?.idToken) throw new Error('No Google ID token');
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      });
      if (error) throw error;
      return { session: data.session, user: data.user };
    });
  },

  signInWithApple: async () => {
    await withAnonMigration(get, set, async () => {
      const { appleAuth } = await import('@invertase/react-native-apple-authentication');
      // FULL_NAME is intentionally omitted — Apple only sends it on the very first
      // authorization and never again. Requesting it without storing it immediately
      // is a GDPR data-minimization violation. If a display name is ever needed,
      // prompt the user to enter one after sign-in rather than relying on Apple.
      const credential = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL],
      });
      if (!credential.identityToken) throw new Error('Apple sign-in: missing identity token');
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      return { session: data.session, user: data.user };
    });
  },

  requestPasswordReset: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'starbattle://reset-password',
    });
    if (error) throw error;
  },

  setNewPassword: async (password: string) => {
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    set({ isPasswordRecovery: false });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    try { await adapty.logout(); } catch {}
    await resetToAnonymous(set, get);
  },

  // Permanently deletes the account and all associated server-side data.
  //
  // REQUIRED: SQL function must exist in Supabase. Run once in the SQL editor:
  //
  //   CREATE OR REPLACE FUNCTION public.delete_user()
  //   RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
  //   AS $$ BEGIN DELETE FROM auth.users WHERE id = auth.uid(); END; $$;
  //   GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
  //
  // The CASCADE on auth.users propagates to puzzle_progress, streaks,
  // user_entitlements, and streak_archive automatically.
  deleteAccount: async () => {
    const { error } = await supabase.rpc('delete_user');
    if (error) throw new Error('Account deletion failed. Please try again or contact support.');
    try { await adapty.logout(); } catch {}
    await resetToAnonymous(set, get);
  },
}));
