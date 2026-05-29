import { create } from 'zustand';
import { Linking } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../supabase';
import { adapty } from 'react-native-adapty';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../config';
import { startupTimer } from '../utils/startupTimer';
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

type SetState = (partial: Partial<AuthState>) => void;

async function applySignIn(set: SetState, session: Session | null, user: User): Promise<void> {
  set({ session, user, isAnonymous: false });
  try { await adapty.identify(user.id); } catch {}
}

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
async function drainUploadQueue(timeoutMs = 30_000): Promise<void> {
  // Grace period: fire-and-forget writes (e.g. recordStreak) may not have
  // entered the queue yet. Wait briefly before the first check.
  await new Promise<void>(resolve => setTimeout(resolve, 600));

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
// Errors surface to the caller — unlike the old deleteAnonymousUser, failures
// are NOT swallowed. On failure the anon user is still intact, so a retry is safe.
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

// Held at module scope so initialize() can unsubscribe the previous listener
// before attaching a new one (guards against React Fast Refresh stacking duplicates).
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
        await adapty.logout();
      }
    });
    authSubscription = subscription;

    // Handle deep links that launched the app cold (e.g. password recovery email).
    Linking.getInitialURL()
      .then(url => { if (url) get().handleDeepLink(url); })
      .catch(() => {});
  },

  handleDeepLink: async (url: string) => {
    if (!url.includes('type=recovery') && !url.includes('type=signup') && !url.includes('type=email_change')) return;
    const hashIdx = url.indexOf('#');
    if (hashIdx < 0) return;
    const params = parseUrlFragment(url.slice(hashIdx + 1));
    if (params.access_token && params.refresh_token) {
      await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
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
    const anonId = get().isAnonymous ? (get().user?.id ?? null) : null;
    const anonToken = anonId
      ? ((await supabase.auth.getSession()).data.session?.access_token ?? null)
      : null;

    // Fix A: ensure all anonymous writes have reached Supabase before the merge
    // reads them. Aborts with a user-visible error if the queue can't drain.
    if (anonId) await drainUploadQueue();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applySignIn(set, data.session, data.user);

    const namedId = data.user.id;
    if (anonId && anonToken && namedId !== anonId) {
      await migrateAnonProgress(anonId, anonToken);
    }

    // Fix B: rebuild local PowerSync DB for the named user so merged rows are
    // visible and no anon rows coexist under the named token.
    await reconnectPowerSync(namedId);
  },

  signInWithGoogle: async () => {
    const anonId = get().isAnonymous ? (get().user?.id ?? null) : null;
    const anonToken = anonId
      ? ((await supabase.auth.getSession()).data.session?.access_token ?? null)
      : null;

    // Fix A: drain before the Supabase token exchange.
    if (anonId) await drainUploadQueue();

    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!response.data?.idToken) throw new Error('No Google ID token');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: response.data.idToken,
    });
    if (error) throw error;
    await applySignIn(set, data.session, data.user);

    const namedId = data.user.id;
    if (anonId && anonToken && namedId !== anonId) {
      await migrateAnonProgress(anonId, anonToken);
    }

    // Fix B: rebuild local PowerSync DB for the named user.
    await reconnectPowerSync(namedId);
  },

  signInWithApple: async () => {
    const anonId = get().isAnonymous ? (get().user?.id ?? null) : null;
    const anonToken = anonId
      ? ((await supabase.auth.getSession()).data.session?.access_token ?? null)
      : null;

    // Fix A: drain before the Supabase token exchange.
    if (anonId) await drainUploadQueue();

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
    await applySignIn(set, data.session, data.user);

    const namedId = data.user.id;
    if (anonId && anonToken && namedId !== anonId) {
      await migrateAnonProgress(anonId, anonToken);
    }

    // Fix B: rebuild local PowerSync DB for the named user.
    await reconnectPowerSync(namedId);
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
    set({ session: null, user: null, isAnonymous: true });
    try { await get().signInAnonymously(); } catch {}
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
    set({ session: null, user: null, isAnonymous: true });
    try { await get().signInAnonymously(); } catch {}
  },
}));
