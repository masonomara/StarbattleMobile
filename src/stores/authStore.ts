import { create } from 'zustand';

type AuthState = {
  isAnonymous: boolean;
  isInitialized: boolean;
};

export const useAuthStore = create<AuthState>(() => ({
  isAnonymous: true,
  isInitialized: false,
}));
