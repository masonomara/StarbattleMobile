import { create } from 'zustand';
import { Linking } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../supabase';
import { adapty } from 'react-native-adapty';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../config';

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
  await adapty.identify(user.id);
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
        await adapty.identify(initialSession.user.id);
      }
    } else {
      await get().signInAnonymously();
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        set({ session, user: session?.user ?? null, isAnonymous: false, isPasswordRecovery: true });
        if (session) await adapty.identify(session.user.id);
        return;
      }
      if (event === 'USER_UPDATED' && get().isPasswordRecovery) {
        set({ isPasswordRecovery: false });
      }
      const isAnonymous = session?.user?.is_anonymous ?? true;
      set({ session, user: session?.user ?? null, isAnonymous });
      if (session && !isAnonymous) {
        await adapty.identify(session.user.id);
      }
      if (event === 'SIGNED_OUT') {
        await adapty.logout();
      }
    });

    // Handle deep links that launched the app cold (e.g. password recovery email).
    Linking.getInitialURL()
      .then(url => { if (url) get().handleDeepLink(url); })
      .catch(() => {});
  },

  handleDeepLink: async (url: string) => {
    if (!url.includes('type=recovery')) return;
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
  },

  signInWithEmail: async (email: string, password: string) => {
    // Clean up the transient anonymous session so it doesn't become an orphan.
    if (get().isAnonymous) {
      try { await supabase.rpc('delete_user'); } catch (_) {}
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applySignIn(set, data.session, data.user);
  },

  signInWithGoogle: async () => {
    if (get().isAnonymous) {
      try { await supabase.rpc('delete_user'); } catch (_) {}
    }
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!response.data?.idToken) throw new Error('No Google ID token');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: response.data.idToken,
    });
    if (error) throw error;
    await applySignIn(set, data.session, data.user);
  },

  signInWithApple: async () => {
    if (get().isAnonymous) {
      try { await supabase.rpc('delete_user'); } catch (_) {}
    }
    const { appleAuth } = await import('@invertase/react-native-apple-authentication');
    const credential = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL],
    });
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken!,
    });
    if (error) throw error;
    await applySignIn(set, data.session, data.user);
  },

  requestPasswordReset: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'starbattle://reset-password',
    });
    if (error) throw error;
  },

  setNewPassword: async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    set({ isPasswordRecovery: false });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    await adapty.logout();
    set({ session: null, user: null, isAnonymous: true });
    await get().signInAnonymously();
  },

  // Permanently deletes the account and all associated server-side data.
  //
  // REQUIRED: Run this SQL once in the Supabase SQL editor to enable deletion:
  //
  //   CREATE OR REPLACE FUNCTION public.delete_user()
  //   RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
  //   AS $$ BEGIN DELETE FROM auth.users WHERE id = auth.uid(); END; $$;
  //
  //   GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
  //
  // The CASCADE on auth.users propagates to puzzle_progress, streaks,
  // user_entitlements, and streak_archive automatically.
  deleteAccount: async () => {
    const { error } = await supabase.rpc('delete_user');
    if (error) throw new Error('Account deletion failed. Please try again or contact support.');
    try { await adapty.logout(); } catch (_) {}
    set({ session: null, user: null, isAnonymous: true });
    await get().signInAnonymously();
  },
}));
