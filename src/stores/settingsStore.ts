import { create } from 'zustand';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../storage';
import type { UserSettings } from '../types';

type SettingsState = {
  settings: UserSettings;
  settingsModalVisible: boolean;
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  openSettings: () => void;
  closeSettings: () => void;
};

export const useSettingsStore = create<SettingsState>(set => ({
  // Start with defaults so the UI never renders with undefined settings
  // while the synchronous MMKV read runs in initialize().
  settings: DEFAULT_SETTINGS,
  settingsModalVisible: false,

  // Synchronous — getSettings() reads from MMKV which is always available
  // on the JS thread without async I/O. Call once during app startup.
  initialize: () => {
    set({ settings: getSettings() });
  },

  openSettings: () => set({ settingsModalVisible: true }),
  closeSettings: () => set({ settingsModalVisible: false }),

  // Writes to MMKV first, then updates the store. Order matters: if the app
  // crashes between the two operations the persisted value stays correct.
  updateSettings: update => {
    saveSettings(update);
    set(state => ({ settings: { ...state.settings, ...update } }));
  },
}));
