import { create } from 'zustand';
import {
  getSettings,
  saveSettings,
  saveProgress as storageSaveProgress,
} from '../storage';
import type { UserSettings, Progress } from '../types/state';

type UserState = {
  settings: UserSettings;
  progressVersion: number;
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  saveProgress: (progress: Progress) => void;
};

export const useUserStore = create<UserState>((set) => ({
  settings: getSettings(),
  progressVersion: 0,

  initialize: () => {
    const settings = getSettings();
    set({ settings });
  },

  updateSettings: (update: Partial<UserSettings>) => {
    saveSettings(update);
    set(state => ({
      settings: { ...state.settings, ...update },
    }));
  },

  saveProgress: (progress: Progress) => {
    storageSaveProgress(progress);
    set(state => ({ progressVersion: state.progressVersion + 1 }));
  },
}));
