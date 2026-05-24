import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../supabase';
import { adapty } from 'react-native-adapty';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../config';

type SetState = (partial: Partial<{ session: Session | null; user: User | null; isAnonymous: boolean }>) => void;

async function applySignIn(set: SetState, session: Session | null, user: User): Promise<void> {
  set({ session, user, isAnonymous: false });
  await adapty.identify(user.id);
}

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
};

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
      if (!isAnonymous) {
        await adapty.identify(initialSession.user.id);
      }
    } else {
      await get().signInAnonymously();
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      const isAnonymous = session?.user?.is_anonymous ?? true;
      set({ session, user: session?.user ?? null, isAnonymous });
      if (session && !isAnonymous) {
        await adapty.identify(session.user.id);
      }
      if (event === 'SIGNED_OUT') {
        await adapty.logout();
      }
    });
  },

  signInAnonymously: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    set({ session: data.session, user: data.user, isAnonymous: true });
  },

  signUpWithEmail: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.updateUser({ email, password });
    if (error) throw error;
    if (data.user) await applySignIn(set, null, data.user);
  },

  signInWithEmail: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applySignIn(set, data.session, data.user);
  },

  signInWithGoogle: async () => {
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
    const { appleAuth } = await import('@invertase/react-native-apple-authentication');
    const credential = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken!,
    });
    if (error) throw error;
    await applySignIn(set, data.session, data.user);
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
