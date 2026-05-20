import { create } from 'zustand';
import { getSettings, saveSettings } from '../storage';
import type { UserSettings, Progress, Streak, StreakType } from '../types/state';

type ProgressState = {
  completedPuzzles: Set<string>;
  completedPerPack: Record<string, number>;
};

type UserState = {
  settings: UserSettings;
  progress: ProgressState;
  streaks: Streak[];
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  saveProgress: (progress: Progress) => void;
  recordStreak: (type: StreakType) => void;
};

export const useUserStore = create<UserState>(set => ({
  settings: getSettings(),
  progress: { completedPuzzles: new Set(), completedPerPack: {} },
  streaks: [
    { type: 'daily', current: 0, lastCompletedKey: '' },
    { type: 'weekly', current: 0, lastCompletedKey: '' },
    { type: 'monthly', current: 0, lastCompletedKey: '' },
  ],

  initialize: () => {
    set({ settings: getSettings() });
  },

  updateSettings: (update: Partial<UserSettings>) => {
    saveSettings(update);
    set(state => ({ settings: { ...state.settings, ...update } }));
  },

  // No-op: progress is now stored via PowerSync (src/utils/progress.ts)
  saveProgress: (_progress: Progress) => {},

  // No-op: streaks are now stored via PowerSync (src/utils/progress.ts)
  recordStreak: (_type: StreakType) => {},
}));
