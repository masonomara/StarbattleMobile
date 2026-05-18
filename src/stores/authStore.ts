import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { adapty } from 'react-native-adapty';

type AuthState = {
  session: Session | null;
  user: User | null;
  isAnonymous: boolean;
  initialize: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isAnonymous: true,

  initialize: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      const isAnonymous = session.user.is_anonymous ?? true;
      set({ session, user: session.user, isAnonymous });
      if (!isAnonymous) {
        await adapty.identify(session.user.id);
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
    set({ user: data.user, isAnonymous: false });
    await adapty.identify(data.user.id);
  },

  signInWithApple: async () => {
    const { appleAuth } = await import(
      '@invertase/react-native-apple-authentication'
    );
    const credential = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken!,
    });
    if (error) throw error;
    set({ session: data.session, user: data.user, isAnonymous: false });
    if (data.user) await adapty.identify(data.user.id);
  },

  signOut: async () => {
    await supabase.auth.signOut();
    await adapty.logout();
    set({ session: null, user: null, isAnonymous: true });
    await get().signInAnonymously();
  },
}));
