// NOTE: Settings persistence (MMKV) is intentionally inlined here rather than
// in a separate storage.ts. getSettings() and saveSettings() are private to this
// module — nothing outside the store should read or write settings directly.
// This keeps the persistence layer as an implementation detail of the store.
import { create } from 'zustand';
import { settingsStorage as storage } from '../mmkv';
import type { UserSettings } from '../types';

const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
  autoXRegions: false,
  highlightErrors: true,
  coloredRegions: false,
  alwaysShowTimer: false,
  alwaysShowToolbar: false,
  theme: 'system',
  palette: 'original',
  haptics: true,
};

function getSettings(): UserSettings {
  const json = storage.getString(SETTINGS_KEY);
  if (!json) return DEFAULT_SETTINGS;
  try {
    // Spread over DEFAULT_SETTINGS so any new keys added later get their
    // default values even when the stored JSON predates them.
    return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
  } catch {
    // Corrupt MMKV value — start fresh rather than crashing.
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(update: Partial<UserSettings>): void {
  const current = getSettings();
  storage.set(SETTINGS_KEY, JSON.stringify({ ...current, ...update }));
}

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
