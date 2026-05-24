import { create } from 'zustand';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../storage';
import type { UserSettings } from '../types.ts';
import { usePuzzleStore } from '../store';

type SettingsState = {
  settings: UserSettings;
  settingsModalVisible: boolean;
  streaksModalVisible: boolean;
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openStreaks: () => void;
  closeStreaks: () => void;
};

export const useSettingsStore = create<SettingsState>(set => ({
  settings: DEFAULT_SETTINGS,
  settingsModalVisible: false,
  streaksModalVisible: false,

  initialize: () => {
    set({ settings: getSettings() });
  },

  openSettings: () => set({ settingsModalVisible: true }),
  closeSettings: () => set({ settingsModalVisible: false }),
  openStreaks: () => set({ streaksModalVisible: true }),
  closeStreaks: () => set({ streaksModalVisible: false }),

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
