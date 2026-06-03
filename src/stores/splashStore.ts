import { create } from 'zustand';

type SplashState = {
  homeReady: boolean;
  markHomeReady: () => void;
};

// Set by HomeScreen once first-screen data is loaded (or a safety timeout).
// App.tsx renders the FauxSplash overlay above the navigator based on this, so
// the overlay covers the navigator's async native mount with no white flash.
export const useSplashStore = create<SplashState>(set => ({
  homeReady: false,
  markHomeReady: () => set({ homeReady: true }),
}));
