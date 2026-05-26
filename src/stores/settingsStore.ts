import { create } from 'zustand';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../storage';
import type { UserSettings } from '../types.ts';

type SettingsState = {
  settings: UserSettings;
  settingsModalVisible: boolean;
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  openSettings: () => void;
  closeSettings: () => void;
};

export const useSettingsStore = create<SettingsState>(set => ({
  settings: DEFAULT_SETTINGS,
  settingsModalVisible: false,

  initialize: () => {
    set({ settings: getSettings() });
  },

  openSettings: () => set({ settingsModalVisible: true }),
  closeSettings: () => set({ settingsModalVisible: false }),

  updateSettings: update => {
    saveSettings(update);
    set(state => ({ settings: { ...state.settings, ...update } }));
  },
}));
