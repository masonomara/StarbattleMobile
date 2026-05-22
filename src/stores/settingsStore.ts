import { create } from 'zustand';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../storage';
import type { UserSettings } from '../types/state';
import { usePuzzleStore } from '../store';

type SettingsState = {
  settings: UserSettings;
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
};

export const useSettingsStore = create<SettingsState>(set => ({
  settings: DEFAULT_SETTINGS,

  initialize: () => {
    set({ settings: getSettings() });
  },

  updateSettings: update => {
    saveSettings(update);
    set(state => {
      const next = { ...state.settings, ...update };
      const autoXChanged =
        'autoXNeighbors' in update ||
        'autoXRowsCols' in update ||
        'autoXRegions' in update;
      if (autoXChanged) {
        usePuzzleStore.getState().recomputeAutoMarks();
      }
      return { settings: next };
    });
  },
}));
