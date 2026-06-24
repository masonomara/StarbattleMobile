import { create } from 'zustand';
import { Linking } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../lib/supabase';
import { adapty } from 'react-native-adapty';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../lib/config';
import { startupTimer } from '../lib/startupTimer';
import { db } from '../../powersync/AppSchema';
import { SupabaseConnector } from '../../powersync/Connector';
import { useEntitlementsStore } from './entitlementsStore';
import i18n from '../lib/i18n';
import { UserFacingError } from '../lib/errors';

type AuthState = {
  session: Session | null;
  user: User | null;
  isAnonymous: boolean;
  initialize: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPasswordWithOtp: (email: string, token: string, newPassword: string) => Promise<void>;
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
//
// Wiping local PowerSync is REQUIRED here, not optional: the named user's rows
// (puzzle_progress, streaks, entitlements) live in local SQLite and are NOT
// removed by supabase.auth.signOut(). Without disconnectAndClear the new
// anonymous user would inherit the previous account's progress locally — that
// progress must stay in the account, not leak to the signed-out device. We
// rebuild for the new anon id so its (empty) state syncs down before the UI
// reads it.
async function resetToAnonymous(set: SetState, get: () => AuthState): Promise<void> {
  set({ session: null, user: null, isAnonymous: true });
  try {
    await get().signInAnonymously();
    const anonId = get().user?.id;
    if (anonId) await reconnectPowerSync(anonId);
  } catch {}
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
      throw new UserFacingError(i18n.t('errors.offline'));
    }
    const uploadError = db.currentStatus.dataFlowStatus?.uploadError;
    if (uploadError) {
      throw new UserFacingError(i18n.t('errors.syncFailed'));
    }

    await new Promise<void>(resolve => setTimeout(resolve, 500));
  }
  throw new UserFacingError(i18n.t('errors.syncTimeout'));
}

// Invokes the server-side merge Edge Function.
// Errors surface to the caller — failures are NOT swallowed because the anon
// user is still intact at this point, so a retry is safe.
async function migrateAnonProgress(anonId: string, anonToken: string): Promise<void> {
  const { error } = await supabase.functions.invoke('migrate-anon-account', {
    body: { anonId, anonToken },
  });
  if (error)
    throw new UserFacingError(
      i18n.t('errors.migrationFailed', { message: error.message }),
    );
}

// Wipes the local PowerSync database and rebuilds it for the given user, then
// loads that user's entitlements. Called after a sign-in merge (rebuild for the
// named user) and after sign-out/delete (rebuild for the fresh anon user).
// Prevents one identity's rows from coexisting with another's locally and
// ensures the UI reads the correct data before it becomes visible.
async function reconnectPowerSync(userId: string): Promise<void> {
  await db.disconnectAndClear();
  await db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 });
  await db.waitForFirstSync();
  await useEntitlementsStore.getState().loadEntitlements(userId);
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
      if (event === 'USER_UPDATED') {
        // Do NOT derive isAnonymous here. Supabase fires USER_UPDATED after
        // updateUser() during the pending-email-confirmation window, at which
        // point is_anonymous may already read false even though the email has
        // not been confirmed. isAnonymous is only updated on SIGNED_IN (which
        // fires when the confirmation link is clicked and setSession() runs).
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
    // Password recovery does NOT use deep links — it's an in-app OTP code flow
    // (see requestPasswordReset / resetPasswordWithOtp). Only signup and
    // email_change confirmations arrive here.
    if (!url.includes('type=signup') && !url.includes('type=email_change')) return;

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
    if (tokenHash && (otpType === 'signup' || otpType === 'email_change')) {
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
      // The nonce is REQUIRED. invertase enables nonces by default (nonceEnabled),
      // so it sends SHA256(credential.nonce) to Apple and Apple embeds that hash as
      // the identity token's `nonce` claim. Our Supabase project keeps Apple's
      // skip_nonce_check = false, so gotrue re-hashes whatever nonce we pass and
      // compares it to that claim. Omitting it makes validation fail on EVERY iOS
      // device with an opaque error — which is exactly what App Review hit. Pass the
      // raw credential.nonce; gotrue hashes it to match the token.
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: credential.nonce,
      });
      if (error) throw error;
      return { session: data.session, user: data.user };
    });
  },

  // Sends a 6-digit recovery code to the user's email. The "Reset Password"
  // email template must use {{ .Token }} (not {{ .ConfirmationURL }}) so the
  // email carries a code rather than a link — the whole flow stays in-app.
  requestPasswordReset: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },

  // Completes the in-app reset: verifies the emailed code, sets the new
  // password, then runs the same migration + PowerSync reconnect as a normal
  // sign-in so the recovered account's data actually loads on this device.
  //
  // verifyOtp + updateUser run inside withAnonMigration's doSignIn so the
  // device's anonymous id is captured BEFORE the session flips to the named
  // user — identical behavior to pressing "Sign In".
  resetPasswordWithOtp: async (email: string, token: string, newPassword: string) => {
    if (newPassword.length < 6)
      throw new UserFacingError(i18n.t('errors.passwordLength'));
    await withAnonMigration(get, set, async () => {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
      if (error) throw error;
      const { data: updated, error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;
      return { session: data.session, user: updated.user };
    });
  },

  signOut: async () => {
    // Best-effort: flush pending writes to the server while the named session
    // is still valid, so the last few moves land in the account before
    // resetToAnonymous wipes the local DB. Swallow failures (offline/timeout) —
    // sign-out must not hang or be blocked by a stuck queue. Anything that can't
    // sync offline is unavoidably lost; this just narrows that window.
    try { await drainUploadQueue(); } catch {}
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
    if (error) throw new UserFacingError(i18n.t('errors.deleteFailed'));
    try { await adapty.logout(); } catch {}
    await resetToAnonymous(set, get);
  },
}));
