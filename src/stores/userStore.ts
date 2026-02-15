import { create } from 'zustand';
import {
  getSettings,
  saveSettings,
  getProgress as storageGetProgress,
  saveProgress as storageSaveProgress,
  computeCompletedCount,
} from '../storage';
import type { UserSettings, Progress } from '../types/state';

type UserState = {
  settings: UserSettings;
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  getProgress: (puzzleId: string) => Progress | null;
  saveProgress: (progress: Progress) => void;
  getCompletedCount: (packId: string, total: number) => number;
};

export const useUserStore = create<UserState>((set) => ({
  settings: getSettings(),

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

  getProgress: (puzzleId: string) => {
    return storageGetProgress(puzzleId);
  },

  saveProgress: (progress: Progress) => {
    storageSaveProgress(progress);
  },

  getCompletedCount: (packId: string, total: number) => {
    return computeCompletedCount(packId, total);
  },
}));
